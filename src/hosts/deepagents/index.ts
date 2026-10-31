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

export type DeepAgentsInstructionsOptions = {
  projectDir?: string;
};

export type InstallDeepAgentsInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallDeepAgentsInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type DeepAgentsDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_DEEPAGENTS_FIX_COMMAND = "tokenjuice install deepagents";
const TOKENJUICE_DEEPAGENTS_BEGIN = "<!-- tokenjuice:deepagents begin -->";
const TOKENJUICE_DEEPAGENTS_END = "<!-- tokenjuice:deepagents end -->";
const TOKENJUICE_DEEPAGENTS_ADVISORY =
  "Deep Agents Code support is beta and instruction-based; Deep Agents Code reads project instructions but still owns command execution.";

const resolveProjectDir = createProjectDirResolver("DEEPAGENTS_PROJECT_DIR");

async function getDefaultInstructionsPath(options: DeepAgentsInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".deepagents", "AGENTS.md");
}

const TOKENJUICE_DEEPAGENTS_BLOCK = [
  TOKENJUICE_DEEPAGENTS_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When running terminal commands through Deep Agents Code, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_DEEPAGENTS_END,
].join("\n");

const TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_DEEPAGENTS_BEGIN,
  endMarker: TOKENJUICE_DEEPAGENTS_END,
  block: TOKENJUICE_DEEPAGENTS_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("deepagents", TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG);

export async function installDeepAgentsInstructions(
  instructionsPath?: string,
  options: DeepAgentsInstructionsOptions = {},
): Promise<InstallDeepAgentsInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallDeepAgentsInstructions(
  instructionsPath?: string,
  options: DeepAgentsInstructionsOptions = {},
): Promise<UninstallDeepAgentsInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorDeepAgentsInstructions(
  instructionsPath?: string,
  options: DeepAgentsInstructionsOptions = {},
): Promise<DeepAgentsDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Deep Agents Code instructions are not installed"],
        advisory: TOKENJUICE_DEEPAGENTS_ADVISORY,
        fixCommand: TOKENJUICE_DEEPAGENTS_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Deep Agents Code instructions",
    repairCommand: TOKENJUICE_DEEPAGENTS_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers && markerIssues.length === 0
      ? ["configured Deep Agents Code instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install deepagents"]
      : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Deep Agents Code instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Deep Agents Code instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Deep Agents Code instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_DEEPAGENTS_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from .deepagents/AGENTS.md, then run tokenjuice install deepagents"
        : TOKENJUICE_DEEPAGENTS_FIX_COMMAND,
    }),
  };
}
