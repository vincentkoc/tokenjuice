import { join, resolve } from "node:path";

import { findGitRoot } from "../shared/project-root.js";

import {
  getMarkerDelimitedBlockText,
  hasMalformedMarkerDelimitedBlock,
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

export type MistralVibeInstructionsOptions = {
  projectDir?: string;
};

export type InstallMistralVibeInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallMistralVibeInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type MistralVibeDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_MISTRAL_VIBE_FIX_COMMAND = "tokenjuice install mistral-vibe";
const TOKENJUICE_MISTRAL_VIBE_BEGIN = "<!-- tokenjuice:mistral-vibe begin -->";
const TOKENJUICE_MISTRAL_VIBE_END = "<!-- tokenjuice:mistral-vibe end -->";
const TOKENJUICE_MISTRAL_VIBE_ADVISORY = "Mistral Vibe support is beta and instruction-based; Vibe loads root AGENTS.md but still owns command execution.";

function getExplicitProjectDir(options: MistralVibeInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.MISTRAL_VIBE_PROJECT_DIR;
}

async function resolveProjectDir(options: MistralVibeInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultInstructionsPath(options: MistralVibeInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.md");
}

const TOKENJUICE_MISTRAL_VIBE_BLOCK = [
  TOKENJUICE_MISTRAL_VIBE_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Mistral Vibe, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_MISTRAL_VIBE_END,
].join("\n");

const TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_MISTRAL_VIBE_BEGIN,
  endMarker: TOKENJUICE_MISTRAL_VIBE_END,
  block: TOKENJUICE_MISTRAL_VIBE_BLOCK,
};

export async function installMistralVibeInstructions(
  instructionsPath?: string,
  options: MistralVibeInstructionsOptions = {},
): Promise<InstallMistralVibeInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install mistral-vibe`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallMistralVibeInstructions(
  instructionsPath?: string,
  options: MistralVibeInstructionsOptions = {},
): Promise<UninstallMistralVibeInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall mistral-vibe`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorMistralVibeInstructions(
  instructionsPath?: string,
  options: MistralVibeInstructionsOptions = {},
): Promise<MistralVibeDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Mistral Vibe instructions are not installed"],
        advisory: TOKENJUICE_MISTRAL_VIBE_ADVISORY,
        fixCommand: TOKENJUICE_MISTRAL_VIBE_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Mistral Vibe instructions",
    repairCommand: TOKENJUICE_MISTRAL_VIBE_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Mistral Vibe instructions have malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_MISTRAL_VIBE_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Mistral Vibe instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Mistral Vibe instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Mistral Vibe instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_MISTRAL_VIBE_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install mistral-vibe"
        : TOKENJUICE_MISTRAL_VIBE_FIX_COMMAND,
    }),
  };
}
