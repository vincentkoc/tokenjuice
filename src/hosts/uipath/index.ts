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

export type UiPathInstructionsOptions = {
  projectDir?: string;
};

export type InstallUiPathInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallUiPathInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type UiPathDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_UIPATH_FIX_COMMAND = "tokenjuice install uipath";
const TOKENJUICE_UIPATH_BEGIN = "<!-- tokenjuice:uipath begin -->";
const TOKENJUICE_UIPATH_END = "<!-- tokenjuice:uipath end -->";
const TOKENJUICE_UIPATH_ADVISORY =
  "UiPath support is beta and instruction-file based; the active coding agent still owns command execution.";

const resolveProjectDir = createProjectDirResolver("UIPATH_PROJECT_DIR");

async function getDefaultInstructionsPath(options: UiPathInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_UIPATH_BLOCK = [
  TOKENJUICE_UIPATH_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When running terminal commands through UiPath for Coding Agents, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_UIPATH_END,
].join("\n");

const TOKENJUICE_UIPATH_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_UIPATH_BEGIN,
  endMarker: TOKENJUICE_UIPATH_END,
  block: TOKENJUICE_UIPATH_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("uipath", TOKENJUICE_UIPATH_BLOCK_CONFIG);

export async function installUiPathInstructions(
  instructionsPath?: string,
  options: UiPathInstructionsOptions = {},
): Promise<InstallUiPathInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallUiPathInstructions(
  instructionsPath?: string,
  options: UiPathInstructionsOptions = {},
): Promise<UninstallUiPathInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorUiPathInstructions(
  instructionsPath?: string,
  options: UiPathInstructionsOptions = {},
): Promise<UiPathDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_UIPATH_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice UiPath instructions are not installed"],
        advisory: TOKENJUICE_UIPATH_ADVISORY,
        fixCommand: TOKENJUICE_UIPATH_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "UiPath instructions",
    repairCommand: TOKENJUICE_UIPATH_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_UIPATH_BLOCK_CONFIG);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured UiPath instructions have malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_UIPATH_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured UiPath instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured UiPath instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured UiPath instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_UIPATH_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install uipath"
        : TOKENJUICE_UIPATH_FIX_COMMAND,
    }),
  };
}
