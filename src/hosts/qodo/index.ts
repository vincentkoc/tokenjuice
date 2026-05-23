import { chmod, lstat, mkdir, mkdtemp, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

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

type QodoConfigSnapshot = Awaited<ReturnType<typeof readInstructionFile>>;

export type QodoReviewConfigOptions = {
  projectDir?: string;
};

export type InstallQodoReviewConfigResult = {
  configPath: string;
  backupPath?: string;
};

export type UninstallQodoReviewConfigResult = {
  configPath: string;
  removed: boolean;
};

export type QodoDoctorReport = {
  configPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_QODO_FIX_COMMAND = "tokenjuice install qodo";
const TOKENJUICE_QODO_BEGIN = "# tokenjuice:qodo begin";
const TOKENJUICE_QODO_END = "# tokenjuice:qodo end";
const TOKENJUICE_QODO_ADVISORY =
  "Qodo support is beta and review-guideline based; Qodo still owns pull-request review, CI feedback, and comment delivery.";
const TOML_REVIEW_AGENT_KEY = String.raw`(?:"review_agent"|'review_agent'|review_agent)`;
const TOML_ISSUES_GUIDELINES_KEY = String.raw`(?:"issues_user_guidelines"|'issues_user_guidelines'|issues_user_guidelines)`;
const TOML_COMPLIANCE_GUIDELINES_KEY = String.raw`(?:"compliance_user_guidelines"|'compliance_user_guidelines'|compliance_user_guidelines)`;
const DOTTED_ISSUES_GUIDELINES_PATTERN = new RegExp(
  String.raw`^\s*${TOML_REVIEW_AGENT_KEY}\s*\.\s*${TOML_ISSUES_GUIDELINES_KEY}\s*=`,
  "u",
);
const DOTTED_COMPLIANCE_GUIDELINES_PATTERN = new RegExp(
  String.raw`^\s*${TOML_REVIEW_AGENT_KEY}\s*\.\s*${TOML_COMPLIANCE_GUIDELINES_KEY}\s*=`,
  "u",
);
const INLINE_REVIEW_AGENT_TABLE_PATTERN = new RegExp(String.raw`^\s*${TOML_REVIEW_AGENT_KEY}\s*=\s*\{`, "u");
const ISSUES_GUIDELINES_KEY_PATTERN = new RegExp(String.raw`^\s*${TOML_ISSUES_GUIDELINES_KEY}\s*=`, "u");
const COMPLIANCE_GUIDELINES_KEY_PATTERN = new RegExp(String.raw`^\s*${TOML_COMPLIANCE_GUIDELINES_KEY}\s*=`, "u");

function getExplicitProjectDir(options: QodoReviewConfigOptions = {}): string | undefined {
  return options.projectDir || process.env.QODO_PROJECT_DIR;
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function findGitRoot(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    if (await hasGitMetadata(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function resolveProjectDir(options: QodoReviewConfigOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

function isInsideOrEqual(parentDir: string, childPath: string): boolean {
  const relativePath = relative(parentDir, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function getExpectedConfigPath(projectDir: string): string {
  return join(projectDir, ".pr_agent.toml");
}

async function realpathExistingAncestor(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
}

async function rejectConfigSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use Qodo config ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectConfigSymlink(`${filePath}.bak`);
  await rejectConfigSymlink(`${filePath}.tmp`);
}

async function rejectSymlinkPathComponents(filePath: string, projectDir: string): Promise<void> {
  const relativePath = relative(projectDir, filePath);
  const segments = relativePath.split(sep).filter(Boolean);
  let currentPath = projectDir;
  for (const segment of segments.slice(0, -1)) {
    currentPath = join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`cannot use Qodo config ${filePath}; tokenjuice will not read or write through instruction symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function resolveSafeProjectConfigPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  if (projectDir !== realProjectDir) {
    throw new Error(`cannot use Qodo config ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use Qodo config ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectConfigSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectConfigSymlink(resolvedPath);
  const expectedConfigPath = getExpectedConfigPath(projectDir);
  if (resolvedPath !== expectedConfigPath) {
    throw new Error(`cannot use Qodo config ${resolvedPath}; tokenjuice only installs the project-local .pr_agent.toml config`);
  }
  return resolvedPath;
}

async function getDefaultConfigPath(options: QodoReviewConfigOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectConfigPath(getExpectedConfigPath(projectDir), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: QodoReviewConfigOptions = {}): Promise<string> {
  return getExpectedConfigPath(await resolveProjectDir(options));
}

async function resolveConfigPath(configPath?: string, options: QodoReviewConfigOptions = {}): Promise<string> {
  if (configPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectConfigPath(configPath, projectDir, realProjectDir);
  }
  return getDefaultConfigPath(options);
}

async function getExistingFileMode(filePath: string, existing: QodoConfigSnapshot): Promise<number | undefined> {
  if (!existing.exists) {
    return undefined;
  }
  return (await lstat(filePath)).mode & 0o777;
}

async function writeQodoConfigAtomically(filePath: string, text: string, mode?: number): Promise<void> {
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

async function chooseQodoBackupPath(filePath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${filePath}.bak` : `${filePath}.bak.${index}`;
    try {
      const stats = await lstat(candidate);
      if (stats.isSymbolicLink()) {
        throw new Error(`cannot use Qodo config ${filePath}; tokenjuice will not read or write through instruction symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return candidate;
      }
      throw error;
    }
  }
}

async function writeQodoConfigFile(
  filePath: string,
  text: string,
  existing: QodoConfigSnapshot,
): Promise<InstallQodoReviewConfigResult> {
  const mode = await getExistingFileMode(filePath, existing);
  let backupPath: string | undefined;
  if (existing.exists) {
    backupPath = await chooseQodoBackupPath(filePath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx", mode: mode ?? 0o600 });
    await chmod(backupPath, mode ?? 0o600);
  }
  await writeQodoConfigAtomically(filePath, text, mode);
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
  const begin = getStructuralMarkerLines(text, TOKENJUICE_QODO_BEGIN);
  const end = getStructuralMarkerLines(text, TOKENJUICE_QODO_END);
  if (begin.markerLines.length !== 1 || end.markerLines.length !== 1 || end.markerLines[0]! < begin.markerLines[0]!) {
    return undefined;
  }
  return {
    lines: begin.lines,
    start: begin.markerLines[0]!,
    end: end.markerLines[0]! + 1,
  };
}

function hasMalformedMarkerStructure(text: string): boolean {
  const begin = getStructuralMarkerLines(text, TOKENJUICE_QODO_BEGIN);
  const end = getStructuralMarkerLines(text, TOKENJUICE_QODO_END);
  const beginCount = begin.markerLines.length;
  const endCount = end.markerLines.length;
  return beginCount !== endCount || beginCount > 1 || endCount > 1 || (beginCount === 1 && end.markerLines[0]! < begin.markerLines[0]!);
}

function hasStructuralTokenjuiceMarker(text: string): boolean {
  return getStructuralMarkerLines(text, TOKENJUICE_QODO_BEGIN).markerLines.length > 0 || getStructuralMarkerLines(text, TOKENJUICE_QODO_END).markerLines.length > 0;
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

function isTokenjuiceBlockInsideReviewAgentTable(text: string): boolean {
  const blockRange = findTokenjuiceBlockLineRange(text);
  if (!blockRange) {
    return false;
  }
  const reviewAgentRange = findReviewAgentTableRange(blockRange.lines);
  return Boolean(
    reviewAgentRange && blockRange.start > reviewAgentRange.start && blockRange.end <= reviewAgentRange.end,
  );
}

function hasTokenjuiceGuidelineAssignments(text: string): boolean {
  const blockRange = findTokenjuiceBlockLineRange(text);
  if (!blockRange) {
    return false;
  }
  const structuralBlockLines = getTomlStructureLines(blockRange.lines).slice(blockRange.start, blockRange.end);
  return (
    structuralBlockLines.some((line) => ISSUES_GUIDELINES_KEY_PATTERN.test(line)) &&
    structuralBlockLines.some((line) => COMPLIANCE_GUIDELINES_KEY_PATTERN.test(line))
  );
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
  if (name === '"review_agent"' || name === "'review_agent'") {
    return "review_agent";
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

function findReviewAgentTableRange(lines: readonly string[]): { start: number; end: number } | undefined {
  const structureLines = getTomlStructureLines(lines);
  const start = structureLines.findIndex((line) => readTableName(line) === "review_agent");
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

function hasUserOwnedGuideline(text: string): boolean {
  const lines = text.split("\n");
  if (getRootLines(lines).some((line) => DOTTED_ISSUES_GUIDELINES_PATTERN.test(line) || DOTTED_COMPLIANCE_GUIDELINES_PATTERN.test(line))) {
    return true;
  }
  const range = findReviewAgentTableRange(lines);
  if (!range) {
    return false;
  }
  return getTomlStructureLines(lines)
    .slice(range.start + 1, range.end)
    .some((line) => ISSUES_GUIDELINES_KEY_PATTERN.test(line) || COMPLIANCE_GUIDELINES_KEY_PATTERN.test(line));
}

function hasInlineReviewAgentTable(text: string): boolean {
  return getRootLines(text.split("\n")).some((line) => INLINE_REVIEW_AGENT_TABLE_PATTERN.test(line));
}

const TOKENJUICE_QODO_GUIDANCE = [
  "tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When Qodo review, ask, checks, or generated-fix workflows suggest terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
  }),
].join("\n");

function createReviewAgentGuidelinesBlock(): string {
  return [
    TOKENJUICE_QODO_BEGIN,
    'issues_user_guidelines = """',
    TOKENJUICE_QODO_GUIDANCE,
    '"""',
    'compliance_user_guidelines = """',
    TOKENJUICE_QODO_GUIDANCE,
    '"""',
    TOKENJUICE_QODO_END,
  ].join("\n");
}

function installTokenjuiceBlock(text: string): string {
  const withoutTokenjuice = removeTokenjuiceBlock(text).text.trimEnd();
  const block = createReviewAgentGuidelinesBlock().split("\n");
  const lines = withoutTokenjuice ? withoutTokenjuice.split("\n") : [];
  const range = findReviewAgentTableRange(lines);
  if (!range) {
    return `${withoutTokenjuice}${withoutTokenjuice ? "\n\n" : ""}[review_agent]\n${block.join("\n")}\n`;
  }

  const next = [
    ...lines.slice(0, range.end),
    ...(range.end > range.start + 1 ? [""] : []),
    ...block,
    ...((range.end < lines.length && lines[range.end] !== "") ? [""] : []),
    ...lines.slice(range.end),
  ];
  return `${next.join("\n").replace(/\n{3,}/gu, "\n\n").trimEnd()}\n`;
}

function removeEmptyReviewAgentTable(text: string): string {
  const trimmed = text.trimEnd();
  if (!trimmed) {
    return "";
  }
  const lines = trimmed.split("\n");
  const range = findReviewAgentTableRange(lines);
  if (!range) {
    return trimmed;
  }
  const tableBody = lines.slice(range.start + 1, range.end).join("\n").trim();
  if (tableBody) {
    return trimmed;
  }
  const next = [...lines.slice(0, range.start), ...lines.slice(range.end)];
  return next.join("\n").replace(/\n{3,}/gu, "\n\n").trimEnd();
}

export async function installQodoReviewConfig(
  configPath?: string,
  options: QodoReviewConfigOptions = {},
): Promise<InstallQodoReviewConfigResult> {
  const resolvedConfigPath = await resolveConfigPath(configPath, options);
  await rejectInstallSidecarSymlinks(resolvedConfigPath);
  const existing = await readInstructionFile(resolvedConfigPath);
  if (existing.exists && hasMalformedMarkerStructure(existing.text)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice Qodo markers in ${resolvedConfigPath}; remove the dangling marker manually, then rerun tokenjuice install qodo`,
    );
  }

  const withoutTokenjuice = removeTokenjuiceBlock(existing.text).text;
  if (hasInlineReviewAgentTable(withoutTokenjuice)) {
    throw new Error(
      `cannot install Qodo guidance because ${resolvedConfigPath} defines review_agent as an inline TOML table; convert it to a [review_agent] table, then rerun tokenjuice install qodo`,
    );
  }
  if (hasUserOwnedGuideline(withoutTokenjuice)) {
    throw new Error(
      `cannot install Qodo guidance because ${resolvedConfigPath} already defines review_agent user guidelines; merge tokenjuice guidance manually or remove those settings, then rerun tokenjuice install qodo`,
    );
  }

  return writeQodoConfigFile(resolvedConfigPath, installTokenjuiceBlock(existing.text), existing);
}

export async function uninstallQodoReviewConfig(
  configPath?: string,
  options: QodoReviewConfigOptions = {},
): Promise<UninstallQodoReviewConfigResult> {
  const resolvedConfigPath = await resolveConfigPath(configPath, options);
  const existing = await readInstructionFile(resolvedConfigPath);
  if (!existing.exists) {
    return { configPath: resolvedConfigPath, removed: false };
  }
  if (hasMalformedMarkerStructure(existing.text)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice Qodo markers in ${resolvedConfigPath}; remove the dangling marker manually, then rerun tokenjuice uninstall qodo`,
    );
  }
  const result = removeTokenjuiceBlock(existing.text);
  if (result.removed) {
    const nextText = removeEmptyReviewAgentTable(result.text);
    if (nextText.trim()) {
      await writeQodoConfigFile(resolvedConfigPath, `${nextText}\n`, existing);
    } else {
      await rm(resolvedConfigPath, { force: true });
    }
  }
  return { configPath: resolvedConfigPath, removed: result.removed };
}

export async function doctorQodoReviewConfig(
  configPath?: string,
  options: QodoReviewConfigOptions = {},
): Promise<QodoDoctorReport> {
  let resolvedConfigPath: string;
  try {
    resolvedConfigPath = await resolveConfigPath(configPath, options);
  } catch (error) {
    const aliasPath = configPath ?? (await getDefaultAliasPath(options));
    return {
      configPath: aliasPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_QODO_ADVISORY,
        fixCommand: (error as Error).message.includes("outside") || (error as Error).message.includes("only installs")
          ? "use a project-local .pr_agent.toml path, then run tokenjuice install qodo"
          : "replace symlinked Qodo config with a regular project file, then run tokenjuice install qodo",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedConfigPath);
  const hasTokenjuiceMarker = hasStructuralTokenjuiceMarker(existing.text);
  if (existing.exists && hasMalformedMarkerStructure(existing.text)) {
    return {
      configPath: resolvedConfigPath,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: ["configured Qodo review config has unmatched or duplicate tokenjuice markers"],
        advisory: TOKENJUICE_QODO_ADVISORY,
        fixCommand: "remove unmatched tokenjuice markers from .pr_agent.toml, then run tokenjuice install qodo",
      }),
    };
  }
  if (!existing.exists || !hasTokenjuiceBlock(existing.text)) {
    return {
      configPath: resolvedConfigPath,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Qodo review guidance is not installed"],
        advisory: TOKENJUICE_QODO_ADVISORY,
        fixCommand: TOKENJUICE_QODO_FIX_COMMAND,
      }),
    };
  }

  const withoutTokenjuice = removeTokenjuiceBlock(existing.text).text;
  const collisionIssues = [
    ...(hasInlineReviewAgentTable(withoutTokenjuice)
      ? ["configured Qodo review config defines review_agent as an inline TOML table outside the tokenjuice block"]
      : []),
    ...(hasUserOwnedGuideline(withoutTokenjuice)
      ? ["configured Qodo review config has user-owned review-agent guidelines outside the tokenjuice block"]
      : []),
  ];
  const placementIssues = [
    ...(!isTokenjuiceBlockInsideReviewAgentTable(existing.text)
      ? ["configured Qodo tokenjuice block is outside the [review_agent] table"]
      : []),
    ...(!hasTokenjuiceGuidelineAssignments(existing.text)
      ? ["configured Qodo tokenjuice block is missing review-agent guideline settings"]
      : []),
  ];
  const issues = [
    ...placementIssues,
    ...collisionIssues,
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Qodo review guidance is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Qodo review guidance is missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Qodo review guidance still suggests the full escape hatch",
        },
      ],
    }),
  ];

  return {
    configPath: resolvedConfigPath,
    hasTokenjuiceMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_QODO_ADVISORY,
      fixCommand: placementIssues.length > 0
        ? "move the tokenjuice Qodo block under [review_agent], then run tokenjuice install qodo"
        : collisionIssues.length > 0
        ? "remove duplicate review_agent guideline settings outside the tokenjuice block, then run tokenjuice install qodo"
        : hasMalformedMarkerStructure(existing.text)
        ? "remove unmatched tokenjuice markers from .pr_agent.toml, then run tokenjuice install qodo"
        : TOKENJUICE_QODO_FIX_COMMAND,
    }),
  };
}
