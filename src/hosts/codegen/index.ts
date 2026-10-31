import { join } from "node:path";

import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";

export type CodegenInstructionsOptions = {
  projectDir?: string;
};

export type InstallCodegenInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallCodegenInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type CodegenDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_CODEGEN_FIX_COMMAND = "tokenjuice install codegen";
const TOKENJUICE_CODEGEN_BEGIN = "<!-- tokenjuice:codegen begin -->";
const TOKENJUICE_CODEGEN_END = "<!-- tokenjuice:codegen end -->";
const TOKENJUICE_CODEGEN_ADVISORY =
  "Codegen support is beta and rule-file based; Codegen still owns command execution.";

const resolveProjectDir = createProjectDirResolver("CODEGEN_PROJECT_DIR");

async function getDefaultInstructionsPath(options: CodegenInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_CODEGEN_BLOCK = [
  TOKENJUICE_CODEGEN_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When running terminal commands through Codegen agents, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_CODEGEN_END,
].join("\n");

const TOKENJUICE_CODEGEN_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_CODEGEN_BEGIN,
  endMarker: TOKENJUICE_CODEGEN_END,
  block: TOKENJUICE_CODEGEN_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("codegen", TOKENJUICE_CODEGEN_BLOCK_CONFIG);

export async function installCodegenInstructions(
  instructionsPath?: string,
  options: CodegenInstructionsOptions = {},
): Promise<InstallCodegenInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallCodegenInstructions(
  instructionsPath?: string,
  options: CodegenInstructionsOptions = {},
): Promise<UninstallCodegenInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorCodegenInstructions(
  instructionsPath?: string,
  options: CodegenInstructionsOptions = {},
): Promise<CodegenDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_CODEGEN_BLOCK_CONFIG, {
    configuredLabel: "Codegen instructions",
    advisory: TOKENJUICE_CODEGEN_ADVISORY,
    fixCommand: TOKENJUICE_CODEGEN_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install codegen",
  });
}
