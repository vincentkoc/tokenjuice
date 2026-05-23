import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

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

export type AgentInitInstructionsOptions = {
  projectDir?: string;
};

export type InstallAgentInitInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
  syncCommand: string;
};

export type UninstallAgentInitInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
  syncCommand: string;
};

export type AgentInitDoctorReport = {
  instructionsPath: string;
  syncCommand: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AGENTINIT_FIX_COMMAND = "tokenjuice install agentinit";
const TOKENJUICE_AGENTINIT_SYNC_COMMAND = "agentinit sync";
const TOKENJUICE_AGENTINIT_BEGIN = "<!-- tokenjuice:agentinit begin -->";
const TOKENJUICE_AGENTINIT_END = "<!-- tokenjuice:agentinit end -->";
const TOKENJUICE_AGENTINIT_ADVISORY =
  "AgentInit support is beta and source-instruction based; run `agentinit sync` after install so generated agent files receive the guidance.";

function getExplicitProjectDir(options: AgentInitInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.AGENTINIT_PROJECT_DIR;
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

async function resolveProjectDir(options: AgentInitInstructionsOptions = {}): Promise<string> {
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
      throw new Error(`cannot use AgentInit source ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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

async function resolveSafeProjectInstructionsPath(filePath: string, projectDir: string): Promise<string> {
  const realParentDir = await realpathExistingAncestor(dirname(filePath));
  if (!isInsideOrEqual(projectDir, realParentDir)) {
    throw new Error(
      `cannot use AgentInit source ${filePath}; tokenjuice will not write through instruction directories outside ${projectDir}`,
    );
  }

  await rejectInstructionSymlink(filePath);
  return filePath;
}

async function getDefaultInstructionsPath(options: AgentInitInstructionsOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectInstructionsPath(join(projectDir, "AGENTS.md"), realProjectDir);
}

async function getDefaultAliasPath(options: AgentInitInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

async function resolveInstructionsPath(instructionsPath?: string, options: AgentInitInstructionsOptions = {}): Promise<string> {
  if (instructionsPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectInstructionsPath(resolve(instructionsPath), realProjectDir);
  }
  return getDefaultInstructionsPath(options);
}

const TOKENJUICE_AGENTINIT_BLOCK = [
  TOKENJUICE_AGENTINIT_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When AgentInit syncs this AGENTS.md into AI coding tool instruction files, prefer `tokenjuice wrap -- <command>` for terminal commands likely to produce long output.",
  }),
  "- After installing this block, run `agentinit sync` so generated agent files receive the updated guidance.",
  TOKENJUICE_AGENTINIT_END,
].join("\n");

const TOKENJUICE_AGENTINIT_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_AGENTINIT_BEGIN,
  endMarker: TOKENJUICE_AGENTINIT_END,
  block: TOKENJUICE_AGENTINIT_BLOCK,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_AGENTINIT_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_AGENTINIT_END, beginIndex + TOKENJUICE_AGENTINIT_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_AGENTINIT_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_AGENTINIT_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_AGENTINIT_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installAgentInitInstructions(
  instructionsPath?: string,
  options: AgentInitInstructionsOptions = {},
): Promise<InstallAgentInitInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  await rejectInstallSidecarSymlinks(resolvedInstructionsPath);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTINIT_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install agentinit`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AGENTINIT_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    syncCommand: TOKENJUICE_AGENTINIT_SYNC_COMMAND,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAgentInitInstructions(
  instructionsPath?: string,
  options: AgentInitInstructionsOptions = {},
): Promise<UninstallAgentInitInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTINIT_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall agentinit`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AGENTINIT_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed, syncCommand: TOKENJUICE_AGENTINIT_SYNC_COMMAND };
}

export async function doctorAgentInitInstructions(
  instructionsPath?: string,
  options: AgentInitInstructionsOptions = {},
): Promise<AgentInitDoctorReport> {
  let resolvedInstructionsPath: string;
  try {
    resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  } catch (error) {
    const aliasPath = instructionsPath ?? (await getDefaultAliasPath(options));
    return {
      instructionsPath: aliasPath,
      syncCommand: TOKENJUICE_AGENTINIT_SYNC_COMMAND,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_AGENTINIT_ADVISORY,
        fixCommand: (error as Error).message.includes("outside")
          ? "use a project-local AGENTS.md path, then run tokenjuice install agentinit"
          : "replace symlinked AGENTS.md with a regular project file, then run tokenjuice install agentinit",
      }),
    };
  }
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTINIT_BLOCK_CONFIG);
  const hasTokenjuiceMarker = markerState.hasBegin || markerState.hasEnd;
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      syncCommand: TOKENJUICE_AGENTINIT_SYNC_COMMAND,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice AgentInit instructions are not installed"],
        advisory: TOKENJUICE_AGENTINIT_ADVISORY,
        fixCommand: TOKENJUICE_AGENTINIT_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "AgentInit instructions",
    repairCommand: TOKENJUICE_AGENTINIT_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers && markerIssues.length === 0
      ? [
          "configured AgentInit instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install agentinit",
        ]
      : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured AgentInit instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured AgentInit instructions are missing the raw escape hatch",
        },
        {
          requiredText: "agentinit sync",
          missingIssue: "configured AgentInit instructions are missing sync guidance",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured AgentInit instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    syncCommand: TOKENJUICE_AGENTINIT_SYNC_COMMAND,
    hasTokenjuiceMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_AGENTINIT_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install agentinit"
        : TOKENJUICE_AGENTINIT_FIX_COMMAND,
    }),
  };
}
