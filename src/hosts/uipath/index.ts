import { join } from "node:path";

import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";

export type UiPathInstructionsOptions = {
  projectDir?: string;
};

export type InstallUiPathInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallUiPathInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type UiPathDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_UIPATH_FIX_COMMAND = "tokenjuice install uipath";
const TOKENJUICE_UIPATH_BEGIN = "<!-- tokenjuice:uipath begin -->";
const TOKENJUICE_UIPATH_END = "<!-- tokenjuice:uipath end -->";
const TOKENJUICE_UIPATH_ADVISORY =
  "UiPath support is beta and instruction-file based; the active coding agent still owns command execution.";

const resolveProjectDir = createProjectDirResolver("UIPATH_PROJECT_DIR");

async function getDefaultInstructionsPath(options: UiPathInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_UIPATH_BLOCK = [
  TOKENJUICE_UIPATH_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When running terminal commands through UiPath for Coding Agents, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_UIPATH_END,
].join("\n");

const TOKENJUICE_UIPATH_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_UIPATH_BEGIN,
  endMarker: TOKENJUICE_UIPATH_END,
  block: TOKENJUICE_UIPATH_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("uipath", TOKENJUICE_UIPATH_BLOCK_CONFIG);

export async function installUiPathInstructions(
  instructionsPath?: string,
  options: UiPathInstructionsOptions = {},
): Promise<InstallUiPathInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallUiPathInstructions(
  instructionsPath?: string,
  options: UiPathInstructionsOptions = {},
): Promise<UninstallUiPathInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorUiPathInstructions(
  instructionsPath?: string,
  options: UiPathInstructionsOptions = {},
): Promise<UiPathDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_UIPATH_BLOCK_CONFIG, {
    configuredLabel: "UiPath instructions",
    advisory: TOKENJUICE_UIPATH_ADVISORY,
    fixCommand: TOKENJUICE_UIPATH_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install uipath",
  });
}
