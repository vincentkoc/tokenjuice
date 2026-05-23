import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
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

export type ForgeCodeInstructionsOptions = {
  projectDir?: string;
};

export type InstallForgeCodeInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallForgeCodeInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type ForgeCodeDoctorReport = {
  instructionsPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_FORGECODE_FIX_COMMAND = "tokenjuice install forgecode";
const TOKENJUICE_FORGECODE_BEGIN = "<!-- tokenjuice:forgecode begin -->";
const TOKENJUICE_FORGECODE_END = "<!-- tokenjuice:forgecode end -->";
const TOKENJUICE_FORGECODE_ADVISORY =
  "ForgeCode support is beta and instruction-based; ForgeCode automatically loads project AGENTS.md guidance, but tokenjuice does not intercept tool output.";

function getExplicitProjectDir(options: ForgeCodeInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.FORGECODE_PROJECT_DIR;
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

async function resolveProjectDir(options: ForgeCodeInstructionsOptions = {}): Promise<string> {
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

async function rejectInstructionSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use ForgeCode instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectInstructionSymlink(`${filePath}.bak`);
  await rejectInstructionSymlink(`${filePath}.tmp`);
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
        throw new Error(`cannot use ForgeCode instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
  if (projectDir !== realProjectDir) {
    throw new Error(`cannot use ForgeCode instructions ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use ForgeCode instructions ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectInstructionSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectInstructionSymlink(resolvedPath);
  return resolvedPath;
}

async function getDefaultInstructionsPath(options: ForgeCodeInstructionsOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectInstructionsPath(join(projectDir, "AGENTS.md"), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: ForgeCodeInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

async function resolveInstructionsPath(instructionsPath?: string, options: ForgeCodeInstructionsOptions = {}): Promise<string> {
  if (instructionsPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectInstructionsPath(instructionsPath, projectDir, realProjectDir);
  }
  return getDefaultInstructionsPath(options);
}

const TOKENJUICE_FORGECODE_BLOCK = [
  TOKENJUICE_FORGECODE_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When running terminal commands through ForgeCode, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  "- ForgeCode automatically loads this AGENTS.md file when an agent session starts.",
  TOKENJUICE_FORGECODE_END,
].join("\n");

const TOKENJUICE_FORGECODE_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_FORGECODE_BEGIN,
  endMarker: TOKENJUICE_FORGECODE_END,
  block: TOKENJUICE_FORGECODE_BLOCK,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_FORGECODE_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_FORGECODE_END, beginIndex + TOKENJUICE_FORGECODE_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_FORGECODE_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_FORGECODE_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_FORGECODE_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installForgeCodeInstructions(
  instructionsPath?: string,
  options: ForgeCodeInstructionsOptions = {},
): Promise<InstallForgeCodeInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  await rejectInstallSidecarSymlinks(resolvedInstructionsPath);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_FORGECODE_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install forgecode`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_FORGECODE_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallForgeCodeInstructions(
  instructionsPath?: string,
  options: ForgeCodeInstructionsOptions = {},
): Promise<UninstallForgeCodeInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_FORGECODE_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall forgecode`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_FORGECODE_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorForgeCodeInstructions(
  instructionsPath?: string,
  options: ForgeCodeInstructionsOptions = {},
): Promise<ForgeCodeDoctorReport> {
  let resolvedInstructionsPath: string;
  try {
    resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  } catch (error) {
    const aliasPath = instructionsPath ?? (await getDefaultAliasPath(options));
    return {
      instructionsPath: aliasPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_FORGECODE_ADVISORY,
        fixCommand: (error as Error).message.includes("outside")
          ? "use a project-local AGENTS.md path, then run tokenjuice install forgecode"
          : "replace symlinked AGENTS.md with a regular project file, then run tokenjuice install forgecode",
      }),
    };
  }
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_FORGECODE_BLOCK_CONFIG);
  const hasTokenjuiceMarker = markerState.hasBegin || markerState.hasEnd;
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice ForgeCode instructions are not installed"],
        advisory: TOKENJUICE_FORGECODE_ADVISORY,
        fixCommand: TOKENJUICE_FORGECODE_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "ForgeCode instructions",
    repairCommand: TOKENJUICE_FORGECODE_FIX_COMMAND,
  });
  const structureIssues = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)
    ? ["configured ForgeCode instructions have unmatched tokenjuice markers"]
    : [];
  const blockText = getTokenjuiceBlockText(existing.text);
  const guidanceIssues = collectGuidanceIssues(blockText, {
    required: [
      {
        requiredText: "tokenjuice terminal output compaction",
        missingIssue: "configured ForgeCode instructions do not look like the tokenjuice instructions",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured ForgeCode instructions are missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured ForgeCode instructions are missing the raw escape hatch",
      },
      {
        requiredText: "ForgeCode automatically loads this AGENTS.md",
        missingIssue: "configured ForgeCode instructions are missing AGENTS.md load guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured ForgeCode instructions still suggest the full escape hatch",
      },
    ],
  });
  const issues = [...markerIssues, ...structureIssues, ...guidanceIssues];

  return {
    instructionsPath: resolvedInstructionsPath,
    hasTokenjuiceMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_FORGECODE_ADVISORY,
      fixCommand: structureIssues.length > 0
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install forgecode"
        : TOKENJUICE_FORGECODE_FIX_COMMAND,
    }),
  };
}
