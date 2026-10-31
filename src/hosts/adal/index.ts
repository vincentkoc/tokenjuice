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

export type AdalInstructionsOptions = {
  projectDir?: string;
};

export type InstallAdalInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallAdalInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type AdalDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_ADAL_FIX_COMMAND = "tokenjuice install adal";
const TOKENJUICE_ADAL_BEGIN = "<!-- tokenjuice:adal begin -->";
const TOKENJUICE_ADAL_END = "<!-- tokenjuice:adal end -->";
const TOKENJUICE_ADAL_ADVISORY =
  "AdaL CLI support is beta and instruction-based; AdaL reads project AGENTS.md context but still owns command execution.";

const resolveProjectDir = createProjectDirResolver("ADAL_PROJECT_DIR");

async function getDefaultInstructionsPath(options: AdalInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_ADAL_BLOCK = [
  TOKENJUICE_ADAL_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When running terminal commands through AdaL CLI, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_ADAL_END,
].join("\n");

const TOKENJUICE_ADAL_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_ADAL_BEGIN,
  endMarker: TOKENJUICE_ADAL_END,
  block: TOKENJUICE_ADAL_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("adal", TOKENJUICE_ADAL_BLOCK_CONFIG);

export async function installAdalInstructions(
  instructionsPath?: string,
  options: AdalInstructionsOptions = {},
): Promise<InstallAdalInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallAdalInstructions(
  instructionsPath?: string,
  options: AdalInstructionsOptions = {},
): Promise<UninstallAdalInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorAdalInstructions(
  instructionsPath?: string,
  options: AdalInstructionsOptions = {},
): Promise<AdalDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_ADAL_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice AdaL CLI instructions are not installed"],
        advisory: TOKENJUICE_ADAL_ADVISORY,
        fixCommand: TOKENJUICE_ADAL_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "AdaL CLI instructions",
    repairCommand: TOKENJUICE_ADAL_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_ADAL_BLOCK_CONFIG);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers && markerIssues.length === 0
      ? ["configured AdaL CLI instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install adal"]
      : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_ADAL_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured AdaL CLI instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured AdaL CLI instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured AdaL CLI instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_ADAL_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install adal"
        : TOKENJUICE_ADAL_FIX_COMMAND,
    }),
  };
}
