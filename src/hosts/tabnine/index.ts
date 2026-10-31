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

export type TabnineInstructionsOptions = {
  projectDir?: string;
};

export type InstallTabnineInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallTabnineInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type TabnineDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_TABNINE_FIX_COMMAND = "tokenjuice install tabnine";
const TOKENJUICE_TABNINE_BEGIN = "<!-- tokenjuice:tabnine begin -->";
const TOKENJUICE_TABNINE_END = "<!-- tokenjuice:tabnine end -->";
const TOKENJUICE_TABNINE_ADVISORY = "Tabnine support is beta and instruction-based; it guides command usage through project TABNINE.md but does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("TABNINE_PROJECT_DIR");

async function getDefaultInstructionsPath(options: TabnineInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "TABNINE.md");
}

const TOKENJUICE_TABNINE_BLOCK = [
  TOKENJUICE_TABNINE_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Tabnine CLI, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_TABNINE_END,
].join("\n");

const TOKENJUICE_TABNINE_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_TABNINE_BEGIN,
  endMarker: TOKENJUICE_TABNINE_END,
  block: TOKENJUICE_TABNINE_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("tabnine", TOKENJUICE_TABNINE_BLOCK_CONFIG);

export async function installTabnineInstructions(
  instructionsPath?: string,
  options: TabnineInstructionsOptions = {},
): Promise<InstallTabnineInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallTabnineInstructions(
  instructionsPath?: string,
  options: TabnineInstructionsOptions = {},
): Promise<UninstallTabnineInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorTabnineInstructions(
  instructionsPath?: string,
  options: TabnineInstructionsOptions = {},
): Promise<TabnineDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_TABNINE_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Tabnine instructions are not installed"],
        advisory: TOKENJUICE_TABNINE_ADVISORY,
        fixCommand: TOKENJUICE_TABNINE_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Tabnine instructions",
    repairCommand: TOKENJUICE_TABNINE_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_TABNINE_BLOCK_CONFIG);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Tabnine instructions have malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_TABNINE_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Tabnine instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Tabnine instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Tabnine instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_TABNINE_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from TABNINE.md, then run tokenjuice install tabnine"
        : TOKENJUICE_TABNINE_FIX_COMMAND,
    }),
  };
}
