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

export type DeepAgentsInstructionsOptions = {
  projectDir?: string;
};

export type InstallDeepAgentsInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallDeepAgentsInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type DeepAgentsDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_DEEPAGENTS_FIX_COMMAND = "tokenjuice install deepagents";
const TOKENJUICE_DEEPAGENTS_BEGIN = "<!-- tokenjuice:deepagents begin -->";
const TOKENJUICE_DEEPAGENTS_END = "<!-- tokenjuice:deepagents end -->";
const TOKENJUICE_DEEPAGENTS_ADVISORY =
  "Deep Agents Code support is beta and instruction-based; Deep Agents Code reads project instructions but still owns command execution.";

function getExplicitProjectDir(options: DeepAgentsInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.DEEPAGENTS_PROJECT_DIR;
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

async function resolveProjectDir(options: DeepAgentsInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultInstructionsPath(options: DeepAgentsInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".deepagents", "AGENTS.md");
}

const TOKENJUICE_DEEPAGENTS_BLOCK = [
  TOKENJUICE_DEEPAGENTS_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When running terminal commands through Deep Agents Code, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_DEEPAGENTS_END,
].join("\n");

const TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_DEEPAGENTS_BEGIN,
  endMarker: TOKENJUICE_DEEPAGENTS_END,
  block: TOKENJUICE_DEEPAGENTS_BLOCK,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_DEEPAGENTS_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_DEEPAGENTS_END, beginIndex + TOKENJUICE_DEEPAGENTS_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_DEEPAGENTS_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_DEEPAGENTS_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_DEEPAGENTS_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installDeepAgentsInstructions(
  instructionsPath?: string,
  options: DeepAgentsInstructionsOptions = {},
): Promise<InstallDeepAgentsInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install deepagents`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallDeepAgentsInstructions(
  instructionsPath?: string,
  options: DeepAgentsInstructionsOptions = {},
): Promise<UninstallDeepAgentsInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall deepagents`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorDeepAgentsInstructions(
  instructionsPath?: string,
  options: DeepAgentsInstructionsOptions = {},
): Promise<DeepAgentsDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_DEEPAGENTS_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Deep Agents Code instructions are not installed"],
        advisory: TOKENJUICE_DEEPAGENTS_ADVISORY,
        fixCommand: TOKENJUICE_DEEPAGENTS_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Deep Agents Code instructions",
    repairCommand: TOKENJUICE_DEEPAGENTS_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers && markerIssues.length === 0
      ? ["configured Deep Agents Code instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install deepagents"]
      : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Deep Agents Code instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Deep Agents Code instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Deep Agents Code instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_DEEPAGENTS_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from .deepagents/AGENTS.md, then run tokenjuice install deepagents"
        : TOKENJUICE_DEEPAGENTS_FIX_COMMAND,
    }),
  };
}
