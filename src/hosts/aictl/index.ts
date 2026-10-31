import { realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { createProjectInstructionPathResolver, createSymlinkGuard } from "../shared/path-ancestors.js";

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

export type AictlDoctorReport = InstructionsDoctorReport & {
  hasTokenjuiceMarker: boolean;
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

const rejectInstructionSymlink = createSymlinkGuard(
  (filePath) => `cannot use aictl instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectInstructionSymlink(`${filePath}.bak`);
  await rejectInstructionSymlink(`${filePath}.tmp`);
}

const resolveSafeProjectInstructionsPath = createProjectInstructionPathResolver(
  "aictl instructions",
  rejectInstructionSymlink,
);

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

const markerInstructions = createMarkerInstructionCommands("aictl", TOKENJUICE_AICTL_BLOCK_CONFIG);

export async function installAictlInstructions(
  instructionsPath?: string,
  options: AictlInstructionsOptions = {},
): Promise<InstallAictlInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  await rejectInstallSidecarSymlinks(resolvedInstructionsPath);
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallAictlInstructions(
  instructionsPath?: string,
  options: AictlInstructionsOptions = {},
): Promise<UninstallAictlInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  return markerInstructions.uninstall(resolvedInstructionsPath);
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
  const structureIssues = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_AICTL_BLOCK_CONFIG)
    ? [`configured aictl instructions have malformed tokenjuice marker structure; ${TOKENJUICE_AICTL_FIX_COMMAND} cannot safely repair this automatically`]
    : [];
  const guidanceIssues = collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_AICTL_BLOCK_CONFIG), {
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
