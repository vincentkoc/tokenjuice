import { join } from "node:path";

import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";

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

export type GptmeDoctorReport = InstructionsDoctorReport;

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
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_GPTME_BLOCK_CONFIG, {
    configuredLabel: "gptme instructions",
    advisory: TOKENJUICE_GPTME_ADVISORY,
    fixCommand: TOKENJUICE_GPTME_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install gptme",
  });
}
