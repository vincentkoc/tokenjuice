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

export type CodebuffInstructionsOptions = {
  projectDir?: string;
};

export type InstallCodebuffInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallCodebuffInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type CodebuffDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_CODEBUFF_FIX_COMMAND = "tokenjuice install codebuff";
const TOKENJUICE_CODEBUFF_BEGIN = "<!-- tokenjuice:codebuff begin -->";
const TOKENJUICE_CODEBUFF_END = "<!-- tokenjuice:codebuff end -->";
const TOKENJUICE_CODEBUFF_ADVISORY = "Codebuff support is beta and instruction-based; it guides command usage through project AGENTS.md but does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("CODEBUFF_PROJECT_DIR");

async function getDefaultInstructionsPath(options: CodebuffInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_CODEBUFF_BLOCK = [
  TOKENJUICE_CODEBUFF_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Codebuff, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_CODEBUFF_END,
].join("\n");

const TOKENJUICE_CODEBUFF_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_CODEBUFF_BEGIN,
  endMarker: TOKENJUICE_CODEBUFF_END,
  block: TOKENJUICE_CODEBUFF_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("codebuff", TOKENJUICE_CODEBUFF_BLOCK_CONFIG);

export async function installCodebuffInstructions(
  instructionsPath?: string,
  options: CodebuffInstructionsOptions = {},
): Promise<InstallCodebuffInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallCodebuffInstructions(
  instructionsPath?: string,
  options: CodebuffInstructionsOptions = {},
): Promise<UninstallCodebuffInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorCodebuffInstructions(
  instructionsPath?: string,
  options: CodebuffInstructionsOptions = {},
): Promise<CodebuffDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_CODEBUFF_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Codebuff instructions are not installed"],
        advisory: TOKENJUICE_CODEBUFF_ADVISORY,
        fixCommand: TOKENJUICE_CODEBUFF_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Codebuff instructions",
    repairCommand: TOKENJUICE_CODEBUFF_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_CODEBUFF_BLOCK_CONFIG);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Codebuff instructions have malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_CODEBUFF_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Codebuff instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Codebuff instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Codebuff instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_CODEBUFF_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install codebuff"
        : TOKENJUICE_CODEBUFF_FIX_COMMAND,
    }),
  };
}
