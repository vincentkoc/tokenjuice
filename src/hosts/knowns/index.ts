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

export type KnownsInstructionsOptions = {
  projectDir?: string;
};

export type InstallKnownsInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallKnownsInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type KnownsDoctorReport = {
  instructionsPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_KNOWNS_FIX_COMMAND = "tokenjuice install knowns";
const TOKENJUICE_KNOWNS_BEGIN = "<!-- tokenjuice:knowns begin -->";
const TOKENJUICE_KNOWNS_END = "<!-- tokenjuice:knowns end -->";
const TOKENJUICE_KNOWNS_ADVISORY =
  "Knowns support is beta and instruction-based; Knowns generates KNOWNS.md guidance and exposes memory, tasks, docs, and code intelligence through MCP, but tokenjuice does not intercept tool output.";

function getExplicitProjectDir(options: KnownsInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.KNOWNS_PROJECT_DIR;
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

async function resolveProjectDir(options: KnownsInstructionsOptions = {}): Promise<string> {
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
      throw new Error(`cannot use Knowns instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
        throw new Error(`cannot use Knowns instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
    throw new Error(`cannot use Knowns instructions ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use Knowns instructions ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectInstructionSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectInstructionSymlink(resolvedPath);
  return resolvedPath;
}

async function getDefaultInstructionsPath(options: KnownsInstructionsOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectInstructionsPath(join(projectDir, "KNOWNS.md"), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: KnownsInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "KNOWNS.md");
}

async function resolveInstructionsPath(instructionsPath?: string, options: KnownsInstructionsOptions = {}): Promise<string> {
  if (instructionsPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectInstructionsPath(instructionsPath, projectDir, realProjectDir);
  }
  return getDefaultInstructionsPath(options);
}

const TOKENJUICE_KNOWNS_BLOCK = [
  TOKENJUICE_KNOWNS_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When an AI assistant working from Knowns context runs terminal commands, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  "- Knowns uses this KNOWNS.md guidance alongside its MCP memory, tasks, specs, docs, and code graph.",
  TOKENJUICE_KNOWNS_END,
].join("\n");

const TOKENJUICE_KNOWNS_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_KNOWNS_BEGIN,
  endMarker: TOKENJUICE_KNOWNS_END,
  block: TOKENJUICE_KNOWNS_BLOCK,
  preserveSurroundingText: true,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_KNOWNS_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_KNOWNS_END, beginIndex + TOKENJUICE_KNOWNS_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_KNOWNS_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_KNOWNS_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_KNOWNS_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installKnownsInstructions(
  instructionsPath?: string,
  options: KnownsInstructionsOptions = {},
): Promise<InstallKnownsInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  await rejectInstallSidecarSymlinks(resolvedInstructionsPath);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_KNOWNS_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install knowns`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_KNOWNS_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallKnownsInstructions(
  instructionsPath?: string,
  options: KnownsInstructionsOptions = {},
): Promise<UninstallKnownsInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_KNOWNS_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall knowns`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_KNOWNS_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorKnownsInstructions(
  instructionsPath?: string,
  options: KnownsInstructionsOptions = {},
): Promise<KnownsDoctorReport> {
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
        advisory: TOKENJUICE_KNOWNS_ADVISORY,
        fixCommand: (error as Error).message.includes("outside")
          ? "use a project-local KNOWNS.md path, then run tokenjuice install knowns"
          : "replace symlinked KNOWNS.md with a regular project file, then run tokenjuice install knowns",
      }),
    };
  }
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_KNOWNS_BLOCK_CONFIG);
  const hasTokenjuiceMarker = markerState.hasBegin || markerState.hasEnd;
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Knowns instructions are not installed"],
        advisory: TOKENJUICE_KNOWNS_ADVISORY,
        fixCommand: TOKENJUICE_KNOWNS_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Knowns instructions",
    repairCommand: TOKENJUICE_KNOWNS_FIX_COMMAND,
  });
  const structureIssues = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)
    ? ["configured Knowns instructions have unmatched tokenjuice markers"]
    : [];
  const guidanceIssues = collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
    required: [
      {
        requiredText: "tokenjuice terminal output compaction",
        missingIssue: "configured Knowns instructions do not look like the tokenjuice instructions",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Knowns instructions are missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Knowns instructions are missing the raw escape hatch",
      },
      {
        requiredText: "Knowns uses this KNOWNS.md guidance",
        missingIssue: "configured Knowns instructions are missing KNOWNS.md guidance context",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Knowns instructions still suggest the full escape hatch",
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
      advisory: TOKENJUICE_KNOWNS_ADVISORY,
      fixCommand: [...markerIssues, ...structureIssues].length > 0
        ? "remove unmatched tokenjuice markers from KNOWNS.md, then run tokenjuice install knowns"
        : TOKENJUICE_KNOWNS_FIX_COMMAND,
    }),
  };
}
