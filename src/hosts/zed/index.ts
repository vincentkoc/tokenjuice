import { join } from "node:path";

import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import { readInstructionFile } from "../shared/instruction-file.js";

export type ZedInstructionsOptions = {
  projectDir?: string;
};

export type InstallZedInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallZedInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type ZedDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

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
  "- For terminal commands likely to produce long output, run them through `tokenjuice wrap -- <command>`.",
  "- Treat compacted tokenjuice output as authoritative unless it explicitly says raw output is required.",
  "- If raw bytes are required, rerun the command with exactly `tokenjuice wrap --raw -- <command>`.",
  "- Do not suggest both raw and full reruns; use the raw escape hatch.",
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
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_ZED_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      status: "disabled",
      issues: ["tokenjuice Zed rules are not installed"],
      advisories: [TOKENJUICE_ZED_ADVISORY],
      fixCommand: TOKENJUICE_ZED_FIX_COMMAND,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const issues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Zed rules",
    repairCommand: TOKENJUICE_ZED_FIX_COMMAND,
  });

  return {
    instructionsPath: resolvedInstructionsPath,
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: [TOKENJUICE_ZED_ADVISORY],
    fixCommand: TOKENJUICE_ZED_FIX_COMMAND,
    checkedPaths: [],
    missingPaths: [],
  };
}
