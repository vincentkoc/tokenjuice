import { lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { findGitRoot } from "../shared/project-root.js";

import {
  createMarkerInstructionCommands,
  getMarkerDelimitedBlockText,
  hasMalformedMarkerDelimitedBlock,
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import {
  type InstructionsDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { collectGuidanceIssues, readInstructionFile } from "../shared/instruction-file.js";

export type AnteInstructionsOptions = {
  projectDir?: string;
};

export type InstallAnteInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallAnteInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type AnteDoctorReport = InstructionsDoctorReport;

const TOKENJUICE_ANTE_FIX_COMMAND = "tokenjuice install ante";
const TOKENJUICE_ANTE_BEGIN = "<!-- tokenjuice:ante begin -->";
const TOKENJUICE_ANTE_END = "<!-- tokenjuice:ante end -->";
const TOKENJUICE_ANTE_ADVISORY = "Ante support is beta and instruction-based; Ante loads project AGENTS.md but still owns command execution.";

function getExplicitProjectDir(options: AnteInstructionsOptions = {}): string | undefined {
  return options.projectDir;
}

async function resolveProjectDir(options: AnteInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? resolve(process.cwd());
}

async function getDefaultInstructionsPath(options: AnteInstructionsOptions = {}): Promise<string> {
  const root = await resolveProjectDir(options);
  let current = options.projectDir ? root : resolve(process.cwd());
  while (true) {
    for (const name of ["AGENTS.md", "CLAUDE.md"]) {
      const path = join(current, name);
      try {
        await lstat(path);
        return path;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const parent = dirname(current);
    if (current === parent) break;
    current = parent;
  }
  return join(root, "AGENTS.md");
}

const TOKENJUICE_ANTE_BLOCK = [
  TOKENJUICE_ANTE_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Ante, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_ANTE_END,
].join("\n");

const TOKENJUICE_ANTE_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_ANTE_BEGIN,
  endMarker: TOKENJUICE_ANTE_END,
  block: TOKENJUICE_ANTE_BLOCK,
  preserveSurroundingText: true,
};

const markerInstructions = createMarkerInstructionCommands("ante", TOKENJUICE_ANTE_BLOCK_CONFIG);

export async function installAnteInstructions(
  instructionsPath?: string,
  options: AnteInstructionsOptions = {},
): Promise<InstallAnteInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallAnteInstructions(
  instructionsPath?: string,
  options: AnteInstructionsOptions = {},
): Promise<UninstallAnteInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorAnteInstructions(
  instructionsPath?: string,
  options: AnteInstructionsOptions = {},
): Promise<AnteDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_ANTE_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Ante instructions are not installed"],
        advisory: TOKENJUICE_ANTE_ADVISORY,
        fixCommand: TOKENJUICE_ANTE_FIX_COMMAND,
      }),
    };
  }

  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_ANTE_BLOCK_CONFIG);
  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Ante instructions",
    repairCommand: TOKENJUICE_ANTE_FIX_COMMAND,
  });
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Ante instructions have unmatched tokenjuice markers"] : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_ANTE_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Ante instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Ante instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Ante instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_ANTE_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from the instruction file, then run tokenjuice install ante"
        : TOKENJUICE_ANTE_FIX_COMMAND,
    }),
  };
}
