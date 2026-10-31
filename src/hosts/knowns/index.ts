import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { createProjectInstructionPathResolver, createSymlinkGuard } from "../shared/path-ancestors.js";

import { createProjectDirResolver } from "../shared/project-root.js";

import {
  createMarkerInstructionCommands,
  getMarkerDelimitedBlockText,
  hasMalformedMarkerDelimitedBlock,
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import {
  type InstructionsDoctorReport,
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

export type KnownsDoctorReport = InstructionsDoctorReport & {
  hasTokenjuiceMarker: boolean;
};

const TOKENJUICE_KNOWNS_FIX_COMMAND = "tokenjuice install knowns";
const TOKENJUICE_KNOWNS_BEGIN = "<!-- tokenjuice:knowns begin -->";
const TOKENJUICE_KNOWNS_END = "<!-- tokenjuice:knowns end -->";
const TOKENJUICE_KNOWNS_ADVISORY =
  "Knowns support is beta and instruction-based; Knowns generates KNOWNS.md guidance and exposes memory, tasks, docs, and code intelligence through MCP, but tokenjuice does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("KNOWNS_PROJECT_DIR");

const rejectInstructionSymlink = createSymlinkGuard(
  (filePath) => `cannot use Knowns instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectInstructionSymlink(`${filePath}.bak`);
  await rejectInstructionSymlink(`${filePath}.tmp`);
}

const resolveSafeProjectInstructionsPath = createProjectInstructionPathResolver(
  "Knowns instructions",
  rejectInstructionSymlink,
);

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

const markerInstructions = createMarkerInstructionCommands("knowns", TOKENJUICE_KNOWNS_BLOCK_CONFIG);

export async function installKnownsInstructions(
  instructionsPath?: string,
  options: KnownsInstructionsOptions = {},
): Promise<InstallKnownsInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  await rejectInstallSidecarSymlinks(resolvedInstructionsPath);
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallKnownsInstructions(
  instructionsPath?: string,
  options: KnownsInstructionsOptions = {},
): Promise<UninstallKnownsInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  return markerInstructions.uninstall(resolvedInstructionsPath);
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
  const structureIssues = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_KNOWNS_BLOCK_CONFIG)
    ? ["configured Knowns instructions have unmatched tokenjuice markers"]
    : [];
  const guidanceIssues = collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_KNOWNS_BLOCK_CONFIG), {
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
