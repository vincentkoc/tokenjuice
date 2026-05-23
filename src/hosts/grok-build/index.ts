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

export type GrokBuildInstructionsOptions = {
  projectDir?: string;
};

export type InstallGrokBuildInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallGrokBuildInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type GrokBuildDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_GROK_BUILD_FIX_COMMAND = "tokenjuice install grok-build";
const TOKENJUICE_GROK_BUILD_BEGIN = "<!-- tokenjuice:grok-build begin -->";
const TOKENJUICE_GROK_BUILD_END = "<!-- tokenjuice:grok-build end -->";
const TOKENJUICE_GROK_BUILD_ADVISORY = "Grok Build support is beta and instruction-based; it guides command usage through project AGENTS.md but does not intercept tool output.";

function getExplicitProjectDir(options: GrokBuildInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.GROK_BUILD_PROJECT_DIR;
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
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

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_GROK_BUILD_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_GROK_BUILD_END, beginIndex + TOKENJUICE_GROK_BUILD_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_GROK_BUILD_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_GROK_BUILD_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_GROK_BUILD_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installGrokBuildInstructions(
  instructionsPath?: string,
  options: GrokBuildInstructionsOptions = {},
): Promise<InstallGrokBuildInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GROK_BUILD_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install grok-build`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_GROK_BUILD_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallGrokBuildInstructions(
  instructionsPath?: string,
  options: GrokBuildInstructionsOptions = {},
): Promise<UninstallGrokBuildInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GROK_BUILD_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall grok-build`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_GROK_BUILD_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorGrokBuildInstructions(
  instructionsPath?: string,
  options: GrokBuildInstructionsOptions = {},
): Promise<GrokBuildDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GROK_BUILD_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Grok Build instructions are not installed"],
        advisory: TOKENJUICE_GROK_BUILD_ADVISORY,
        fixCommand: TOKENJUICE_GROK_BUILD_FIX_COMMAND,
      }),
    };
  }

  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Grok Build instructions",
    repairCommand: TOKENJUICE_GROK_BUILD_FIX_COMMAND,
  });
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Grok Build instructions have unmatched tokenjuice markers"] : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Grok Build instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Grok Build instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Grok Build instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_GROK_BUILD_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install grok-build"
        : TOKENJUICE_GROK_BUILD_FIX_COMMAND,
    }),
  };
}
