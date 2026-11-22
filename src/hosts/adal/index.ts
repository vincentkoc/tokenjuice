import { join } from "node:path";

import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import type { RemoveInstructionFileResult, WriteInstructionFileResult } from "../shared/instruction-file.js";

export type AdalInstructionsOptions = {
  projectDir?: string;
};

export type InstallAdalInstructionsResult = WriteInstructionFileResult<"instructionsPath">;

export type UninstallAdalInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;

export type AdalDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_ADAL_FIX_COMMAND = "tokenjuice install adal";
const TOKENJUICE_ADAL_BEGIN = "<!-- tokenjuice:adal begin -->";
const TOKENJUICE_ADAL_END = "<!-- tokenjuice:adal end -->";
const TOKENJUICE_ADAL_ADVISORY =
  "AdaL CLI support is beta and instruction-based; AdaL reads project AGENTS.md context but still owns command execution.";

const resolveProjectDir = createProjectDirResolver("ADAL_PROJECT_DIR");

async function getDefaultInstructionsPath(options: AdalInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_ADAL_BLOCK = [
  TOKENJUICE_ADAL_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When running terminal commands through AdaL CLI, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_ADAL_END,
].join("\n");

const TOKENJUICE_ADAL_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_ADAL_BEGIN,
  endMarker: TOKENJUICE_ADAL_END,
  block: TOKENJUICE_ADAL_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("adal", TOKENJUICE_ADAL_BLOCK_CONFIG);

export async function installAdalInstructions(
  instructionsPath?: string,
  options: AdalInstructionsOptions = {},
): Promise<InstallAdalInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallAdalInstructions(
  instructionsPath?: string,
  options: AdalInstructionsOptions = {},
): Promise<UninstallAdalInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorAdalInstructions(
  instructionsPath?: string,
  options: AdalInstructionsOptions = {},
): Promise<AdalDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_ADAL_BLOCK_CONFIG, {
    configuredLabel: "AdaL CLI instructions",
    advisory: TOKENJUICE_ADAL_ADVISORY,
    fixCommand: TOKENJUICE_ADAL_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install adal",
    malformedMarkerIssue: "configured AdaL CLI instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install adal",
    malformedIssueOnlyWithoutMarkerIssues: true,
  });
}
