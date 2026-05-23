import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type KiloRuleOptions = {
  projectDir?: string;
};

export type InstallKiloRuleResult = {
  rulePath: string;
  configPath: string;
  backupPath?: string;
  configBackupPath?: string;
};

export type UninstallKiloRuleResult = {
  rulePath: string;
  configPath: string;
  removed: boolean;
  configUpdated: boolean;
  configBackupPath?: string;
  configBackupPaths?: string[];
};

export type KiloDoctorReport = {
  rulePath: string;
  configPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_KILO_FIX_COMMAND = "tokenjuice install kilo";
const TOKENJUICE_KILO_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_KILO_ADVISORY = "Kilo Code support is beta and rule-based; it guides command usage but does not intercept tool output.";
const TOKENJUICE_KILO_INSTRUCTION_REF = ".kilo/rules/tokenjuice.md";

function getProjectDir(options: KiloRuleOptions = {}): string {
  return options.projectDir || process.env.KILO_PROJECT_DIR || process.cwd();
}

function getDefaultRulePath(options: KiloRuleOptions = {}): string {
  return join(getProjectDir(options), TOKENJUICE_KILO_INSTRUCTION_REF);
}

function getRootConfigPath(options: KiloRuleOptions = {}): string {
  return join(getProjectDir(options), "kilo.jsonc");
}

function getDotConfigPath(options: KiloRuleOptions = {}): string {
  return join(getProjectDir(options), ".kilo", "kilo.jsonc");
}

async function getDefaultConfigPath(options: KiloRuleOptions = {}): Promise<string> {
  const dotConfigPath = getDotConfigPath(options);
  if ((await readInstructionFile(dotConfigPath)).exists) {
    return dotConfigPath;
  }
  return getRootConfigPath(options);
}

function getProjectConfigPaths(options: KiloRuleOptions = {}): string[] {
  return [getDotConfigPath(options), getRootConfigPath(options)];
}

function getInstructionRefForRule(rulePath: string, options: KiloRuleOptions = {}): string {
  const projectDir = resolve(getProjectDir(options));
  const resolvedRulePath = resolve(rulePath);
  const instructionRef = relative(projectDir, resolvedRulePath);
  if (!instructionRef || instructionRef.startsWith("..") || isAbsolute(instructionRef)) {
    throw new Error("Kilo Code rule path must be inside the project directory");
  }
  return instructionRef.split(sep).join("/");
}

const TOKENJUICE_KILO_RULE = [
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When running terminal commands through Kilo Code, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
  }),
  "",
].join("\n");

type InstructionsArrayLocation =
  | { kind: "array"; arrayStart: number; arrayEnd: number }
  | { kind: "invalid"; message: string }
  | { kind: "missing" };

type ConfigUpdateResult = {
  configPath: string;
  updated: boolean;
  backupPath?: string;
};

function skipWhitespaceAndComments(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length) {
    const char = text[cursor];
    const next = text[cursor + 1];
    if (/\s/u.test(char ?? "")) {
      cursor += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      const lineEnd = text.indexOf("\n", cursor + 2);
      cursor = lineEnd === -1 ? text.length : lineEnd + 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const blockEnd = text.indexOf("*/", cursor + 2);
      cursor = blockEnd === -1 ? text.length : blockEnd + 2;
      continue;
    }
    break;
  }
  return cursor;
}

function readJsonString(text: string, start: number): { end: number; value: string } | null {
  if (text[start] !== "\"") {
    return null;
  }

  let cursor = start + 1;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === "\\") {
      cursor += 2;
      continue;
    }
    if (char === "\"") {
      const raw = text.slice(start, cursor + 1);
      try {
        return { end: cursor, value: JSON.parse(raw) as string };
      } catch {
        return null;
      }
    }
    cursor += 1;
  }
  return null;
}

function findMatchingDelimiter(text: string, openIndex: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let cursor = openIndex;
  while (cursor < text.length) {
    cursor = skipWhitespaceAndComments(text, cursor);
    const stringValue = readJsonString(text, cursor);
    if (stringValue) {
      cursor = stringValue.end + 1;
      continue;
    }
    const char = text[cursor];
    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
    cursor += 1;
  }
  return -1;
}

