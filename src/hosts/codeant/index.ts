import { lstat, realpath, rm, stat } from "node:fs/promises";
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
import {
  assertSafeInstructionBackupPath,
  collectGuidanceIssues,
  readInstructionFile,
  writeInstructionFile,
} from "../shared/instruction-file.js";

export type CodeAntInstructionsOptions = {
  projectDir?: string;
};

export type InstallCodeAntInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallCodeAntInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type CodeAntDoctorReport = {
  instructionsPath: string;
  hasTokenjuiceMarker: boolean;
  hasUnsafePathIssue: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

type CodeAntInstruction = {
  id?: unknown;
  description?: unknown;
  files?: unknown;
  scope?: unknown;
};

type CodeAntInstructionsFile = {
  instructions?: unknown;
  [key: string]: unknown;
};

const TOKENJUICE_CODEANT_FIX_COMMAND = "tokenjuice install codeant";
const TOKENJUICE_CODEANT_INSTRUCTION_ID = "tokenjuice-terminal-output-compaction";
const TOKENJUICE_CODEANT_ADVISORY =
  "CodeAnt support is beta and instructions-based; CodeAnt still owns review analysis, CLI execution, PR comments, and fixes.";

function getExplicitProjectDir(options: CodeAntInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.CODEANT_PROJECT_DIR;
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

async function resolveProjectDir(options: CodeAntInstructionsOptions = {}): Promise<string> {
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

function getExpectedInstructionsPath(projectDir: string): string {
  return join(projectDir, ".codeant", "instructions.json");
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

async function rejectInstructionsSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use CodeAnt instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
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
        throw new Error(`cannot use CodeAnt instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function resolveSafeProjectInstructionsPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  await rejectInstructionsSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use CodeAnt instructions ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectInstructionsSymlink(resolvedPath);
  const expectedInstructionsPath = getExpectedInstructionsPath(projectDir);
  if (resolvedPath !== expectedInstructionsPath) {
    throw new Error(
      `cannot use CodeAnt instructions ${resolvedPath}; tokenjuice only installs the project-local .codeant/instructions.json file`,
    );
  }
  return resolvedPath;
}

async function getDefaultInstructionsPath(options: CodeAntInstructionsOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectInstructionsPath(getExpectedInstructionsPath(projectDir), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: CodeAntInstructionsOptions = {}): Promise<string> {
  return getExpectedInstructionsPath(await resolveProjectDir(options));
}

async function instructionsArtifactExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function resolveInstructionsPath(
  instructionsPath?: string,
  options: CodeAntInstructionsOptions = {},
): Promise<string> {
  if (instructionsPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectInstructionsPath(instructionsPath, projectDir, realProjectDir);
  }
  return getDefaultInstructionsPath(options);
}

const TOKENJUICE_CODEANT_DESCRIPTION = [
  "tokenjuice terminal output compaction.",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "When CodeAnt review, Claude Code/Cursor integration, local review, or fix workflows suggest terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
  }).map((line) => line.replace(/^- /u, "")),
  "CodeAnt reads this repository instruction during IDE and PR review; CodeAnt still owns review analysis, CLI execution, PR comments, and fixes.",
].join(" ");

const TOKENJUICE_CODEANT_INSTRUCTION = {
  id: TOKENJUICE_CODEANT_INSTRUCTION_ID,
  description: TOKENJUICE_CODEANT_DESCRIPTION,
  files: ["**/*"],
  scope: ["ide", "pr"],
};

function parseInstructionsJson(text: string, filePath: string): CodeAntInstructionsFile {
  let parsed: unknown;
  try {
    parsed = text.trim() ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`cannot parse CodeAnt instructions ${filePath}: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`cannot use CodeAnt instructions ${filePath}; expected a JSON object`);
  }
  return parsed as CodeAntInstructionsFile;
}

function getInstructionsArray(config: CodeAntInstructionsFile, filePath: string): CodeAntInstruction[] {
  if (config.instructions === undefined) {
    return [];
  }
  if (!Array.isArray(config.instructions)) {
    throw new Error(`cannot use CodeAnt instructions ${filePath}; expected instructions to be an array`);
  }
  for (const instruction of config.instructions) {
    if (!instruction || typeof instruction !== "object" || Array.isArray(instruction)) {
      throw new Error(`cannot use CodeAnt instructions ${filePath}; expected every instruction to be an object`);
    }
  }
  return config.instructions as CodeAntInstruction[];
}

function isTokenjuiceInstruction(instruction: CodeAntInstruction): boolean {
  return instruction.id === TOKENJUICE_CODEANT_INSTRUCTION_ID;
}

function serializeInstructionsJson(config: CodeAntInstructionsFile): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function installTokenjuiceInstruction(text: string, filePath: string): string {
  const config = parseInstructionsJson(text, filePath);
  const instructions = getInstructionsArray(config, filePath).filter((instruction) => !isTokenjuiceInstruction(instruction));
  return serializeInstructionsJson({
    ...config,
    instructions: [...instructions, TOKENJUICE_CODEANT_INSTRUCTION],
  });
}

function uninstallTokenjuiceInstruction(text: string, filePath: string): { text: string; removed: boolean } {
  const config = parseInstructionsJson(text, filePath);
  const instructions = getInstructionsArray(config, filePath);
  const nextInstructions = instructions.filter((instruction) => !isTokenjuiceInstruction(instruction));
  if (nextInstructions.length === instructions.length) {
    return { text, removed: false };
  }
  const nextConfig = { ...config };
  if (nextInstructions.length > 0) {
    nextConfig.instructions = nextInstructions;
  } else {
    delete nextConfig.instructions;
  }
  if (Object.keys(nextConfig).length === 0) {
    return { text: "", removed: true };
  }
  return { text: serializeInstructionsJson(nextConfig), removed: true };
}

function getTokenjuiceInstructions(instructions: readonly CodeAntInstruction[]): CodeAntInstruction[] {
  return instructions.filter((instruction) => isTokenjuiceInstruction(instruction));
}

export async function installCodeAntInstructions(
  instructionsPath?: string,
  options: CodeAntInstructionsOptions = {},
): Promise<InstallCodeAntInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  if (existing.exists) {
    parseInstructionsJson(existing.text, resolvedInstructionsPath);
  }
  await assertSafeInstructionBackupPath(resolvedInstructionsPath);
  const result = await writeInstructionFile(
    resolvedInstructionsPath,
    installTokenjuiceInstruction(existing.text, resolvedInstructionsPath),
  );
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallCodeAntInstructions(
  instructionsPath?: string,
  options: CodeAntInstructionsOptions = {},
): Promise<UninstallCodeAntInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  if (!existing.exists) {
    return { instructionsPath: resolvedInstructionsPath, removed: false };
  }
  const result = uninstallTokenjuiceInstruction(existing.text, resolvedInstructionsPath);
  if (!result.removed) {
    return { instructionsPath: resolvedInstructionsPath, removed: false };
  }
  if (result.text.trim()) {
    await writeInstructionFile(resolvedInstructionsPath, result.text);
  } else {
    await rm(resolvedInstructionsPath, { force: true });
  }
  return { instructionsPath: resolvedInstructionsPath, removed: true };
}

export async function doctorCodeAntInstructions(
  instructionsPath?: string,
  options: CodeAntInstructionsOptions = {},
): Promise<CodeAntDoctorReport> {
  let resolvedInstructionsPath: string;
  try {
    resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  } catch (error) {
    const aliasPath = instructionsPath ?? (await getDefaultAliasPath(options));
    if (!instructionsPath && !(await instructionsArtifactExists(aliasPath))) {
      return {
        instructionsPath: aliasPath,
        hasTokenjuiceMarker: false,
        hasUnsafePathIssue: false,
        ...buildInstructionDoctorReportFields({
          status: "disabled",
          issues: ["tokenjuice CodeAnt instructions are not installed"],
          advisory: TOKENJUICE_CODEANT_ADVISORY,
          fixCommand: TOKENJUICE_CODEANT_FIX_COMMAND,
        }),
      };
    }
    return {
      instructionsPath: aliasPath,
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: true,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_CODEANT_ADVISORY,
        fixCommand: (error as Error).message.includes("outside") || (error as Error).message.includes("only installs")
          ? "use a project-local .codeant/instructions.json path, then run tokenjuice install codeant"
          : "replace symlinked CodeAnt instructions with a regular project file, then run tokenjuice install codeant",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedInstructionsPath);
  if (!existing.exists) {
    return {
      instructionsPath: resolvedInstructionsPath,
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice CodeAnt instructions are not installed"],
        advisory: TOKENJUICE_CODEANT_ADVISORY,
        fixCommand: TOKENJUICE_CODEANT_FIX_COMMAND,
      }),
    };
  }

  let config: CodeAntInstructionsFile;
  let instructions: CodeAntInstruction[];
  try {
    config = parseInstructionsJson(existing.text, resolvedInstructionsPath);
    instructions = getInstructionsArray(config, resolvedInstructionsPath);
  } catch (error) {
    return {
      instructionsPath: resolvedInstructionsPath,
      hasTokenjuiceMarker: existing.text.includes(TOKENJUICE_CODEANT_INSTRUCTION_ID),
      hasUnsafePathIssue: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_CODEANT_ADVISORY,
        fixCommand: TOKENJUICE_CODEANT_FIX_COMMAND,
      }),
    };
  }

  const tokenjuiceInstructions = getTokenjuiceInstructions(instructions);
  if (tokenjuiceInstructions.length === 0) {
    return {
      instructionsPath: resolvedInstructionsPath,
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice CodeAnt instructions are not installed"],
        advisory: TOKENJUICE_CODEANT_ADVISORY,
        fixCommand: TOKENJUICE_CODEANT_FIX_COMMAND,
      }),
    };
  }

  const instruction = tokenjuiceInstructions[0] ?? {};
  const description = typeof instruction.description === "string" ? instruction.description : "";
  const files = Array.isArray(instruction.files) ? instruction.files : [];
  const scope = Array.isArray(instruction.scope) ? instruction.scope : [];
  const issues = [
    ...(tokenjuiceInstructions.length > 1 ? ["configured CodeAnt instructions contain multiple tokenjuice instructions"] : []),
    ...collectGuidanceIssues(description, {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured CodeAnt instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured CodeAnt instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured CodeAnt instructions still suggest the full escape hatch",
        },
      ],
    }),
    ...(files.includes("**/*") ? [] : ["configured CodeAnt instructions are missing the all-files pattern"]),
    ...(scope.includes("ide") ? [] : ["configured CodeAnt instructions are missing IDE review scope"]),
    ...(scope.includes("pr") ? [] : ["configured CodeAnt instructions are missing PR review scope"]),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    hasTokenjuiceMarker: true,
    hasUnsafePathIssue: false,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_CODEANT_ADVISORY,
      fixCommand: TOKENJUICE_CODEANT_FIX_COMMAND,
    }),
  };
}
