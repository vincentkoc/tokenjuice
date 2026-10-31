import { realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { createSymlinkGuard, rejectSymlinkPathComponents, isInsideOrEqual, realpathExistingAncestor } from "../shared/path-ancestors.js";

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

export type ForgeCodeDoctorReport = InstructionsDoctorReport & {
  hasTokenjuiceMarker: boolean;
};

const TOKENJUICE_FORGECODE_FIX_COMMAND = "tokenjuice install forgecode";
const TOKENJUICE_FORGECODE_BEGIN = "<!-- tokenjuice:forgecode begin -->";
const TOKENJUICE_FORGECODE_END = "<!-- tokenjuice:forgecode end -->";
const TOKENJUICE_FORGECODE_ADVISORY =
  "ForgeCode support is beta and instruction-based; ForgeCode automatically loads project AGENTS.md guidance, but tokenjuice does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("FORGECODE_PROJECT_DIR");

const rejectInstructionSymlink = createSymlinkGuard(
  (filePath) => `cannot use ForgeCode instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectInstructionSymlink(`${filePath}.bak`);
  await rejectInstructionSymlink(`${filePath}.tmp`);
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
  await rejectSymlinkPathComponents(
    resolvedPath,
    projectDir,
    `cannot use ForgeCode instructions ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`,
  );
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

const markerInstructions = createMarkerInstructionCommands("forgecode", TOKENJUICE_FORGECODE_BLOCK_CONFIG);

export async function installForgeCodeInstructions(
  instructionsPath?: string,
  options: ForgeCodeInstructionsOptions = {},
): Promise<InstallForgeCodeInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  await rejectInstallSidecarSymlinks(resolvedInstructionsPath);
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallForgeCodeInstructions(
  instructionsPath?: string,
  options: ForgeCodeInstructionsOptions = {},
): Promise<UninstallForgeCodeInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  return markerInstructions.uninstall(resolvedInstructionsPath);
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
  const structureIssues = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_FORGECODE_BLOCK_CONFIG)
    ? ["configured ForgeCode instructions have unmatched tokenjuice markers"]
    : [];
  const blockText = getMarkerDelimitedBlockText(existing.text, TOKENJUICE_FORGECODE_BLOCK_CONFIG);
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