function skipJsonValue(text: string, index: number, limit: number): number {
  let cursor = skipWhitespaceAndComments(text, index);
  const stringValue = readJsonString(text, cursor);
  if (stringValue) {
    return stringValue.end + 1;
  }
  if (text[cursor] === "{") {
    const objectEnd = findMatchingDelimiter(text, cursor, "{", "}");
    return objectEnd === -1 ? limit : objectEnd + 1;
  }
  if (text[cursor] === "[") {
    const arrayEnd = findMatchingDelimiter(text, cursor, "[", "]");
    return arrayEnd === -1 ? limit : arrayEnd + 1;
  }
  while (cursor < limit) {
    cursor = skipWhitespaceAndComments(text, cursor);
    const nestedString = readJsonString(text, cursor);
    if (nestedString) {
      cursor = nestedString.end + 1;
      continue;
    }
    if (text[cursor] === ",") {
      break;
    }
    cursor += 1;
  }
  return cursor;
}

function findLastSignificantChar(text: string, start: number, end: number): string | undefined {
  let cursor = start;
  let last: string | undefined;
  while (cursor < end) {
    cursor = skipWhitespaceAndComments(text, cursor);
    if (cursor >= end) {
      break;
    }
    const stringValue = readJsonString(text, cursor);
    if (stringValue) {
      last = "\"";
      cursor = stringValue.end + 1;
      continue;
    }
    last = text[cursor];
    cursor += 1;
  }
  return last;
}

function findInstructionsArray(text: string): InstructionsArrayLocation {
  const rootStart = skipWhitespaceAndComments(text, 0);
  if (text[rootStart] !== "{") {
    return { kind: "missing" };
  }
  const rootEnd = findMatchingDelimiter(text, rootStart, "{", "}");
  if (rootEnd === -1) {
    return { kind: "invalid", message: "kilo.jsonc object is not closed" };
  }

  let cursor = rootStart + 1;
  while (cursor < rootEnd) {
    cursor = skipWhitespaceAndComments(text, cursor);
    if (text[cursor] === ",") {
      cursor += 1;
      continue;
    }
    const key = readJsonString(text, cursor);
    if (!key) {
      cursor += 1;
      continue;
    }
    cursor = key.end + 1;
    cursor = skipWhitespaceAndComments(text, cursor);
    if (text[cursor] !== ":") {
      continue;
    }
    cursor = skipWhitespaceAndComments(text, cursor + 1);
    if (key.value !== "instructions") {
      cursor = skipJsonValue(text, cursor, rootEnd);
      continue;
    }

    if (text[cursor] !== "[") {
      return { kind: "invalid", message: "kilo.jsonc instructions must be an array" };
    }
    const arrayEnd = findMatchingDelimiter(text, cursor, "[", "]");
    if (arrayEnd === -1) {
      return { kind: "invalid", message: "kilo.jsonc instructions array is not closed" };
    }
    return { kind: "array", arrayStart: cursor, arrayEnd };
  }
  return { kind: "missing" };
}

function getLineIndent(text: string, index: number): string {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  return text.slice(lineStart, index).match(/^\s*/u)?.[0] ?? "";
}

function hasKiloInstructionRef(text: string, location: InstructionsArrayLocation, instructionRef: string): boolean {
  if (location.kind !== "array") {
    return false;
  }

  let cursor = location.arrayStart + 1;
  while (cursor < location.arrayEnd) {
    cursor = skipWhitespaceAndComments(text, cursor);
    if (text[cursor] === ",") {
      cursor += 1;
      continue;
    }
    const entry = readJsonString(text, cursor);
    if (entry?.value === instructionRef) {
      return true;
    }
    cursor = entry ? entry.end + 1 : skipJsonValue(text, cursor, location.arrayEnd);
  }
  return false;
}

function hasAnyInstructionsValue(text: string, location: InstructionsArrayLocation): boolean {
  if (location.kind !== "array") {
    return false;
  }
  return findLastSignificantChar(text, location.arrayStart + 1, location.arrayEnd) !== undefined;
}

