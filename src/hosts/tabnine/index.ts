import { join } from "node:path";

import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import type { RemoveInstructionFileResult, WriteInstructionFileResult } from "../shared/instruction-file.js";

export type TabnineInstructionsOptions = {
  projectDir?: string;
};

export type InstallTabnineInstructionsResult = WriteInstructionFileResult<"instructionsPath">;

export type UninstallTabnineInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;

export type TabnineDoctorReport = InstructionsDoctorReport;

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
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_TABNINE_BLOCK_CONFIG, {
    configuredLabel: "Tabnine instructions",
    advisory: TOKENJUICE_TABNINE_ADVISORY,
    fixCommand: TOKENJUICE_TABNINE_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from TABNINE.md, then run tokenjuice install tabnine",
  });
}
