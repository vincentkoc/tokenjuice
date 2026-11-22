import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createProjectDirResolver } from "../shared/project-root.js";
import {
  createRestorableInstructionCommands,
  readInstructionFile,
} from "../shared/instruction-file.js";

import {
  collectTokenjuiceGuidanceIssues,
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import {
  type InstructionDoctorReportFields,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type MiniSweAgentConfigOptions = {
  projectDir?: string;
};

export type InstallMiniSweAgentConfigResult = {
  configPath: string;
  backupPath?: string;
};

export type UninstallMiniSweAgentConfigResult = {
  configPath: string;
  removed: boolean;
};

export type MiniSweAgentDoctorReport = InstructionDoctorReportFields & {
  configPath: string;
};

const TOKENJUICE_MINI_SWE_AGENT_FIX_COMMAND = "tokenjuice install mini-swe-agent";
const TOKENJUICE_MINI_SWE_AGENT_MARKER = "tokenjuice mini-SWE-agent observation compaction guidance";
const TOKENJUICE_MINI_SWE_AGENT_RESTORE_BACKUP_MARKER_PREFIX = "# tokenjuice:mini-swe-agent-restore-backup=";
const TOKENJUICE_MINI_SWE_AGENT_ADVISORY =
  "mini-SWE-agent support is beta and config-fragment based; load it with mini -c mini.yaml -c .mini-swe-agent/tokenjuice.yaml.";

function isTokenjuiceMiniSweAgentConfigText(text: string): boolean {
  return text.includes(TOKENJUICE_MINI_SWE_AGENT_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/^# tokenjuice:mini-swe-agent-restore-backup=(\.bak(?:\.\d+)?)$/mu);
  return match?.[1];
}

async function writeMiniSweAgentConfigWithoutBackup(configPath: string, text: string): Promise<void> {
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

const resolveProjectDir = createProjectDirResolver("MINI_SWE_AGENT_PROJECT_DIR");

async function getDefaultConfigPath(options: MiniSweAgentConfigOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".mini-swe-agent", "tokenjuice.yaml");
}

function buildMiniSweAgentConfig(
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): string {
  return [
    `# ${TOKENJUICE_MINI_SWE_AGENT_MARKER}`,
    ...(restoreBackupSuffix ? [`${TOKENJUICE_MINI_SWE_AGENT_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix}`] : []),
    "# Load with: mini -c mini.yaml -c .mini-swe-agent/tokenjuice.yaml",
    "model:",
    "  observation_template: |",
    "    {%- if output.exception_info -%}",
    "    <exception>{{ output.exception_info }}</exception>",
    "    {%- endif -%}",
    "    <returncode>{{ output.returncode }}</returncode>",
    "    {%- if output.output | length < 10000 -%}",
    "    <output>",
    "    {{ output.output -}}",
    "    </output>",
    "    {%- else -%}",
    "    <warning>",
    "    The previous command output was too long for direct context.",
    `    ${TOKENJUICE_MINI_SWE_AGENT_MARKER}.`,
    "    For future terminal commands likely to produce long output, rerun them through:",
    `      ${TOKENJUICE_WRAP_COMMAND}`,
    "    If raw bytes are required, rerun with exactly:",
    `      ${TOKENJUICE_RAW_COMMAND}`,
    "    You can also narrow file reads with sed/head/tail, or redirect output to a file and search within it.",
    "    </warning>",
    "    <output_head>",
    "    {{ output.output[:5000] }}",
    "    </output_head>",
    "    <elided_chars>{{ output.output | length - 10000 }} characters elided</elided_chars>",
    "    <output_tail>",
    "    {{ output.output[-5000:] }}",
    "    </output_tail>",
    "    {%- endif -%}",
    "",
    "# Agent-facing fallback guidance for tasks that load this fragment into context.",
    "# Keep this in sync with the observation template above.",
    "#",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        `- For mini-SWE-agent bash commands likely to produce long output, run them through \`${TOKENJUICE_WRAP_COMMAND}\`.`,
    }).map((bullet) => `# ${bullet}`),
    "",
  ].join("\n");
}

const restorableCommands = createRestorableInstructionCommands({
  buildText: buildMiniSweAgentConfig,
  isManagedText: isTokenjuiceMiniSweAgentConfigText,
  readRestoreBackupSuffix,
  writeWithoutBackup: writeMiniSweAgentConfigWithoutBackup,
});

export async function installMiniSweAgentConfig(
  configPath?: string,
  options: MiniSweAgentConfigOptions = {},
): Promise<InstallMiniSweAgentConfigResult> {
  const resolvedConfigPath = configPath ?? (await getDefaultConfigPath(options));
  const result = await restorableCommands.install(resolvedConfigPath);
  return { configPath: result.filePath, ...(result.backupPath ? { backupPath: result.backupPath } : {}) };
}

export async function uninstallMiniSweAgentConfig(
  configPath?: string,
  options: MiniSweAgentConfigOptions = {},
): Promise<UninstallMiniSweAgentConfigResult> {
  const resolvedConfigPath = configPath ?? (await getDefaultConfigPath(options));
  const result = await restorableCommands.uninstall(resolvedConfigPath);
  return { configPath: result.filePath, removed: result.removed };
}

export async function doctorMiniSweAgentConfig(
  configPath?: string,
  options: MiniSweAgentConfigOptions = {},
): Promise<MiniSweAgentDoctorReport> {
  const resolvedConfigPath = configPath ?? (await getDefaultConfigPath(options));
  const existing = await readInstructionFile(resolvedConfigPath);
  if (!existing.exists) {
    return {
      configPath: resolvedConfigPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice mini-SWE-agent config fragment is not installed"],
        advisory: TOKENJUICE_MINI_SWE_AGENT_ADVISORY,
        fixCommand: TOKENJUICE_MINI_SWE_AGENT_FIX_COMMAND,
      }),
    };
  }

  const issues = collectTokenjuiceGuidanceIssues(existing.text, {
    configuredLabel: "mini-SWE-agent config",
    singular: true,
    additionalRequired: [
      {
        requiredText: TOKENJUICE_MINI_SWE_AGENT_MARKER,
        missingIssue: "configured mini-SWE-agent config does not look like the tokenjuice fragment",
      },
      {
        requiredText: "observation_template",
        missingIssue: "configured mini-SWE-agent config is missing observation template wiring",
      },
    ],
    additionalRequiredAfter: [
      {
        requiredText: "mini -c mini.yaml -c .mini-swe-agent/tokenjuice.yaml",
        missingIssue: "configured mini-SWE-agent config is missing load guidance",
      },
    ],
  });

  return {
    configPath: resolvedConfigPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_MINI_SWE_AGENT_ADVISORY,
      fixCommand: TOKENJUICE_MINI_SWE_AGENT_FIX_COMMAND,
    }),
  };
}
