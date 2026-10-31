import { join } from "node:path";

import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import type { RemoveInstructionFileResult, WriteInstructionFileResult } from "../shared/instruction-file.js";

export type CodebuffInstructionsOptions = {
  projectDir?: string;
};

export type InstallCodebuffInstructionsResult = WriteInstructionFileResult<"instructionsPath">;

export type UninstallCodebuffInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;

export type CodebuffDoctorReport = InstructionsDoctorReport;

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
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_CODEBUFF_BLOCK_CONFIG, {
    configuredLabel: "Codebuff instructions",
    advisory: TOKENJUICE_CODEBUFF_ADVISORY,
    fixCommand: TOKENJUICE_CODEBUFF_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install codebuff",
  });
}
