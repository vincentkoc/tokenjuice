import { lstat, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { isInsideOrEqual, realpathExistingAncestor } from "../shared/path-ancestors.js";

import { createProjectDirResolver } from "../shared/project-root.js";

import {
  getMarkerDelimitedBlockText,
  hasMalformedMarkerDelimitedBlock,
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

export type AgentsMdInstructionsOptions = {
  projectDir?: string;
};

export type InstallAgentsMdInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallAgentsMdInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type AgentsMdDoctorReport = {
  instructionsPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AGENTS_MD_FIX_COMMAND = "tokenjuice install agents-md";
const TOKENJUICE_AGENTS_MD_BEGIN = "<!-- tokenjuice:agents-md begin -->";
const TOKENJUICE_AGENTS_MD_END = "<!-- tokenjuice:agents-md end -->";
const TOKENJUICE_AGENTS_MD_ADVISORY =
  "AGENTS.md support is beta and instruction-based; it guides agents that read AGENTS.md but does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("AGENTS_MD_PROJECT_DIR");

async function rejectInstructionSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use AGENTS.md instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
      `cannot use AGENTS.md instructions ${filePath}; tokenjuice will not write through instruction directories outside ${projectDir}`,
    );
  }

  await rejectInstructionSymlink(filePath);
  return filePath;
}

async function getDefaultInstructionsPath(options: AgentsMdInstructionsOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectInstructionsPath(join(projectDir, "AGENTS.md"), realProjectDir);
}

async function getDefaultAliasPath(options: AgentsMdInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

async function resolveInstructionsPath(instructionsPath?: string, options: AgentsMdInstructionsOptions = {}): Promise<string> {
  if (instructionsPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectInstructionsPath(resolve(instructionsPath), realProjectDir);
  }
  return getDefaultInstructionsPath(options);
}

const TOKENJUICE_AGENTS_MD_BLOCK = [
  TOKENJUICE_AGENTS_MD_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When running terminal commands from an agent that reads AGENTS.md, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_AGENTS_MD_END,
].join("\n");

const TOKENJUICE_AGENTS_MD_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_AGENTS_MD_BEGIN,
  endMarker: TOKENJUICE_AGENTS_MD_END,
  block: TOKENJUICE_AGENTS_MD_BLOCK,
};

export async function installAgentsMdInstructions(
  instructionsPath?: string,
  options: AgentsMdInstructionsOptions = {},
): Promise<InstallAgentsMdInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  await rejectInstallSidecarSymlinks(resolvedInstructionsPath);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTS_MD_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_AGENTS_MD_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install agents-md`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AGENTS_MD_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAgentsMdInstructions(
  instructionsPath?: string,
  options: AgentsMdInstructionsOptions = {},
): Promise<UninstallAgentsMdInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTS_MD_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_AGENTS_MD_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall agents-md`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AGENTS_MD_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorAgentsMdInstructions(
  instructionsPath?: string,
  options: AgentsMdInstructionsOptions = {},
): Promise<AgentsMdDoctorReport> {
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
        advisory: TOKENJUICE_AGENTS_MD_ADVISORY,
        fixCommand: (error as Error).message.includes("outside")
          ? "use a project-local AGENTS.md path, then run tokenjuice install agents-md"
          : "replace symlinked AGENTS.md with a regular project file, then run tokenjuice install agents-md",
      }),
    };
  }
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTS_MD_BLOCK_CONFIG);
  const hasTokenjuiceMarker = markerState.hasBegin || markerState.hasEnd;
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice AGENTS.md instructions are not installed"],
        advisory: TOKENJUICE_AGENTS_MD_ADVISORY,
        fixCommand: TOKENJUICE_AGENTS_MD_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "AGENTS.md instructions",
    repairCommand: TOKENJUICE_AGENTS_MD_FIX_COMMAND,
  });
  const malformedMarkerIssues = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_AGENTS_MD_BLOCK_CONFIG)
    ? ["configured AGENTS.md instructions have malformed tokenjuice marker nesting or extra markers"]
    : [];
  const issues = [
    ...markerIssues,
    ...malformedMarkerIssues,
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_AGENTS_MD_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured AGENTS.md instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured AGENTS.md instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured AGENTS.md instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    hasTokenjuiceMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_AGENTS_MD_ADVISORY,
      fixCommand: hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_AGENTS_MD_BLOCK_CONFIG)
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install agents-md"
        : TOKENJUICE_AGENTS_MD_FIX_COMMAND,
    }),
  };
}
