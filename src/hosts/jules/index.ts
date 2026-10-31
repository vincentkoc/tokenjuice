import { join } from "node:path";

import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";

export type JulesInstructionsOptions = {
  projectDir?: string;
};

export type InstallJulesInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallJulesInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type JulesDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_JULES_FIX_COMMAND = "tokenjuice install jules";
const TOKENJUICE_JULES_BEGIN = "<!-- tokenjuice:jules begin -->";
const TOKENJUICE_JULES_END = "<!-- tokenjuice:jules end -->";
const TOKENJUICE_JULES_ADVISORY = "Jules support is beta and instruction-based; it guides command usage through project AGENTS.md but does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("JULES_PROJECT_DIR");

async function getDefaultInstructionsPath(options: JulesInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_JULES_BLOCK = [
  TOKENJUICE_JULES_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Jules, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_JULES_END,
].join("\n");

const TOKENJUICE_JULES_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_JULES_BEGIN,
  endMarker: TOKENJUICE_JULES_END,
  block: TOKENJUICE_JULES_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("jules", TOKENJUICE_JULES_BLOCK_CONFIG);

export async function installJulesInstructions(
  instructionsPath?: string,
  options: JulesInstructionsOptions = {},
): Promise<InstallJulesInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallJulesInstructions(
  instructionsPath?: string,
  options: JulesInstructionsOptions = {},
): Promise<UninstallJulesInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorJulesInstructions(
  instructionsPath?: string,
  options: JulesInstructionsOptions = {},
): Promise<JulesDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_JULES_BLOCK_CONFIG, {
    configuredLabel: "Jules instructions",
    advisory: TOKENJUICE_JULES_ADVISORY,
    fixCommand: TOKENJUICE_JULES_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install jules",
  });
}
