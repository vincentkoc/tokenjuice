import { join } from "node:path";

import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import type { RemoveInstructionFileResult, WriteInstructionFileResult } from "../shared/instruction-file.js";

export type DeepAgentsInstructionsOptions = {
  projectDir?: string;
};

export type InstallDeepAgentsInstructionsResult = WriteInstructionFileResult<"instructionsPath">;

export type UninstallDeepAgentsInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;

export type DeepAgentsDoctorReport = InstructionsDoctorReport;

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
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG, {
    configuredLabel: "Deep Agents Code instructions",
    advisory: TOKENJUICE_DEEPAGENTS_ADVISORY,
    fixCommand: TOKENJUICE_DEEPAGENTS_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from .deepagents/AGENTS.md, then run tokenjuice install deepagents",
    malformedMarkerIssue: "configured Deep Agents Code instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install deepagents",
    malformedIssueOnlyWithoutMarkerIssues: true,
  });
}