function ensureKiloConfigInstruction(text: string, instructionRef: string): { text: string; updated: boolean } {
  const encodedInstructionRef = JSON.stringify(instructionRef);
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      text: `{\n  "instructions": [\n    ${encodedInstructionRef}\n  ]\n}\n`,
      updated: true,
    };
  }

  const location = findInstructionsArray(text);
  if (location.kind === "invalid") {
    throw new Error(location.message);
  }
  if (hasKiloInstructionRef(text, location, instructionRef)) {
    return { text, updated: false };
  }
  if (location.kind === "array") {
    const closeIndent = getLineIndent(text, location.arrayEnd);
    const itemIndent = `${closeIndent}  `;
    const separator = findLastSignificantChar(text, location.arrayStart + 1, location.arrayEnd) === "," ? "" : ",";
    const insertion = hasAnyInstructionsValue(text, location)
      ? `${separator}\n${itemIndent}${encodedInstructionRef}\n${closeIndent}`
      : `\n${itemIndent}${encodedInstructionRef}\n${closeIndent}`;
    return {
      text: `${text.slice(0, location.arrayEnd)}${insertion}${text.slice(location.arrayEnd)}`,
      updated: true,
    };
  }

  const rootStart = skipWhitespaceAndComments(text, 0);
  if (text[rootStart] !== "{") {
    throw new Error("kilo.jsonc must be a JSON object");
  }
  const rootEnd = findMatchingDelimiter(text, rootStart, "{", "}");
  if (rootEnd === -1) {
    throw new Error("kilo.jsonc object is not closed");
  }
  const closeIndent = getLineIndent(text, rootEnd);
  const propIndent = `${closeIndent}  `;
  const property = `"instructions": [\n${propIndent}  ${encodedInstructionRef}\n${propIndent}]`;
  const body = text.slice(rootStart + 1, rootEnd);
  const existingBody = body.startsWith("\n") ? body : `\n${propIndent}${body.trimStart()}`;
  const insertion = body.trim()
    ? `\n${propIndent}${property},${existingBody}`
    : `\n${propIndent}${property}\n${closeIndent}`;

  return {
    text: `${text.slice(0, rootStart + 1)}${insertion}${text.slice(rootEnd)}`,
    updated: true,
  };
}

function removeKiloConfigInstruction(text: string, instructionRef: string): { text: string; updated: boolean } {
  let updatedText = text;
  let updated = false;
  while (true) {
    const location = findInstructionsArray(updatedText);
    if (location.kind !== "array") {
      return { text: updatedText, updated };
    }

    let cursor = location.arrayStart + 1;
    let removed = false;
    while (cursor < location.arrayEnd) {
      cursor = skipWhitespaceAndComments(updatedText, cursor);
      if (updatedText[cursor] === ",") {
        cursor += 1;
        continue;
      }
      const entry = readJsonString(updatedText, cursor);
      if (!entry) {
        cursor = skipJsonValue(updatedText, cursor, location.arrayEnd);
        continue;
      }
      if (entry.value !== instructionRef) {
        cursor = entry.end + 1;
        continue;
      }

      let removeStart = cursor;
      let removeEnd = entry.end + 1;
      let previous = cursor - 1;
      while (previous > location.arrayStart && /\s/u.test(updatedText[previous] ?? "")) {
        previous -= 1;
      }
      const next = skipWhitespaceAndComments(updatedText, entry.end + 1);
      if (updatedText[previous] === ",") {
        removeStart = previous;
      } else if (updatedText[next] === ",") {
        removeEnd = next + 1;
      }

      updatedText = `${updatedText.slice(0, removeStart)}${updatedText.slice(removeEnd)}`.replace(/\n{3,}/gu, "\n\n");
      updated = true;
      removed = true;
      break;
    }
    if (!removed) {
      return { text: updatedText, updated };
    }
  }
}

async function writeTextFileWithBackup(filePath: string, text: string): Promise<{ backupPath?: string }> {
  const existing = await readInstructionFile(filePath);
  let backupPath: string | undefined;
  if (existing.exists) {
    backupPath = `${filePath}.bak`;
    await writeFile(backupPath, existing.text, "utf8");
  }

  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, text, "utf8");
  await rename(tempPath, filePath);
  return backupPath ? { backupPath } : {};
}

async function ensureKiloConfig(configPath: string, instructionRef: string): Promise<ConfigUpdateResult> {
  const existing = await readInstructionFile(configPath);
  const updated = ensureKiloConfigInstruction(existing.text, instructionRef);
  if (!updated.updated) {
    return { configPath, updated: false };
  }
  const written = await writeTextFileWithBackup(configPath, updated.text);
  return {
    configPath,
    updated: true,
    ...(written.backupPath ? { backupPath: written.backupPath } : {}),
  };
}

async function removeKiloConfigRef(configPath: string, instructionRef: string): Promise<ConfigUpdateResult> {
  const existing = await readInstructionFile(configPath);
  if (!existing.exists) {
    return { configPath, updated: false };
  }
  const updated = removeKiloConfigInstruction(existing.text, instructionRef);
  if (!updated.updated) {
    return { configPath, updated: false };
  }
  const written = await writeTextFileWithBackup(configPath, updated.text);
  return {
    configPath,
    updated: true,
    ...(written.backupPath ? { backupPath: written.backupPath } : {}),
  };
}

