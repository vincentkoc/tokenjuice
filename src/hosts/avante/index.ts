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

export type AvanteInstructionsOptions = {
  projectDir?: string;
};

export type InstallAvanteInstructionsResult = WriteInstructionFileResult<"instructionsPath">;

export type UninstallAvanteInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;

export type AvanteDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_AVANTE_FIX_COMMAND = "tokenjuice install avante";
const TOKENJUICE_AVANTE_BEGIN = "<!-- tokenjuice:begin -->";
const TOKENJUICE_AVANTE_END = "<!-- tokenjuice:end -->";
const TOKENJUICE_AVANTE_ADVISORY = "Avante support is beta and instruction-based; it guides command usage but does not intercept tool output.";

function getProjectDir(options: AvanteInstructionsOptions = {}): string {
  return options.projectDir || process.env.AVANTE_PROJECT_DIR || process.cwd();
}

function getDefaultInstructionsPath(options: AvanteInstructionsOptions = {}): string {
  return join(getProjectDir(options), "avante.md");
}

const TOKENJUICE_AVANTE_BLOCK = [
  TOKENJUICE_AVANTE_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets(),
  TOKENJUICE_AVANTE_END,
].join("\n");

const TOKENJUICE_AVANTE_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_AVANTE_BEGIN,
  endMarker: TOKENJUICE_AVANTE_END,
  block: TOKENJUICE_AVANTE_BLOCK,
};

export async function installAvanteInstructions(
  instructionsPath?: string,
  options: AvanteInstructionsOptions = {},
): Promise<InstallAvanteInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AVANTE_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAvanteInstructions(instructionsPath = getDefaultInstructionsPath()): Promise<UninstallAvanteInstructionsResult> {
  const result = await uninstallMarkerDelimitedBlock(instructionsPath, TOKENJUICE_AVANTE_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorAvanteInstructions(
  instructionsPath?: string,
  options: AvanteInstructionsOptions = {},
): Promise<AvanteDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  return doctorMarkerStructure(resolvedInstructionsPath, TOKENJUICE_AVANTE_BLOCK_CONFIG, {
    configuredLabel: "Avante instructions",
    advisory: TOKENJUICE_AVANTE_ADVISORY,
    fixCommand: TOKENJUICE_AVANTE_FIX_COMMAND,
  });
}
