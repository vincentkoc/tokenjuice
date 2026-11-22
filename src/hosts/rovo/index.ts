import { join } from "node:path";

import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import type { RemoveInstructionFileResult, WriteInstructionFileResult } from "../shared/instruction-file.js";

export type RovoInstructionsOptions = {
  projectDir?: string;
};

export type InstallRovoInstructionsResult = WriteInstructionFileResult<"instructionsPath">;

export type UninstallRovoInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;

export type RovoDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_ROVO_FIX_COMMAND = "tokenjuice install rovo";
const TOKENJUICE_ROVO_BEGIN = "<!-- tokenjuice:rovo begin -->";
const TOKENJUICE_ROVO_END = "<!-- tokenjuice:rovo end -->";
const TOKENJUICE_ROVO_ADVISORY = "Rovo support is beta and instruction-based; it guides command usage through project AGENTS.md but does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("ROVO_DEV_PROJECT_DIR");

async function getDefaultInstructionsPath(options: RovoInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_ROVO_BLOCK = [
  TOKENJUICE_ROVO_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Rovo Dev CLI, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_ROVO_END,
].join("\n");

const TOKENJUICE_ROVO_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_ROVO_BEGIN,
  endMarker: TOKENJUICE_ROVO_END,
  block: TOKENJUICE_ROVO_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("rovo", TOKENJUICE_ROVO_BLOCK_CONFIG);

export async function installRovoInstructions(
  instructionsPath?: string,
  options: RovoInstructionsOptions = {},
): Promise<InstallRovoInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallRovoInstructions(
  instructionsPath?: string,
  options: RovoInstructionsOptions = {},
): Promise<UninstallRovoInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorRovoInstructions(
  instructionsPath?: string,
  options: RovoInstructionsOptions = {},
): Promise<RovoDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_ROVO_BLOCK_CONFIG, {
    configuredLabel: "Rovo instructions",
    advisory: TOKENJUICE_ROVO_ADVISORY,
    fixCommand: TOKENJUICE_ROVO_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install rovo",
  });
}
