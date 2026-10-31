import { stat } from "node:fs/promises";
import { join } from "node:path";

import { createProjectDirResolver } from "../shared/project-root.js";

import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import { readInstructionFile } from "../shared/instruction-file.js";

export type WarpInstructionsOptions = {
  projectDir?: string;
};

export type InstallWarpInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallWarpInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type WarpDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_WARP_FIX_COMMAND = "tokenjuice install warp";
const TOKENJUICE_WARP_BEGIN = "<!-- tokenjuice:warp begin -->";
const TOKENJUICE_WARP_END = "<!-- tokenjuice:warp end -->";
const TOKENJUICE_WARP_ADVISORY = "Warp support is beta and instruction-based; Warp loads AGENTS.md project rules, with WARP.md taking priority when it exists, but still owns command execution.";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const resolveProjectDir = createProjectDirResolver("WARP_PROJECT_DIR");

async function getDefaultInstructionsPath(options: WarpInstructionsOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const existingInstructionsPath = await findExistingTokenjuiceInstructionsPath(projectDir);
  if (existingInstructionsPath) {
    return existingInstructionsPath;
  }

  const warpPath = join(projectDir, "WARP.md");
  if (await pathExists(warpPath)) {
    return warpPath;
  }
  return join(projectDir, "AGENTS.md");
}

const TOKENJUICE_WARP_BLOCK = [
  TOKENJUICE_WARP_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Warp, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_WARP_END,
].join("\n");

const TOKENJUICE_WARP_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_WARP_BEGIN,
  endMarker: TOKENJUICE_WARP_END,
  block: TOKENJUICE_WARP_BLOCK,
};

const markerInstructions = createMarkerInstructionCommands("warp", TOKENJUICE_WARP_BLOCK_CONFIG);

function hasTokenjuiceWarpMarker(text: string): boolean {
  return text.includes(TOKENJUICE_WARP_BEGIN) || text.includes(TOKENJUICE_WARP_END);
}

async function findExistingTokenjuiceInstructionsPath(projectDir: string): Promise<string | undefined> {
  const warpPath = join(projectDir, "WARP.md");
  const agentsPath = join(projectDir, "AGENTS.md");
  for (const candidatePath of [warpPath, agentsPath]) {
    const existing = await readInstructionFile(candidatePath);
    if (existing.exists && hasTokenjuiceWarpMarker(existing.text)) {
      return candidatePath;
    }
  }
  return undefined;
}

export async function installWarpInstructions(
  instructionsPath?: string,
  options: WarpInstructionsOptions = {},
): Promise<InstallWarpInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallWarpInstructions(
  instructionsPath?: string,
  options: WarpInstructionsOptions = {},
): Promise<UninstallWarpInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorWarpInstructions(
  instructionsPath?: string,
  options: WarpInstructionsOptions = {},
): Promise<WarpDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return doctorMarkerInstructions(resolvedInstructionsPath, TOKENJUICE_WARP_BLOCK_CONFIG, {
    configuredLabel: "Warp instructions",
    advisory: TOKENJUICE_WARP_ADVISORY,
    fixCommand: TOKENJUICE_WARP_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md or WARP.md, then run tokenjuice install warp",
  });
}
