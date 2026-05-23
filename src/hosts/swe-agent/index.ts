import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
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

export type SweAgentDoctorReport = {
  configPath: string;
  status: "ok" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
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

async function backupPathExists(backupPath: string): Promise<boolean> {
  try {
    await lstat(backupPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function chooseSweAgentBackupPath(configPath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${configPath}.bak` : `${configPath}.bak.${index}`;
    if (!(await backupPathExists(candidate))) {
      return candidate;
    }
  }
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

function getExplicitProjectDir(options: SweAgentConfigOptions = {}): string | undefined {
  return options.projectDir || process.env.SWE_AGENT_PROJECT_DIR;
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

async function resolveProjectDir(options: SweAgentConfigOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

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
    const backupPath = await chooseSweAgentBackupPath(resolvedConfigPath);
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
