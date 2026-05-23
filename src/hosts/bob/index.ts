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

export type BobInstructionsOptions = {
  projectDir?: string;
};

export type InstallBobInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallBobInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type BobDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_BOB_FIX_COMMAND = "tokenjuice install bob";
const TOKENJUICE_BOB_BEGIN = "<!-- tokenjuice:bob begin -->";
const TOKENJUICE_BOB_END = "<!-- tokenjuice:bob end -->";
const TOKENJUICE_BOB_ADVISORY = "IBM Bob support is beta and instruction-based; it guides command usage through project AGENTS.md but does not intercept tool output.";

function getExplicitProjectDir(options: BobInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.BOB_PROJECT_DIR;
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

async function resolveProjectDir(options: BobInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultInstructionsPath(options: BobInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_BOB_BLOCK = [
  TOKENJUICE_BOB_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through IBM Bob, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_BOB_END,
].join("\n");

const TOKENJUICE_BOB_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_BOB_BEGIN,
  endMarker: TOKENJUICE_BOB_END,
  block: TOKENJUICE_BOB_BLOCK,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_BOB_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_BOB_END, beginIndex + TOKENJUICE_BOB_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_BOB_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_BOB_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_BOB_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installBobInstructions(
  instructionsPath?: string,
  options: BobInstructionsOptions = {},
): Promise<InstallBobInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_BOB_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install bob`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_BOB_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallBobInstructions(
  instructionsPath?: string,
  options: BobInstructionsOptions = {},
): Promise<UninstallBobInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_BOB_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall bob`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_BOB_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorBobInstructions(
  instructionsPath?: string,
  options: BobInstructionsOptions = {},
): Promise<BobDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_BOB_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice IBM Bob instructions are not installed"],
        advisory: TOKENJUICE_BOB_ADVISORY,
        fixCommand: TOKENJUICE_BOB_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "IBM Bob instructions",
    repairCommand: TOKENJUICE_BOB_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured IBM Bob instructions have malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured IBM Bob instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured IBM Bob instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured IBM Bob instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_BOB_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install bob"
        : TOKENJUICE_BOB_FIX_COMMAND,
    }),
  };
}
