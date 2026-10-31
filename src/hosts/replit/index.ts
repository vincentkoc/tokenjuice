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

export type ReplitInstructionsOptions = {
  projectDir?: string;
};

export type InstallReplitInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallReplitInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type ReplitDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_REPLIT_FIX_COMMAND = "tokenjuice install replit";
const TOKENJUICE_REPLIT_BEGIN = "<!-- tokenjuice:replit begin -->";
const TOKENJUICE_REPLIT_END = "<!-- tokenjuice:replit end -->";
const TOKENJUICE_REPLIT_ADVISORY = "Replit support is beta and instruction-based; Agent reads root replit.md for project context, but still owns command execution and may update that file as project knowledge changes.";

const resolveProjectDir = createProjectDirResolver("REPLIT_PROJECT_DIR");

async function getDefaultInstructionsPath(options: ReplitInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "replit.md");
}

const TOKENJUICE_REPLIT_BLOCK = [
  TOKENJUICE_REPLIT_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Replit Agent, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_REPLIT_END,
].join("\n");

const TOKENJUICE_REPLIT_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_REPLIT_BEGIN,
  endMarker: TOKENJUICE_REPLIT_END,
  block: TOKENJUICE_REPLIT_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("replit", TOKENJUICE_REPLIT_BLOCK_CONFIG);

export async function installReplitInstructions(
  instructionsPath?: string,
  options: ReplitInstructionsOptions = {},
): Promise<InstallReplitInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallReplitInstructions(
  instructionsPath?: string,
  options: ReplitInstructionsOptions = {},
): Promise<UninstallReplitInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorReplitInstructions(
  instructionsPath?: string,
  options: ReplitInstructionsOptions = {},
): Promise<ReplitDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_REPLIT_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Replit instructions are not installed"],
        advisory: TOKENJUICE_REPLIT_ADVISORY,
        fixCommand: TOKENJUICE_REPLIT_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Replit instructions",
    repairCommand: TOKENJUICE_REPLIT_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_REPLIT_BLOCK_CONFIG);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Replit instructions have malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_REPLIT_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Replit instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Replit instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Replit instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_REPLIT_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from replit.md, then run tokenjuice install replit"
        : TOKENJUICE_REPLIT_FIX_COMMAND,
    }),
  };
}
