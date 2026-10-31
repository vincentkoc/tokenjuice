import { join, resolve } from "node:path";

import { findGitRoot } from "../shared/project-root.js";

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
import {
  type RemoveInstructionFileResult,
  type WriteInstructionFileResult,
  collectGuidanceIssues,
  readInstructionFile,
} from "../shared/instruction-file.js";

export type QoderInstructionsOptions = {
  projectDir?: string;
};

export type InstallQoderInstructionsResult = WriteInstructionFileResult<"instructionsPath">;

export type UninstallQoderInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;

export type QoderDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_QODER_FIX_COMMAND = "tokenjuice install qoder";
const TOKENJUICE_QODER_BEGIN = "<!-- tokenjuice:qoder begin -->";
const TOKENJUICE_QODER_END = "<!-- tokenjuice:qoder end -->";
const TOKENJUICE_QODER_ADVISORY = "Qoder support is beta and instruction-based; Qoder loads project AGENTS.md but still owns command execution.";

function getExplicitProjectDir(options: QoderInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.QODER_PROJECT_DIR;
}

async function resolveProjectDir(options: QoderInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? resolve(process.cwd());
}

async function getDefaultInstructionsPath(options: QoderInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_QODER_BLOCK = [
  TOKENJUICE_QODER_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Qoder CLI, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_QODER_END,
].join("\n");

const TOKENJUICE_QODER_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_QODER_BEGIN,
  endMarker: TOKENJUICE_QODER_END,
  block: TOKENJUICE_QODER_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("qoder", TOKENJUICE_QODER_BLOCK_CONFIG);

export async function installQoderInstructions(
  instructionsPath?: string,
  options: QoderInstructionsOptions = {},
): Promise<InstallQoderInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallQoderInstructions(
  instructionsPath?: string,
  options: QoderInstructionsOptions = {},
): Promise<UninstallQoderInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorQoderInstructions(
  instructionsPath?: string,
  options: QoderInstructionsOptions = {},
): Promise<QoderDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_QODER_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Qoder instructions are not installed"],
        advisory: TOKENJUICE_QODER_ADVISORY,
        fixCommand: TOKENJUICE_QODER_FIX_COMMAND,
      }),
    };
  }

  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_QODER_BLOCK_CONFIG);
  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Qoder instructions",
    repairCommand: TOKENJUICE_QODER_FIX_COMMAND,
  });
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Qoder instructions have unmatched tokenjuice markers"] : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_QODER_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Qoder instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Qoder instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Qoder instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_QODER_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install qoder"
        : TOKENJUICE_QODER_FIX_COMMAND,
    }),
  };
}
