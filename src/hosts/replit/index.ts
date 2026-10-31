import { join } from "node:path";

import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";

export type ReplitInstructionsOptions = {
  projectDir?: string;
};

export type InstallReplitInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallReplitInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type ReplitDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_REPLIT_FIX_COMMAND = "tokenjuice install replit";
const TOKENJUICE_REPLIT_BEGIN = "<!-- tokenjuice:replit begin -->";
const TOKENJUICE_REPLIT_END = "<!-- tokenjuice:replit end -->";
const TOKENJUICE_REPLIT_ADVISORY = "Replit support is beta and instruction-based; Agent reads root replit.md for project context, but still owns command execution and may update that file as project knowledge changes.";

const resolveProjectDir = createProjectDirResolver("REPLIT_PROJECT_DIR");

async function getDefaultInstructionsPath(options: ReplitInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "replit.md");
}

const TOKENJUICE_REPLIT_BLOCK = [
  TOKENJUICE_REPLIT_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Replit Agent, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_REPLIT_END,
].join("\n");

const TOKENJUICE_REPLIT_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_REPLIT_BEGIN,
  endMarker: TOKENJUICE_REPLIT_END,
  block: TOKENJUICE_REPLIT_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("replit", TOKENJUICE_REPLIT_BLOCK_CONFIG);

export async function installReplitInstructions(
  instructionsPath?: string,
  options: ReplitInstructionsOptions = {},
): Promise<InstallReplitInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallReplitInstructions(
  instructionsPath?: string,
  options: ReplitInstructionsOptions = {},
): Promise<UninstallReplitInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorReplitInstructions(
  instructionsPath?: string,
  options: ReplitInstructionsOptions = {},
): Promise<ReplitDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_REPLIT_BLOCK_CONFIG, {
    configuredLabel: "Replit instructions",
    advisory: TOKENJUICE_REPLIT_ADVISORY,
    fixCommand: TOKENJUICE_REPLIT_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from replit.md, then run tokenjuice install replit",
  });
}
