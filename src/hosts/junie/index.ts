import { join } from "node:path";

import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { readInstructionFile } from "../shared/instruction-file.js";

export type JunieInstructionsOptions = {
  projectDir?: string;
};

export type InstallJunieInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallJunieInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type JunieDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_JUNIE_FIX_COMMAND = "tokenjuice install junie";
const TOKENJUICE_JUNIE_BEGIN = "<!-- tokenjuice:begin -->";
const TOKENJUICE_JUNIE_END = "<!-- tokenjuice:end -->";
const TOKENJUICE_JUNIE_ADVISORY = "Junie support is beta and instruction-based; it guides command usage but does not intercept tool output.";

function getProjectDir(options: JunieInstructionsOptions = {}): string {
  return options.projectDir || process.env.JUNIE_PROJECT_DIR || process.cwd();
}

function getDefaultInstructionsPath(options: JunieInstructionsOptions = {}): string {
  return join(getProjectDir(options), ".junie", "AGENTS.md");
}

const TOKENJUICE_JUNIE_BLOCK = [
  TOKENJUICE_JUNIE_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets(),
  TOKENJUICE_JUNIE_END,
].join("\n");

const TOKENJUICE_JUNIE_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_JUNIE_BEGIN,
  endMarker: TOKENJUICE_JUNIE_END,
  block: TOKENJUICE_JUNIE_BLOCK,
};

export async function installJunieInstructions(
  instructionsPath?: string,
  options: JunieInstructionsOptions = {},
): Promise<InstallJunieInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_JUNIE_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallJunieInstructions(instructionsPath = getDefaultInstructionsPath()): Promise<UninstallJunieInstructionsResult> {
  const result = await uninstallMarkerDelimitedBlock(instructionsPath, TOKENJUICE_JUNIE_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorJunieInstructions(
  instructionsPath?: string,
  options: JunieInstructionsOptions = {},
): Promise<JunieDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_JUNIE_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Junie instructions are not installed"],
        advisory: TOKENJUICE_JUNIE_ADVISORY,
        fixCommand: TOKENJUICE_JUNIE_FIX_COMMAND,
      }),
    };
  }

  const issues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Junie instructions",
    repairCommand: TOKENJUICE_JUNIE_FIX_COMMAND,
  });

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_JUNIE_ADVISORY,
      fixCommand: TOKENJUICE_JUNIE_FIX_COMMAND,
    }),
  };
}
