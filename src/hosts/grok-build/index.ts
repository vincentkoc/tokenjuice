import { join, resolve } from "node:path";

import { findGitRoot } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import type { InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import type { RemoveInstructionFileResult, WriteInstructionFileResult } from "../shared/instruction-file.js";

import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";

export type GrokBuildInstructionsOptions = {
  projectDir?: string;
};

export type InstallGrokBuildInstructionsResult = WriteInstructionFileResult<"instructionsPath">;

export type UninstallGrokBuildInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;

export type GrokBuildDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_GROK_BUILD_FIX_COMMAND = "tokenjuice install grok-build";
const TOKENJUICE_GROK_BUILD_BEGIN = "<!-- tokenjuice:grok-build begin -->";
const TOKENJUICE_GROK_BUILD_END = "<!-- tokenjuice:grok-build end -->";
const TOKENJUICE_GROK_BUILD_ADVISORY = "Grok Build support is beta and instruction-based; it guides command usage through project AGENTS.md but does not intercept tool output.";

function getExplicitProjectDir(options: GrokBuildInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.GROK_BUILD_PROJECT_DIR;
}

async function resolveProjectDir(options: GrokBuildInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? resolve(process.cwd());
}

async function getDefaultInstructionsPath(options: GrokBuildInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_GROK_BUILD_BLOCK = [
  TOKENJUICE_GROK_BUILD_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Grok Build, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_GROK_BUILD_END,
].join("\n");

const TOKENJUICE_GROK_BUILD_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_GROK_BUILD_BEGIN,
  endMarker: TOKENJUICE_GROK_BUILD_END,
  block: TOKENJUICE_GROK_BUILD_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("grok-build", TOKENJUICE_GROK_BUILD_BLOCK_CONFIG);

export async function installGrokBuildInstructions(
  instructionsPath?: string,
  options: GrokBuildInstructionsOptions = {},
): Promise<InstallGrokBuildInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallGrokBuildInstructions(
  instructionsPath?: string,
  options: GrokBuildInstructionsOptions = {},
): Promise<UninstallGrokBuildInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorGrokBuildInstructions(
  instructionsPath?: string,
  options: GrokBuildInstructionsOptions = {},
): Promise<GrokBuildDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_GROK_BUILD_BLOCK_CONFIG, {
    configuredLabel: "Grok Build instructions",
    advisory: TOKENJUICE_GROK_BUILD_ADVISORY,
    fixCommand: TOKENJUICE_GROK_BUILD_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install grok-build",
    malformedMarkerIssue: "configured Grok Build instructions have unmatched tokenjuice markers",
  });
}
