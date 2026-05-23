import { chmod, lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { collectGuidanceIssues, readInstructionFile } from "../shared/instruction-file.js";

type TabbyConfigSnapshot = Awaited<ReturnType<typeof readInstructionFile>>;

export type TabbySystemPromptOptions = {
  configDir?: string;
};

export type InstallTabbySystemPromptResult = {
  configPath: string;
  backupPath?: string;
};

export type UninstallTabbySystemPromptResult = {
  configPath: string;
  removed: boolean;
};

export type TabbyDoctorReport = {
  configPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_TABBY_FIX_COMMAND = "tokenjuice install tabby";
const TOKENJUICE_TABBY_BEGIN = "# tokenjuice:tabby begin";
const TOKENJUICE_TABBY_END = "# tokenjuice:tabby end";
const TOKENJUICE_TABBY_ADVISORY =
  "Tabby support is beta and system-prompt based; it guides answer behavior through ~/.tabby/config.toml but does not intercept tool output.";
const TOML_ANSWER_KEY = String.raw`(?:"answer"|'answer'|answer)`;
const TOML_SYSTEM_PROMPT_KEY = String.raw`(?:"system_prompt"|'system_prompt'|system_prompt)`;
const DOTTED_ANSWER_KEY_PATTERN = new RegExp(String.raw`^\s*${TOML_ANSWER_KEY}\s*\.\s*(?:"[^"]+"|'[^']+'|[^=\s]+)\s*=`, "u");
const DOTTED_SYSTEM_PROMPT_PATTERN = new RegExp(String.raw`^\s*${TOML_ANSWER_KEY}\s*\.\s*${TOML_SYSTEM_PROMPT_KEY}(?:\s*=|\s*\.)`, "u");
const ANSWER_SYSTEM_PROMPT_TABLE_PATTERN = new RegExp(String.raw`^\s*\[\[?\s*${TOML_ANSWER_KEY}\s*\.\s*${TOML_SYSTEM_PROMPT_KEY}(?:\s*[\].])`, "u");
const INLINE_ANSWER_TABLE_PATTERN = new RegExp(String.raw`^\s*${TOML_ANSWER_KEY}\s*=\s*\{`, "u");
const ROOT_ANSWER_ASSIGNMENT_PATTERN = new RegExp(String.raw`^\s*${TOML_ANSWER_KEY}\s*=`, "u");
const ANSWER_ARRAY_TABLE_PATTERN = new RegExp(String.raw`^\s*\[\[\s*${TOML_ANSWER_KEY}\s*\]\]`, "u");
const SYSTEM_PROMPT_NAMESPACE_PATTERN = new RegExp(String.raw`^\s*${TOML_SYSTEM_PROMPT_KEY}(?:\s*=|\s*\.)`, "u");

function getTabbyConfigDir(options: TabbySystemPromptOptions = {}): string {
  return resolve(options.configDir || process.env.TABBY_CONFIG_DIR || process.env.TABBY_ROOT || process.env.TABBY_HOME || join(homedir(), ".tabby"));
}

function getDefaultConfigPath(options: TabbySystemPromptOptions = {}): string {
  return join(getTabbyConfigDir(options), "config.toml");
}

async function findTabbyConfigSymlink(configPath: string, includeInstallSidecars = false): Promise<{ label: string; path: string } | undefined> {
  const candidates = [
    { label: "config directory", path: dirname(configPath) },
    { label: "config file", path: configPath },
    ...(includeInstallSidecars
      ? [
          { label: "config backup", path: `${configPath}.bak` },
          { label: "config sidecar", path: `${configPath}.tmp` },
        ]
      : []),
  ];
  for (const candidate of candidates) {
    try {
      const stats = await lstat(candidate.path);
      if (stats.isSymbolicLink()) {
        return candidate;
      }
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        throw error;
      }
    }
  }
  return undefined;
}

async function assertNoTabbyConfigSymlink(configPath: string, operation: string, includeInstallSidecars = false): Promise<void> {
  const symlink = await findTabbyConfigSymlink(configPath, includeInstallSidecars);
  if (symlink) {
    throw new Error(`cannot safely ${operation} Tabby config through symlinked ${symlink.label} ${symlink.path}; replace it with a regular path, then rerun tokenjuice ${operation} tabby`);
  }
}

async function getExistingFileMode(filePath: string, existing: TabbyConfigSnapshot): Promise<number | undefined> {
  if (!existing.exists) {
    return undefined;
  }
  return (await lstat(filePath)).mode & 0o777;
}

async function writeTabbyConfigAtomically(filePath: string, text: string, mode?: number): Promise<void> {
  const fileMode = mode ?? 0o600;
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const tempDir = await mkdtemp(join(dirname(filePath), ".tokenjuice-"));
  const tempPath = join(tempDir, "write");
  try {
    await writeFile(tempPath, text, { encoding: "utf8", flag: "wx", mode: fileMode });
    await chmod(tempPath, fileMode);
    await rename(tempPath, filePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function chooseTabbyBackupPath(filePath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${filePath}.bak` : `${filePath}.bak.${index}`;
    try {
      const stats = await lstat(candidate);
      if (stats.isSymbolicLink()) {
        throw new Error(`cannot safely install Tabby config through symlinked config backup ${candidate}; replace it with a regular path, then rerun tokenjuice install tabby`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return candidate;
      }
      throw error;
    }
  }
}

async function writeTabbyConfigFile(
  filePath: string,
  text: string,
  existing: TabbyConfigSnapshot,
): Promise<InstallTabbySystemPromptResult> {
  const mode = await getExistingFileMode(filePath, existing);
  let backupPath: string | undefined;
  if (existing.exists) {
    backupPath = await chooseTabbyBackupPath(filePath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx", mode: mode ?? 0o600 });
    await chmod(backupPath, mode ?? 0o600);
  }
  await writeTabbyConfigAtomically(filePath, text, mode);
  return {
    configPath: filePath,
    ...(backupPath ? { backupPath } : {}),
  };
}

function getStructuralMarkerLines(text: string, marker: string): { lines: string[]; markerLines: number[] } {
  const lines = text.split("\n");
  const structureLines = getTomlStructureLines(lines);
  return {
    lines,
    markerLines: structureLines.flatMap((line, index) => (line.trim() === marker ? [index] : [])),
  };
}

function findTokenjuiceBlockLineRange(text: string): { lines: string[]; start: number; end: number } | undefined {
  const begin = getStructuralMarkerLines(text, TOKENJUICE_TABBY_BEGIN);
  const end = getStructuralMarkerLines(text, TOKENJUICE_TABBY_END);
  if (begin.markerLines.length !== 1 || end.markerLines.length !== 1 || end.markerLines[0]! < begin.markerLines[0]!) {
    return undefined;
  }
  return {
    lines: begin.lines,
    start: begin.markerLines[0]!,
    end: end.markerLines[0]! + 1,
  };
}

function hasUnsafeMarkerStructure(text: string): boolean {
  const begin = getStructuralMarkerLines(text, TOKENJUICE_TABBY_BEGIN);
  const end = getStructuralMarkerLines(text, TOKENJUICE_TABBY_END);
  const beginCount = begin.markerLines.length;
  const endCount = end.markerLines.length;
  return beginCount !== endCount || beginCount > 1 || endCount > 1 || (beginCount === 1 && end.markerLines[0]! < begin.markerLines[0]!);
}

function hasStructuralTokenjuiceMarker(text: string): boolean {
  return getStructuralMarkerLines(text, TOKENJUICE_TABBY_BEGIN).markerLines.length > 0 || getStructuralMarkerLines(text, TOKENJUICE_TABBY_END).markerLines.length > 0;
}

function hasTokenjuiceBlock(text: string): boolean {
  return Boolean(findTokenjuiceBlockLineRange(text));
}

function getTokenjuiceBlockText(text: string): string {
  const range = findTokenjuiceBlockLineRange(text);
  if (!range) {
    return "";
  }
  return range.lines.slice(range.start, range.end).join("\n");
}

function removeTokenjuiceBlock(text: string): { text: string; removed: boolean } {
  const range = findTokenjuiceBlockLineRange(text);
  if (!range) {
    return { text, removed: false };
  }

  const before = range.lines.slice(0, range.start);
  const after = range.lines.slice(range.end);
  const needsBoundaryBlank = before.length > 0 && after.length > 0 && before.at(-1) !== "" && after[0] !== "";
  const next = [...before, ...(needsBoundaryBlank ? [""] : []), ...after];
  return {
    text: next.join("\n"),
    removed: true,
  };
}

function readTableName(line: string): string | undefined {
  const match = /^\s*\[([^\]\n]+)\]\s*(?:#.*)?$/u.exec(line);
  const name = match?.[1]?.trim();
  if (name === '"answer"' || name === "'answer'") {
    return "answer";
  }
  return name;
}

type TomlMultilineState = {
  delimiter: "\"\"\"" | "'''" | undefined;
};

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findTomlMultilineClose(line: string, delimiter: "\"\"\"" | "'''", fromIndex: number): number {
  let searchIndex = fromIndex;
  while (searchIndex < line.length) {
    const closeIndex = line.indexOf(delimiter, searchIndex);
    if (closeIndex === -1) {
      return -1;
    }
    if (delimiter === "'''" || !isEscaped(line, closeIndex)) {
      return closeIndex;
    }
    searchIndex = closeIndex + 1;
  }
  return -1;
}

function updateTomlMultilineState(line: string, state: TomlMultilineState): void {
  let index = 0;
  let inBasicString = false;
  let inLiteralString = false;
  while (index < line.length) {
    if (state.delimiter) {
      const closeIndex = findTomlMultilineClose(line, state.delimiter, index);
      if (closeIndex === -1) {
        return;
      }
      index = closeIndex + state.delimiter.length;
      state.delimiter = undefined;
      continue;
    }

    const next = line.slice(index, index + 3);
    const char = line[index];
    if (inBasicString) {
      if (char === "\"" && !isEscaped(line, index)) {
        inBasicString = false;
      }
      index += 1;
      continue;
    }
    if (inLiteralString) {
      if (char === "'") {
        inLiteralString = false;
      }
      index += 1;
      continue;
    }

    if (char === "#") {
      return;
    }
    if (next === "\"\"\"" || next === "'''") {
      const closeIndex = findTomlMultilineClose(line, next, index + next.length);
      if (closeIndex === -1) {
        state.delimiter = next;
        return;
      }
      index = closeIndex + next.length;
      continue;
    }
    if (char === "\"") {
      inBasicString = true;
    } else if (char === "'") {
      inLiteralString = true;
    }
    index += 1;
  }
}

function getTomlStructureLines(lines: readonly string[]): string[] {
  const state: TomlMultilineState = { delimiter: undefined };
  return lines.map((line) => {
    const structuralLine = state.delimiter ? "" : line;
    updateTomlMultilineState(line, state);
    return structuralLine;
  });
}

function isTomlTableHeader(line: string): boolean {
  return /^\s*(?:\[[^\]\n]+\]|\[\[[^\]\n]+\]\])\s*(?:#.*)?$/u.test(line);
}

function findAnswerTableRange(lines: readonly string[]): { start: number; end: number } | undefined {
  const structureLines = getTomlStructureLines(lines);
  const start = structureLines.findIndex((line) => readTableName(line) === "answer");
  if (start === -1) {
    return undefined;
  }
  const nextTableOffset = structureLines.slice(start + 1).findIndex((line) => isTomlTableHeader(line));
  return {
    start,
    end: nextTableOffset === -1 ? lines.length : start + 1 + nextTableOffset,
  };
}

function getRootLines(lines: readonly string[]): readonly string[] {
  const structureLines = getTomlStructureLines(lines);
  const firstTableIndex = structureLines.findIndex((line) => isTomlTableHeader(line));
  return firstTableIndex === -1 ? structureLines : structureLines.slice(0, firstTableIndex);
}

function hasUserOwnedSystemPrompt(text: string): boolean {
  const lines = text.split("\n");
  const structureLines = getTomlStructureLines(lines);
  if (getRootLines(lines).some((line) => DOTTED_SYSTEM_PROMPT_PATTERN.test(line)) || structureLines.some((line) => ANSWER_SYSTEM_PROMPT_TABLE_PATTERN.test(line))) {
    return true;
  }
  const range = findAnswerTableRange(lines);
  if (!range) {
    return false;
  }
  return structureLines.slice(range.start + 1, range.end).some((line) => SYSTEM_PROMPT_NAMESPACE_PATTERN.test(line));
}

function hasDottedAnswerKey(text: string): boolean {
  return getRootLines(text.split("\n")).some((line) => DOTTED_ANSWER_KEY_PATTERN.test(line));
}

function hasInlineAnswerTable(text: string): boolean {
  return getRootLines(text.split("\n")).some((line) => INLINE_ANSWER_TABLE_PATTERN.test(line));
}

function hasRootAnswerAssignment(text: string): boolean {
  return getRootLines(text.split("\n")).some((line) => ROOT_ANSWER_ASSIGNMENT_PATTERN.test(line));
}

function hasAnswerArrayTable(text: string): boolean {
  return getTomlStructureLines(text.split("\n")).some((line) => ANSWER_ARRAY_TABLE_PATTERN.test(line));
}

const TOKENJUICE_TABBY_PROMPT = [
  "tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When asking Tabby to run or suggest terminal commands, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
].join("\n");

function createSystemPromptBlock(mode: "table" | "inline" | "dotted"): string {
  return [
    TOKENJUICE_TABBY_BEGIN,
    `${mode === "dotted" ? "answer.system_prompt" : "system_prompt"} = """`,
    TOKENJUICE_TABBY_PROMPT,
    "\"\"\"",
    TOKENJUICE_TABBY_END,
  ].join("\n");
}

function installTokenjuiceBlock(text: string): string {
  const withoutTokenjuice = removeTokenjuiceBlock(text).text.trimEnd();
  const lines = withoutTokenjuice ? withoutTokenjuice.split("\n") : [];
  const answerRange = findAnswerTableRange(lines);
  if (!answerRange) {
    if (!hasDottedAnswerKey(withoutTokenjuice)) {
      return `${withoutTokenjuice}${withoutTokenjuice ? "\n\n" : ""}[answer]\n${createSystemPromptBlock("table")}\n`;
    }
    const structureLines = getTomlStructureLines(lines);
    const firstTableIndex = structureLines.findIndex((line) => isTomlTableHeader(line));
    if (firstTableIndex === -1) {
      return `${withoutTokenjuice}${withoutTokenjuice ? "\n\n" : ""}${createSystemPromptBlock("dotted")}\n`;
    }
    const before = lines.slice(0, firstTableIndex).join("\n").trimEnd();
    const after = lines.slice(firstTableIndex).join("\n").trimStart();
    return `${before}${before ? "\n\n" : ""}${createSystemPromptBlock("dotted")}\n\n${after}\n`;
  }

  const block = createSystemPromptBlock("inline").split("\n");
  const needsLeadingBlank = answerRange.end > answerRange.start + 1 && lines[answerRange.end - 1] !== "";
  const next = [
    ...lines.slice(0, answerRange.end),
    ...(needsLeadingBlank ? [""] : []),
    ...block,
    ...((answerRange.end < lines.length && lines[answerRange.end] !== "") ? [""] : []),
    ...lines.slice(answerRange.end),
  ];
  return `${next.join("\n").trimEnd()}\n`;
}

export async function installTabbySystemPrompt(
  configPath?: string,
  options: TabbySystemPromptOptions = {},
): Promise<InstallTabbySystemPromptResult> {
  const resolvedConfigPath = configPath ?? getDefaultConfigPath(options);
  await assertNoTabbyConfigSymlink(resolvedConfigPath, "install", true);
  const existing = await readInstructionFile(resolvedConfigPath);
  if (existing.exists && hasUnsafeMarkerStructure(existing.text)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice Tabby markers in ${resolvedConfigPath}; remove the dangling marker manually, then rerun tokenjuice install tabby`,
    );
  }

  const withoutTokenjuice = removeTokenjuiceBlock(existing.text).text;
  if (hasInlineAnswerTable(withoutTokenjuice)) {
    throw new Error(
      `cannot install Tabby guidance because ${resolvedConfigPath} defines answer as an inline TOML table; convert it to an [answer] table or root answer.* dotted keys, then rerun tokenjuice install tabby`,
    );
  }
  if (hasRootAnswerAssignment(withoutTokenjuice)) {
    throw new Error(
      `cannot install Tabby guidance because ${resolvedConfigPath} defines answer as a root TOML value; convert it to an [answer] table or root answer.* dotted keys, then rerun tokenjuice install tabby`,
    );
  }
  if (hasAnswerArrayTable(withoutTokenjuice)) {
    throw new Error(
      `cannot install Tabby guidance because ${resolvedConfigPath} defines answer as an array of TOML tables; convert it to one [answer] table or root answer.* dotted keys, then rerun tokenjuice install tabby`,
    );
  }
  if (hasUserOwnedSystemPrompt(withoutTokenjuice)) {
    throw new Error(
      `cannot install Tabby guidance because ${resolvedConfigPath} already defines [answer].system_prompt; merge tokenjuice guidance manually or remove that setting, then rerun tokenjuice install tabby`,
    );
  }

  return writeTabbyConfigFile(resolvedConfigPath, installTokenjuiceBlock(existing.text), existing);
}

export async function uninstallTabbySystemPrompt(
  configPath?: string,
  options: TabbySystemPromptOptions = {},
): Promise<UninstallTabbySystemPromptResult> {
  const resolvedConfigPath = configPath ?? getDefaultConfigPath(options);
  await assertNoTabbyConfigSymlink(resolvedConfigPath, "uninstall");
  const existing = await readInstructionFile(resolvedConfigPath);
  if (!existing.exists) {
    return { configPath: resolvedConfigPath, removed: false };
  }
  if (hasUnsafeMarkerStructure(existing.text)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice Tabby markers in ${resolvedConfigPath}; remove the dangling marker manually, then rerun tokenjuice uninstall tabby`,
    );
  }
  const result = removeTokenjuiceBlock(existing.text);
  if (result.removed) {
    if (result.text.trim()) {
      await writeTabbyConfigFile(resolvedConfigPath, result.text.endsWith("\n") ? result.text : `${result.text}\n`, existing);
    } else {
      await rm(resolvedConfigPath, { force: true });
    }
  }
  return { configPath: resolvedConfigPath, removed: result.removed };
}

export async function doctorTabbySystemPrompt(
  configPath?: string,
  options: TabbySystemPromptOptions = {},
): Promise<TabbyDoctorReport> {
  const resolvedConfigPath = configPath ?? getDefaultConfigPath(options);
  const symlink = await findTabbyConfigSymlink(resolvedConfigPath);
  if (symlink) {
    return {
      configPath: resolvedConfigPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [`cannot safely inspect Tabby config through symlinked ${symlink.label} ${symlink.path}; replace it with a regular path, then rerun tokenjuice doctor tabby`],
        advisory: TOKENJUICE_TABBY_ADVISORY,
        fixCommand: TOKENJUICE_TABBY_FIX_COMMAND,
      }),
    };
  }
  const existing = await readInstructionFile(resolvedConfigPath);
  const hasMarker = hasStructuralTokenjuiceMarker(existing.text);
  if (existing.exists && hasUnsafeMarkerStructure(existing.text)) {
    return {
      configPath: resolvedConfigPath,
      hasTokenjuiceMarker: hasMarker,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: ["configured Tabby config has unmatched or duplicate tokenjuice markers"],
        advisory: TOKENJUICE_TABBY_ADVISORY,
        fixCommand: "remove unmatched tokenjuice Tabby markers from config.toml, then run tokenjuice install tabby",
      }),
    };
  }

  if (!existing.exists || !hasTokenjuiceBlock(existing.text)) {
    const issues = ["tokenjuice Tabby system prompt is not installed"];
    const usesInlineAnswerTable = existing.exists && hasInlineAnswerTable(existing.text);
    if (usesInlineAnswerTable) {
      issues.push("configured Tabby answer settings use an inline TOML table; tokenjuice will not rewrite it automatically");
    } else if (existing.exists && hasRootAnswerAssignment(existing.text)) {
      issues.push("configured Tabby answer settings use a root TOML value; tokenjuice will not rewrite it automatically");
    } else if (existing.exists && hasAnswerArrayTable(existing.text)) {
      issues.push("configured Tabby answer settings use an array of TOML tables; tokenjuice will not rewrite it automatically");
    }
    if (existing.exists && hasUserOwnedSystemPrompt(existing.text)) {
      issues.push("configured Tabby [answer].system_prompt is user-owned; tokenjuice will not overwrite it automatically");
    }
    return {
      configPath: resolvedConfigPath,
      hasTokenjuiceMarker: hasMarker,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues,
        advisory: TOKENJUICE_TABBY_ADVISORY,
        fixCommand: TOKENJUICE_TABBY_FIX_COMMAND,
      }),
    };
  }

  const collisionIssues = hasUserOwnedSystemPrompt(removeTokenjuiceBlock(existing.text).text)
    ? ["configured Tabby [answer].system_prompt also exists outside tokenjuice markers"]
    : [];
  const guidanceIssues = collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
    required: [
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Tabby system prompt is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Tabby system prompt is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Tabby system prompt still suggests the full escape hatch",
      },
    ],
  });
  const issues = [...collisionIssues, ...guidanceIssues];

  return {
    configPath: resolvedConfigPath,
    hasTokenjuiceMarker: hasMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_TABBY_ADVISORY,
      fixCommand: TOKENJUICE_TABBY_FIX_COMMAND,
    }),
  };
}
