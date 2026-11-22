import { join } from "node:path";

import {
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import { doctorMarkerStructure } from "../shared/marker-instruction-doctor.js";
import {
  type RemoveInstructionFileResult,
  type WriteInstructionFileResult,
} from "../shared/instruction-file.js";

export type ZedInstructionsOptions = {
  projectDir?: string;
};

export type InstallZedInstructionsResult = WriteInstructionFileResult<"instructionsPath">;

export type UninstallZedInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;

export type ZedDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_ZED_FIX_COMMAND = "tokenjuice install zed";
const TOKENJUICE_ZED_BEGIN = "<!-- tokenjuice:begin -->";
const TOKENJUICE_ZED_END = "<!-- tokenjuice:end -->";
const TOKENJUICE_ZED_ADVISORY = "Zed support is beta and rule-based; it guides command usage but does not intercept tool output.";

function getProjectDir(options: ZedInstructionsOptions = {}): string {
  return options.projectDir || process.env.ZED_PROJECT_DIR || process.cwd();
}

function getDefaultInstructionsPath(options: ZedInstructionsOptions = {}): string {
  return join(getProjectDir(options), ".rules");
}

const TOKENJUICE_ZED_BLOCK = [
  TOKENJUICE_ZED_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets(),
  TOKENJUICE_ZED_END,
].join("\n");

const TOKENJUICE_ZED_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_ZED_BEGIN,
  endMarker: TOKENJUICE_ZED_END,
  block: TOKENJUICE_ZED_BLOCK,
};

export async function installZedInstructions(
  instructionsPath?: string,
  options: ZedInstructionsOptions = {},
): Promise<InstallZedInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_ZED_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallZedInstructions(instructionsPath = getDefaultInstructionsPath()): Promise<UninstallZedInstructionsResult> {
  const result = await uninstallMarkerDelimitedBlock(instructionsPath, TOKENJUICE_ZED_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorZedInstructions(
  instructionsPath?: string,
  options: ZedInstructionsOptions = {},
): Promise<ZedDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  return doctorMarkerStructure(resolvedInstructionsPath, TOKENJUICE_ZED_BLOCK_CONFIG, {
    configuredLabel: "Zed rules",
    advisory: TOKENJUICE_ZED_ADVISORY,
    fixCommand: TOKENJUICE_ZED_FIX_COMMAND,
  });
}
