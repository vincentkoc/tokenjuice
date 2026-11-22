import { join } from "node:path";

import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import type { RemoveInstructionFileResult, WriteInstructionFileResult } from "../shared/instruction-file.js";

export type MistralVibeInstructionsOptions = {
  projectDir?: string;
};

export type InstallMistralVibeInstructionsResult = WriteInstructionFileResult<"instructionsPath">;

export type UninstallMistralVibeInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;

export type MistralVibeDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_MISTRAL_VIBE_FIX_COMMAND = "tokenjuice install mistral-vibe";
const TOKENJUICE_MISTRAL_VIBE_BEGIN = "<!-- tokenjuice:mistral-vibe begin -->";
const TOKENJUICE_MISTRAL_VIBE_END = "<!-- tokenjuice:mistral-vibe end -->";
const TOKENJUICE_MISTRAL_VIBE_ADVISORY = "Mistral Vibe support is beta and instruction-based; Vibe loads root AGENTS.md but still owns command execution.";

const resolveProjectDir = createProjectDirResolver("MISTRAL_VIBE_PROJECT_DIR");

async function getDefaultInstructionsPath(options: MistralVibeInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_MISTRAL_VIBE_BLOCK = [
  TOKENJUICE_MISTRAL_VIBE_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Mistral Vibe, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_MISTRAL_VIBE_END,
].join("\n");

const TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_MISTRAL_VIBE_BEGIN,
  endMarker: TOKENJUICE_MISTRAL_VIBE_END,
  block: TOKENJUICE_MISTRAL_VIBE_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("mistral-vibe", TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG);

export async function installMistralVibeInstructions(
  instructionsPath?: string,
  options: MistralVibeInstructionsOptions = {},
): Promise<InstallMistralVibeInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallMistralVibeInstructions(
  instructionsPath?: string,
  options: MistralVibeInstructionsOptions = {},
): Promise<UninstallMistralVibeInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorMistralVibeInstructions(
  instructionsPath?: string,
  options: MistralVibeInstructionsOptions = {},
): Promise<MistralVibeDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG, {
    configuredLabel: "Mistral Vibe instructions",
    advisory: TOKENJUICE_MISTRAL_VIBE_ADVISORY,
    fixCommand: TOKENJUICE_MISTRAL_VIBE_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install mistral-vibe",
  });
}