export async function installKiloRule(
  rulePath?: string,
  options: KiloRuleOptions = {},
): Promise<InstallKiloRuleResult> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const resolvedConfigPath = await getDefaultConfigPath(options);
  const instructionRef = getInstructionRefForRule(resolvedRulePath, options);
  const previousRule = await readInstructionFile(resolvedRulePath);
  const result = await writeInstructionFile(resolvedRulePath, TOKENJUICE_KILO_RULE);
  let configResult: ConfigUpdateResult;
  try {
    configResult = await ensureKiloConfig(resolvedConfigPath, instructionRef);
  } catch (error) {
    if (previousRule.exists) {
      await mkdir(dirname(resolvedRulePath), { recursive: true });
      await writeFile(resolvedRulePath, previousRule.text, "utf8");
    } else {
      await rm(resolvedRulePath, { force: true });
    }
    throw error;
  }
  return {
    rulePath: result.filePath,
    configPath: configResult.configPath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
    ...(configResult.backupPath ? { configBackupPath: configResult.backupPath } : {}),
  };
}

export async function uninstallKiloRule(rulePath?: string, options: KiloRuleOptions = {}): Promise<UninstallKiloRuleResult> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const resolvedConfigPath = await getDefaultConfigPath(options);
  const instructionRef = getInstructionRefForRule(resolvedRulePath, options);
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && !existing.text.includes(TOKENJUICE_KILO_RULE_MARKER)) {
    return {
      rulePath: resolvedRulePath,
      configPath: resolvedConfigPath,
      removed: false,
      configUpdated: false,
    };
  }
  const result = existing.exists
    ? await removeInstructionFile(resolvedRulePath)
    : { filePath: resolvedRulePath, removed: false };
  const configResults = await Promise.all(getProjectConfigPaths(options).map((configPath) => removeKiloConfigRef(configPath, instructionRef)));
  const configUpdated = configResults.some((configResult) => configResult.updated);
  const configBackupPaths = configResults.flatMap((configResult) => configResult.backupPath ? [configResult.backupPath] : []);
  const configBackupPath = configResults.find((configResult) => configResult.configPath === resolvedConfigPath)?.backupPath ?? configBackupPaths[0];
  return {
    rulePath: result.filePath,
    configPath: resolvedConfigPath,
    removed: result.removed,
    configUpdated,
    ...(configBackupPath ? { configBackupPath } : {}),
    ...(configBackupPaths.length > 0 ? { configBackupPaths } : {}),
  };
}

export async function doctorKiloRule(
  rulePath?: string,
  options: KiloRuleOptions = {},
): Promise<KiloDoctorReport> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const resolvedConfigPath = await getDefaultConfigPath(options);
  const instructionRef = getInstructionRefForRule(resolvedRulePath, options);
  const existing = await readInstructionFile(resolvedRulePath);
  const config = await readInstructionFile(resolvedConfigPath);
  const configLocation = config.exists ? findInstructionsArray(config.text) : { kind: "missing" as const };
  const configHasInstruction = config.exists && hasKiloInstructionRef(config.text, configLocation, instructionRef);
  if (!existing.exists) {
    const staleIssues = configHasInstruction
      ? ["kilo.jsonc references the tokenjuice Kilo Code rule, but the rule file is missing"]
      : [];
    return {
      rulePath: resolvedRulePath,
      configPath: resolvedConfigPath,
      ...buildInstructionDoctorReportFields({
        status: staleIssues.length > 0 ? "broken" : "disabled",
        issues: staleIssues.length > 0 ? staleIssues : ["tokenjuice Kilo Code rule is not installed"],
        advisory: TOKENJUICE_KILO_ADVISORY,
        fixCommand: TOKENJUICE_KILO_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_KILO_RULE_MARKER,
        missingIssue: "configured Kilo Code rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Kilo Code rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Kilo Code rule file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Kilo Code rule file still suggests the full escape hatch",
      },
    ],
  });
  if (!config.exists) {
    issues.push("kilo.jsonc is missing the tokenjuice instructions entry");
  } else if (configLocation.kind === "invalid") {
    issues.push(configLocation.message);
  } else if (!configHasInstruction) {
    issues.push(`kilo.jsonc instructions does not reference ${instructionRef}`);
  }

  return {
    rulePath: resolvedRulePath,
    configPath: resolvedConfigPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_KILO_ADVISORY,
      fixCommand: TOKENJUICE_KILO_FIX_COMMAND,
    }),
  };
}
