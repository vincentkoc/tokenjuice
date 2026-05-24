import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
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

export type MiniSweAgentDoctorReport = {
  configPath: string;
  status: "ok" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
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

async function chooseMiniSweAgentBackupPath(configPath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${configPath}.bak` : `${configPath}.bak.${index}`;
    if (!(await backupPathExists(candidate))) {
      return candidate;
    }
  }
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

function getExplicitProjectDir(options: MiniSweAgentConfigOptions = {}): string | undefined {
  return options.projectDir || process.env.MINI_SWE_AGENT_PROJECT_DIR;
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

async function resolveProjectDir(options: MiniSweAgentConfigOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

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

export async function installMiniSweAgentConfig(
  configPath?: string,
  options: MiniSweAgentConfigOptions = {},
): Promise<InstallMiniSweAgentConfigResult> {
  const resolvedConfigPath = configPath ?? (await getDefaultConfigPath(options));
  const existing = await readInstructionFile(resolvedConfigPath);
  if (existing.exists && isTokenjuiceMiniSweAgentConfigText(existing.text)) {
    const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
    if (existing.text === buildMiniSweAgentConfig({ restoreBackupSuffix })) {
      return { configPath: resolvedConfigPath };
    }

    const result = await writeInstructionFile(
      resolvedConfigPath,
      buildMiniSweAgentConfig({ restoreBackupSuffix }),
    );
    return {
      configPath: result.filePath,
      ...(result.backupPath ? { backupPath: result.backupPath } : {}),
    };
  }

  if (existing.exists) {
    const backupPath = await chooseMiniSweAgentBackupPath(resolvedConfigPath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx" });
    await writeMiniSweAgentConfigWithoutBackup(
      resolvedConfigPath,
      buildMiniSweAgentConfig({ restoreBackupSuffix: backupPath.slice(resolvedConfigPath.length) }),
    );
    return { configPath: resolvedConfigPath, backupPath };
  }

  const result = await writeInstructionFile(resolvedConfigPath, buildMiniSweAgentConfig());
  return {
    configPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallMiniSweAgentConfig(
  configPath?: string,
  options: MiniSweAgentConfigOptions = {},
): Promise<UninstallMiniSweAgentConfigResult> {
  const resolvedConfigPath = configPath ?? (await getDefaultConfigPath(options));
  const existing = await readInstructionFile(resolvedConfigPath);
  if (!existing.exists || !isTokenjuiceMiniSweAgentConfigText(existing.text)) {
    return { configPath: resolvedConfigPath, removed: false };
  }

  const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
  if (restoreBackupSuffix) {
    const backupPath = `${resolvedConfigPath}${restoreBackupSuffix}`;
    const backup = await readInstructionFile(backupPath);
    if (backup.exists && !isTokenjuiceMiniSweAgentConfigText(backup.text)) {
      await rm(resolvedConfigPath, { force: true });
      await rename(backupPath, resolvedConfigPath);
      return { configPath: resolvedConfigPath, removed: true };
    }
  }

  const result = await removeInstructionFile(resolvedConfigPath);
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

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_MINI_SWE_AGENT_MARKER,
        missingIssue: "configured mini-SWE-agent config does not look like the tokenjuice fragment",
      },
      {
        requiredText: "observation_template",
        missingIssue: "configured mini-SWE-agent config is missing observation template wiring",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured mini-SWE-agent config is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured mini-SWE-agent config is missing the raw escape hatch",
      },
      {
        requiredText: "mini -c mini.yaml -c .mini-swe-agent/tokenjuice.yaml",
        missingIssue: "configured mini-SWE-agent config is missing load guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured mini-SWE-agent config still suggests the full escape hatch",
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
