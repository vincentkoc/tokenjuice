import { join } from "node:path";

import {
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  readInstructionFile,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";

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
  "- For terminal commands likely to produce long output, run them through `tokenjuice wrap -- <command>`.",
  "- Treat compacted tokenjuice output as authoritative unless it explicitly says raw output is required.",
  "- If raw bytes are required, rerun the command with exactly `tokenjuice wrap --raw -- <command>`.",
  "- Do not suggest both raw and full reruns; use the raw escape hatch.",
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
      status: "disabled",
      issues: ["tokenjuice Junie instructions are not installed"],
      advisories: [TOKENJUICE_JUNIE_ADVISORY],
      fixCommand: TOKENJUICE_JUNIE_FIX_COMMAND,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const issues: string[] = [];
  if (markerState.hasBegin && !markerState.hasEnd) {
    issues.push("configured Junie instructions have a tokenjuice start marker without an end marker");
  } else if (!markerState.hasBegin && markerState.hasEnd) {
    issues.push("configured Junie instructions have a tokenjuice end marker without a start marker");
  } else if (markerState.completeBlockCount !== 1) {
    issues.push("configured Junie instructions have multiple tokenjuice blocks; run tokenjuice install junie to repair");
  }

  return {
    instructionsPath: resolvedInstructionsPath,
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: [TOKENJUICE_JUNIE_ADVISORY],
    fixCommand: TOKENJUICE_JUNIE_FIX_COMMAND,
    checkedPaths: [],
    missingPaths: [],
  };
}
