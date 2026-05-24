import { lstat, realpath } from "node:fs/promises";
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

export type AictlInstructionsOptions = {
  projectDir?: string;
};

export type InstallAictlInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallAictlInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type AictlDoctorReport = {
  instructionsPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AICTL_FIX_COMMAND = "tokenjuice install aictl";
const TOKENJUICE_AICTL_BEGIN = "<!-- tokenjuice:aictl begin -->";
const TOKENJUICE_AICTL_END = "<!-- tokenjuice:aictl end -->";
const TOKENJUICE_AICTL_ADVISORY =
  "aictl support is beta and prompt-file based; aictl appends AICTL.md project instructions to the system prompt, but tokenjuice does not intercept shell output.";

function getExplicitProjectDir(options: AictlInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.AICTL_PROJECT_DIR;
}

function getPromptFileName(): string {
  const promptFileName = process.env.AICTL_PROMPT_FILE || "AICTL.md";
  if (
    promptFileName.length === 0 ||
    isAbsolute(promptFileName) ||
    promptFileName.includes("/") ||
    promptFileName.includes("\\") ||
    promptFileName === "." ||
    promptFileName === ".."
  ) {
    throw new Error(`cannot use aictl prompt file ${promptFileName}; AICTL_PROMPT_FILE must be a project-local filename`);
  }
  return promptFileName;
}

function getPromptFileNameForDisplay(): string {
  try {
    return getPromptFileName();
  } catch {
    return "AICTL.md";
  }
}

async function resolveProjectDir(options: AictlInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return process.cwd();
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
      throw new Error(`cannot use aictl instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
        throw new Error(`cannot use aictl instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
    throw new Error(`cannot use aictl instructions ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use aictl instructions ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectInstructionSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectInstructionSymlink(resolvedPath);
  return resolvedPath;
}

async function getDefaultInstructionsPath(options: AictlInstructionsOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectInstructionsPath(join(projectDir, getPromptFileName()), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: AictlInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), getPromptFileNameForDisplay());
}

async function resolveInstructionsPath(instructionsPath?: string, options: AictlInstructionsOptions = {}): Promise<string> {
  if (instructionsPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectInstructionsPath(instructionsPath, projectDir, realProjectDir);
  }
  return getDefaultInstructionsPath(options);
}

const TOKENJUICE_AICTL_BLOCK = [
  TOKENJUICE_AICTL_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When aictl runs terminal commands likely to produce long output through `exec_shell`, prefer `tokenjuice wrap -- <command>`.",
  }),
  "- aictl reads this project prompt file, commonly `AICTL.md`, from the working directory and appends it to the system prompt.",
  TOKENJUICE_AICTL_END,
].join("\n");

const TOKENJUICE_AICTL_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_AICTL_BEGIN,
  endMarker: TOKENJUICE_AICTL_END,
  block: TOKENJUICE_AICTL_BLOCK,
  preserveSurroundingText: true,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_AICTL_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_AICTL_END, beginIndex + TOKENJUICE_AICTL_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_AICTL_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_AICTL_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_AICTL_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installAictlInstructions(
  instructionsPath?: string,
  options: AictlInstructionsOptions = {},
): Promise<InstallAictlInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  await rejectInstallSidecarSymlinks(resolvedInstructionsPath);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AICTL_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install aictl`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AICTL_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAictlInstructions(
  instructionsPath?: string,
  options: AictlInstructionsOptions = {},
): Promise<UninstallAictlInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AICTL_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall aictl`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AICTL_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorAictlInstructions(
  instructionsPath?: string,
  options: AictlInstructionsOptions = {},
): Promise<AictlDoctorReport> {
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
        advisory: TOKENJUICE_AICTL_ADVISORY,
        fixCommand: (error as Error).message.includes("outside")
          ? "use a project-local aictl prompt file path, then run tokenjuice install aictl"
          : "replace symlinked aictl prompt file with a regular project file, then run tokenjuice install aictl",
      }),
    };
  }
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AICTL_BLOCK_CONFIG);
  const hasTokenjuiceMarker = markerState.hasBegin || markerState.hasEnd;
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice aictl instructions are not installed"],
        advisory: TOKENJUICE_AICTL_ADVISORY,
        fixCommand: TOKENJUICE_AICTL_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "aictl instructions",
    repairCommand: TOKENJUICE_AICTL_FIX_COMMAND,
  });
  const structureIssues = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)
    ? [`configured aictl instructions have malformed tokenjuice marker structure; ${TOKENJUICE_AICTL_FIX_COMMAND} cannot safely repair this automatically`]
    : [];
  const guidanceIssues = collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
    required: [
      {
        requiredText: "tokenjuice terminal output compaction",
        missingIssue: "configured aictl instructions do not look like the tokenjuice block",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured aictl instructions are missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured aictl instructions are missing the raw escape hatch",
      },
      {
        requiredText: "project prompt file",
        missingIssue: "configured aictl instructions are missing project prompt guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured aictl instructions still suggest the full escape hatch",
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
      advisory: TOKENJUICE_AICTL_ADVISORY,
      fixCommand:
        markerIssues.length > 0 || structureIssues.length > 0
          ? `remove unmatched tokenjuice markers from ${resolvedInstructionsPath}, then run ${TOKENJUICE_AICTL_FIX_COMMAND}`
          : TOKENJUICE_AICTL_FIX_COMMAND,
    }),
  };
}
