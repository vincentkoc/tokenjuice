import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createProjectDirResolver } from "../shared/project-root.js";
import { findAvailableBackupPath } from "../shared/instruction-file.js";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  type InstructionDoctorReportFields,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type SweAgentConfigOptions = {
  projectDir?: string;
};

export type InstallSweAgentConfigResult = {
  configPath: string;
  backupPath?: string;
};

export type UninstallSweAgentConfigResult = {
  configPath: string;
  removed: boolean;
};

export type SweAgentDoctorReport = InstructionDoctorReportFields & {
  configPath: string;
};

const TOKENJUICE_SWE_AGENT_FIX_COMMAND = "tokenjuice install swe-agent";
const TOKENJUICE_SWE_AGENT_MARKER = "tokenjuice SWE-agent observation compaction guidance";
const TOKENJUICE_SWE_AGENT_RESTORE_BACKUP_MARKER_PREFIX = "# tokenjuice:swe-agent-restore-backup=";
const TOKENJUICE_SWE_AGENT_LOAD_COMMAND = "sweagent run --config config/default.yaml --config .swe-agent/tokenjuice.yaml";
const TOKENJUICE_SWE_AGENT_ADVISORY =
  "SWE-agent support is beta and config-fragment based; load it with sweagent run --config config/default.yaml --config .swe-agent/tokenjuice.yaml.";

function isTokenjuiceSweAgentConfigText(text: string): boolean {
  return text.includes(TOKENJUICE_SWE_AGENT_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/^# tokenjuice:swe-agent-restore-backup=(\.bak(?:\.\d+)?)$/mu);
  return match?.[1];
}

async function writeSweAgentConfigWithoutBackup(configPath: string, text: string): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  const tempPath = `${configPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, text, { encoding: "utf8", flag: "wx" });
  try {
    await rename(tempPath, configPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

const resolveProjectDir = createProjectDirResolver("SWE_AGENT_PROJECT_DIR");

async function getDefaultConfigPath(options: SweAgentConfigOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".swe-agent", "tokenjuice.yaml");
}

function buildSweAgentConfig(
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): string {
  return [
    `# ${TOKENJUICE_SWE_AGENT_MARKER}`,
    ...(restoreBackupSuffix ? [`${TOKENJUICE_SWE_AGENT_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix}`] : []),
    `# Load with: ${TOKENJUICE_SWE_AGENT_LOAD_COMMAND}`,
    "agent:",
    "  templates:",
    "    next_step_truncated_observation_template: |-",
    "      OBSERVATION:",
    "      {{observation[:max_observation_length]}}",
    "      <response clipped>",
    "      <NOTE>",
    `      ${TOKENJUICE_SWE_AGENT_MARKER}.`,
    "      The previous command output exceeded {{max_observation_length}} characters.",
    "      {{elided_chars}} characters were elided before SWE-agent prompted for the next action.",
    "      For future terminal commands likely to produce long output, rerun them through:",
    `        ${TOKENJUICE_WRAP_COMMAND}`,
    "      If raw bytes are required, rerun with exactly:",
    `        ${TOKENJUICE_RAW_COMMAND}`,
    "      Prefer narrowing reads with sed/head/tail/rg, or redirect output to a file and search within it.",
    "      </NOTE>",
    "",
    "# Agent-facing fallback guidance for tasks that load this fragment into context.",
    "# Keep this in sync with the truncated-observation template above.",
    "#",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        `- For SWE-agent bash commands likely to produce long output, run them through \`${TOKENJUICE_WRAP_COMMAND}\`.`,
    }).map((bullet) => `# ${bullet}`),
    "",
  ].join("\n");
}

export async function installSweAgentConfig(
  configPath?: string,
  options: SweAgentConfigOptions = {},
): Promise<InstallSweAgentConfigResult> {
  const resolvedConfigPath = configPath ?? (await getDefaultConfigPath(options));
  const existing = await readInstructionFile(resolvedConfigPath);
  if (existing.exists && isTokenjuiceSweAgentConfigText(existing.text)) {
    const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
    if (existing.text === buildSweAgentConfig({ restoreBackupSuffix })) {
      return { configPath: resolvedConfigPath };
    }

    const result = await writeInstructionFile(resolvedConfigPath, buildSweAgentConfig({ restoreBackupSuffix }));
    return {
      configPath: result.filePath,
      ...(result.backupPath ? { backupPath: result.backupPath } : {}),
    };
  }

  if (existing.exists) {
    const backupPath = await findAvailableBackupPath(resolvedConfigPath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx" });
    await writeSweAgentConfigWithoutBackup(
      resolvedConfigPath,
      buildSweAgentConfig({ restoreBackupSuffix: backupPath.slice(resolvedConfigPath.length) }),
    );
    return { configPath: resolvedConfigPath, backupPath };
  }

  const result = await writeInstructionFile(resolvedConfigPath, buildSweAgentConfig());
  return {
    configPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallSweAgentConfig(
  configPath?: string,
  options: SweAgentConfigOptions = {},
): Promise<UninstallSweAgentConfigResult> {
  const resolvedConfigPath = configPath ?? (await getDefaultConfigPath(options));
  const existing = await readInstructionFile(resolvedConfigPath);
  if (!existing.exists || !isTokenjuiceSweAgentConfigText(existing.text)) {
    return { configPath: resolvedConfigPath, removed: false };
  }

  const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
  if (restoreBackupSuffix) {
    const backupPath = `${resolvedConfigPath}${restoreBackupSuffix}`;
    const backup = await readInstructionFile(backupPath);
    if (backup.exists && !isTokenjuiceSweAgentConfigText(backup.text)) {
      await rm(resolvedConfigPath, { force: true });
      await rename(backupPath, resolvedConfigPath);
      return { configPath: resolvedConfigPath, removed: true };
    }
  }

  const result = await removeInstructionFile(resolvedConfigPath);
  return { configPath: result.filePath, removed: result.removed };
}

export async function doctorSweAgentConfig(
  configPath?: string,
  options: SweAgentConfigOptions = {},
): Promise<SweAgentDoctorReport> {
  const resolvedConfigPath = configPath ?? (await getDefaultConfigPath(options));
  const existing = await readInstructionFile(resolvedConfigPath);
  if (!existing.exists) {
    return {
      configPath: resolvedConfigPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice SWE-agent config fragment is not installed"],
        advisory: TOKENJUICE_SWE_AGENT_ADVISORY,
        fixCommand: TOKENJUICE_SWE_AGENT_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_SWE_AGENT_MARKER,
        missingIssue: "configured SWE-agent config does not look like the tokenjuice fragment",
      },
      {
        requiredText: "agent:",
        missingIssue: "configured SWE-agent config is missing agent config wiring",
      },
      {
        requiredText: "templates:",
        missingIssue: "configured SWE-agent config is missing template wiring",
      },
      {
        requiredText: "next_step_truncated_observation_template",
        missingIssue: "configured SWE-agent config is missing truncated observation template wiring",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured SWE-agent config is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured SWE-agent config is missing the raw escape hatch",
      },
      {
        requiredText: TOKENJUICE_SWE_AGENT_LOAD_COMMAND,
        missingIssue: "configured SWE-agent config is missing load guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured SWE-agent config still suggests the full escape hatch",
      },
    ],
  });

  return {
    configPath: resolvedConfigPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_SWE_AGENT_ADVISORY,
      fixCommand: TOKENJUICE_SWE_AGENT_FIX_COMMAND,
    }),
  };
}
