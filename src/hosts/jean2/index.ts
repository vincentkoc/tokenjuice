import { join } from "node:path";

import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";

export type Jean2InstructionsOptions = {
  projectDir?: string;
};

export type InstallJean2InstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallJean2InstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type Jean2DoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_JEAN2_FIX_COMMAND = "tokenjuice install jean2";
const TOKENJUICE_JEAN2_BEGIN = "<!-- tokenjuice:jean2 begin -->";
const TOKENJUICE_JEAN2_END = "<!-- tokenjuice:jean2 end -->";
const TOKENJUICE_JEAN2_ADVISORY =
  "Jean2 support is beta and instruction-file based; Jean2 still owns command execution.";

const resolveProjectDir = createProjectDirResolver("JEAN2_PROJECT_DIR");

async function getDefaultInstructionsPath(options: Jean2InstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_JEAN2_BLOCK = [
  TOKENJUICE_JEAN2_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When running terminal commands through Jean2, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_JEAN2_END,
].join("\n");

const TOKENJUICE_JEAN2_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_JEAN2_BEGIN,
  endMarker: TOKENJUICE_JEAN2_END,
  block: TOKENJUICE_JEAN2_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("jean2", TOKENJUICE_JEAN2_BLOCK_CONFIG);

export async function installJean2Instructions(
  instructionsPath?: string,
  options: Jean2InstructionsOptions = {},
): Promise<InstallJean2InstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallJean2Instructions(
  instructionsPath?: string,
  options: Jean2InstructionsOptions = {},
): Promise<UninstallJean2InstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorJean2Instructions(
  instructionsPath?: string,
  options: Jean2InstructionsOptions = {},
): Promise<Jean2DoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_JEAN2_BLOCK_CONFIG, {
    configuredLabel: "Jean2 instructions",
    advisory: TOKENJUICE_JEAN2_ADVISORY,
    fixCommand: TOKENJUICE_JEAN2_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install jean2",
  });
}
