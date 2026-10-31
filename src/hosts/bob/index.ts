import { join } from "node:path";

import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";

export type BobInstructionsOptions = {
  projectDir?: string;
};

export type InstallBobInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallBobInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type BobDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_BOB_FIX_COMMAND = "tokenjuice install bob";
const TOKENJUICE_BOB_BEGIN = "<!-- tokenjuice:bob begin -->";
const TOKENJUICE_BOB_END = "<!-- tokenjuice:bob end -->";
const TOKENJUICE_BOB_ADVISORY = "IBM Bob support is beta and instruction-based; it guides command usage through project AGENTS.md but does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("BOB_PROJECT_DIR");

async function getDefaultInstructionsPath(options: BobInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_BOB_BLOCK = [
  TOKENJUICE_BOB_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through IBM Bob, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_BOB_END,
].join("\n");

const TOKENJUICE_BOB_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_BOB_BEGIN,
  endMarker: TOKENJUICE_BOB_END,
  block: TOKENJUICE_BOB_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("bob", TOKENJUICE_BOB_BLOCK_CONFIG);

export async function installBobInstructions(
  instructionsPath?: string,
  options: BobInstructionsOptions = {},
): Promise<InstallBobInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallBobInstructions(
  instructionsPath?: string,
  options: BobInstructionsOptions = {},
): Promise<UninstallBobInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorBobInstructions(
  instructionsPath?: string,
  options: BobInstructionsOptions = {},
): Promise<BobDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_BOB_BLOCK_CONFIG, {
    configuredLabel: "IBM Bob instructions",
    advisory: TOKENJUICE_BOB_ADVISORY,
    fixCommand: TOKENJUICE_BOB_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install bob",
  });
}
