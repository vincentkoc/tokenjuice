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

function getExplicitProjectDir(options: CodegenInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.CODEGEN_PROJECT_DIR;
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

async function resolveProjectDir(options: CodegenInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

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

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_CODEGEN_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_CODEGEN_END, beginIndex + TOKENJUICE_CODEGEN_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_CODEGEN_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_CODEGEN_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_CODEGEN_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installCodegenInstructions(
  instructionsPath?: string,
  options: CodegenInstructionsOptions = {},
): Promise<InstallCodegenInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_CODEGEN_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install codegen`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_CODEGEN_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallCodegenInstructions(
  instructionsPath?: string,
  options: CodegenInstructionsOptions = {},
): Promise<UninstallCodegenInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_CODEGEN_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall codegen`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_CODEGEN_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorCodegenInstructions(
  instructionsPath?: string,
  options: CodegenInstructionsOptions = {},
): Promise<CodegenDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_CODEGEN_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Codegen instructions are not installed"],
        advisory: TOKENJUICE_CODEGEN_ADVISORY,
        fixCommand: TOKENJUICE_CODEGEN_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Codegen instructions",
    repairCommand: TOKENJUICE_CODEGEN_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Codegen instructions have malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Codegen instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Codegen instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Codegen instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_CODEGEN_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install codegen"
        : TOKENJUICE_CODEGEN_FIX_COMMAND,
    }),
  };
}
