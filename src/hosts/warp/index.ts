import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { collectGuidanceIssues, readInstructionFile } from "../shared/instruction-file.js";

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

function getExplicitProjectDir(options: WarpInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.WARP_PROJECT_DIR;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  return await pathExists(join(dir, ".git"));
}

async function findGitRoot(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    if (await hasGitMetadata(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function resolveProjectDir(options: WarpInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

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

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_WARP_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_WARP_END, beginIndex + TOKENJUICE_WARP_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_WARP_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_WARP_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_WARP_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

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
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_WARP_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install warp`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_WARP_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallWarpInstructions(
  instructionsPath?: string,
  options: WarpInstructionsOptions = {},
): Promise<UninstallWarpInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_WARP_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall warp`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_WARP_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorWarpInstructions(
  instructionsPath?: string,
  options: WarpInstructionsOptions = {},
): Promise<WarpDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_WARP_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Warp instructions are not installed"],
        advisory: TOKENJUICE_WARP_ADVISORY,
        fixCommand: TOKENJUICE_WARP_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Warp instructions",
    repairCommand: TOKENJUICE_WARP_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Warp instructions have malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Warp instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Warp instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Warp instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_WARP_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md or WARP.md, then run tokenjuice install warp"
        : TOKENJUICE_WARP_FIX_COMMAND,
    }),
  };
}
