import { join } from "node:path";

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
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { collectGuidanceIssues, readInstructionFile } from "../shared/instruction-file.js";

export type RovoInstructionsOptions = {
  projectDir?: string;
};

export type InstallRovoInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallRovoInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type RovoDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_ROVO_FIX_COMMAND = "tokenjuice install rovo";
const TOKENJUICE_ROVO_BEGIN = "<!-- tokenjuice:rovo begin -->";
const TOKENJUICE_ROVO_END = "<!-- tokenjuice:rovo end -->";
const TOKENJUICE_ROVO_ADVISORY = "Rovo support is beta and instruction-based; it guides command usage through project AGENTS.md but does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("ROVO_DEV_PROJECT_DIR");

async function getDefaultInstructionsPath(options: RovoInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_ROVO_BLOCK = [
  TOKENJUICE_ROVO_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Rovo Dev CLI, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_ROVO_END,
].join("\n");

const TOKENJUICE_ROVO_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_ROVO_BEGIN,
  endMarker: TOKENJUICE_ROVO_END,
  block: TOKENJUICE_ROVO_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("rovo", TOKENJUICE_ROVO_BLOCK_CONFIG);

export async function installRovoInstructions(
  instructionsPath?: string,
  options: RovoInstructionsOptions = {},
): Promise<InstallRovoInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallRovoInstructions(
  instructionsPath?: string,
  options: RovoInstructionsOptions = {},
): Promise<UninstallRovoInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorRovoInstructions(
  instructionsPath?: string,
  options: RovoInstructionsOptions = {},
): Promise<RovoDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_ROVO_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Rovo instructions are not installed"],
        advisory: TOKENJUICE_ROVO_ADVISORY,
        fixCommand: TOKENJUICE_ROVO_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Rovo instructions",
    repairCommand: TOKENJUICE_ROVO_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_ROVO_BLOCK_CONFIG);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Rovo instructions have malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_ROVO_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Rovo instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Rovo instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Rovo instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_ROVO_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install rovo"
        : TOKENJUICE_ROVO_FIX_COMMAND,
    }),
  };
}
