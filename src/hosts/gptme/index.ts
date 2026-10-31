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

export type GptmeInstructionsOptions = {
  projectDir?: string;
};

export type InstallGptmeInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallGptmeInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type GptmeDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_GPTME_FIX_COMMAND = "tokenjuice install gptme";
const TOKENJUICE_GPTME_BEGIN = "<!-- tokenjuice:gptme begin -->";
const TOKENJUICE_GPTME_END = "<!-- tokenjuice:gptme end -->";
const TOKENJUICE_GPTME_ADVISORY = "gptme support is beta and instruction-based; it guides command usage through project AGENTS.md but does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("GPTME_PROJECT_DIR");

async function getDefaultInstructionsPath(options: GptmeInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_GPTME_BLOCK = [
  TOKENJUICE_GPTME_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through gptme, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_GPTME_END,
].join("\n");

const TOKENJUICE_GPTME_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_GPTME_BEGIN,
  endMarker: TOKENJUICE_GPTME_END,
  block: TOKENJUICE_GPTME_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("gptme", TOKENJUICE_GPTME_BLOCK_CONFIG);

export async function installGptmeInstructions(
  instructionsPath?: string,
  options: GptmeInstructionsOptions = {},
): Promise<InstallGptmeInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallGptmeInstructions(
  instructionsPath?: string,
  options: GptmeInstructionsOptions = {},
): Promise<UninstallGptmeInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorGptmeInstructions(
  instructionsPath?: string,
  options: GptmeInstructionsOptions = {},
): Promise<GptmeDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GPTME_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice gptme instructions are not installed"],
        advisory: TOKENJUICE_GPTME_ADVISORY,
        fixCommand: TOKENJUICE_GPTME_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "gptme instructions",
    repairCommand: TOKENJUICE_GPTME_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_GPTME_BLOCK_CONFIG);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured gptme instructions have malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_GPTME_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured gptme instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured gptme instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured gptme instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_GPTME_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install gptme"
        : TOKENJUICE_GPTME_FIX_COMMAND,
    }),
  };
}
