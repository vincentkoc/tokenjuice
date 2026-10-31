import { homedir } from "node:os";
import { join, resolve } from "node:path";

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

export type AgentsCliMemoryOptions = {
  configDir?: string;
};

export type InstallAgentsCliMemoryResult = {
  instructionsPath: string;
  backupPath?: string;
  syncCommand: string;
};

export type UninstallAgentsCliMemoryResult = {
  instructionsPath: string;
  removed: boolean;
  syncCommand: string;
};

export type AgentsCliDoctorReport = {
  instructionsPath: string;
  syncCommand: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AGENTS_CLI_FIX_COMMAND = "tokenjuice install agents-cli";
const TOKENJUICE_AGENTS_CLI_BEGIN = "<!-- tokenjuice:agents-cli begin -->";
const TOKENJUICE_AGENTS_CLI_END = "<!-- tokenjuice:agents-cli end -->";
const TOKENJUICE_AGENTS_CLI_ADVISORY =
  "agents-cli support is beta and memory-based; agents-cli syncs memory into downstream harness configs, but each harness still owns command execution.";

function getAgentsCliConfigDir(options: AgentsCliMemoryOptions = {}): string {
  return resolve(options.configDir || process.env.AGENTS_CLI_HOME || join(homedir(), ".agents"));
}

function getDefaultInstructionsPath(options: AgentsCliMemoryOptions = {}): string {
  return join(getAgentsCliConfigDir(options), "memory", "AGENTS.md");
}

const TOKENJUICE_AGENTS_CLI_BLOCK = [
  TOKENJUICE_AGENTS_CLI_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When agents-cli syncs this memory into coding-agent harnesses, prefer `tokenjuice wrap -- <command>` for terminal commands likely to produce long output.",
  }),
  "- After editing this memory file, run `agents sync` so downstream harness configs receive the updated guidance.",
  TOKENJUICE_AGENTS_CLI_END,
].join("\n");

const TOKENJUICE_AGENTS_CLI_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_AGENTS_CLI_BEGIN,
  endMarker: TOKENJUICE_AGENTS_CLI_END,
  block: TOKENJUICE_AGENTS_CLI_BLOCK,
};

export async function installAgentsCliMemory(
  instructionsPath?: string,
  options: AgentsCliMemoryOptions = {},
): Promise<InstallAgentsCliMemoryResult> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTS_CLI_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_AGENTS_CLI_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install agents-cli`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AGENTS_CLI_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    syncCommand: "agents sync",
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAgentsCliMemory(
  instructionsPath?: string,
  options: AgentsCliMemoryOptions = {},
): Promise<UninstallAgentsCliMemoryResult> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTS_CLI_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_AGENTS_CLI_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall agents-cli`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AGENTS_CLI_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed, syncCommand: "agents sync" };
}

export async function doctorAgentsCliMemory(
  instructionsPath?: string,
  options: AgentsCliMemoryOptions = {},
): Promise<AgentsCliDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTS_CLI_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      syncCommand: "agents sync",
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice agents-cli memory is not installed"],
        advisory: TOKENJUICE_AGENTS_CLI_ADVISORY,
        fixCommand: TOKENJUICE_AGENTS_CLI_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "agents-cli memory",
    repairCommand: TOKENJUICE_AGENTS_CLI_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_AGENTS_CLI_BLOCK_CONFIG);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers && markerIssues.length === 0
      ? ["configured agents-cli memory has malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install agents-cli"]
      : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_AGENTS_CLI_BLOCK_CONFIG), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured agents-cli memory is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured agents-cli memory is missing the raw escape hatch",
        },
        {
          requiredText: "agents sync",
          missingIssue: "configured agents-cli memory is missing sync guidance",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured agents-cli memory still suggests the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    syncCommand: "agents sync",
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_AGENTS_CLI_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from agents-cli memory, then run tokenjuice install agents-cli"
        : TOKENJUICE_AGENTS_CLI_FIX_COMMAND,
    }),
  };
}
