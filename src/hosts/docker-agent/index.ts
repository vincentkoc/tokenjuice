import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type DockerAgentPromptOptions = {
  projectDir?: string;
};

export type InstallDockerAgentPromptResult = {
  promptPath: string;
  backupPath?: string;
};

export type UninstallDockerAgentPromptResult = {
  promptPath: string;
  removed: boolean;
};

export type DockerAgentDoctorReport = {
  promptPath: string;
  status: "ok" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_DOCKER_AGENT_FIX_COMMAND = "tokenjuice install docker-agent";
const TOKENJUICE_DOCKER_AGENT_MARKER = "tokenjuice Docker Agent terminal output compaction";
const TOKENJUICE_DOCKER_AGENT_RESTORE_BACKUP_MARKER_PREFIX = "# tokenjuice:docker-agent-restore-backup=";
const TOKENJUICE_DOCKER_AGENT_LOAD_GUIDANCE = "add `.docker-agent/tokenjuice.md` to `agents.<name>.add_prompt_files`";
const TOKENJUICE_DOCKER_AGENT_ADVISORY =
  "Docker Agent support is beta and prompt-file based; add `.docker-agent/tokenjuice.md` to the agent config's `add_prompt_files` list.";

function isTokenjuiceDockerAgentPromptText(text: string): boolean {
  return text.includes(TOKENJUICE_DOCKER_AGENT_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/^# tokenjuice:docker-agent-restore-backup=(\.bak(?:\.\d+)?)$/mu);
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

async function chooseDockerAgentBackupPath(promptPath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${promptPath}.bak` : `${promptPath}.bak.${index}`;
    if (!(await backupPathExists(candidate))) {
      return candidate;
    }
  }
}

async function writeDockerAgentPromptWithoutBackup(promptPath: string, text: string): Promise<void> {
  await mkdir(dirname(promptPath), { recursive: true });
  const tempPath = `${promptPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, text, { encoding: "utf8", flag: "wx" });
  try {
    await rename(tempPath, promptPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

function getExplicitProjectDir(options: DockerAgentPromptOptions = {}): string | undefined {
  return options.projectDir || process.env.DOCKER_AGENT_PROJECT_DIR || process.env.CAGENT_PROJECT_DIR;
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

async function resolveProjectDir(options: DockerAgentPromptOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultPromptPath(options: DockerAgentPromptOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".docker-agent", "tokenjuice.md");
}

function buildDockerAgentPrompt(
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): string {
  return [
    `# ${TOKENJUICE_DOCKER_AGENT_MARKER}`,
    ...(restoreBackupSuffix ? [`${TOKENJUICE_DOCKER_AGENT_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix}`] : []),
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        `- When Docker Agent runs shell commands likely to produce long output, prefer \`${TOKENJUICE_WRAP_COMMAND}\`.`,
    }),
    "",
    "For Docker Agent configs, load this prompt file from the relevant agent:",
    "",
    "```yaml",
    "agents:",
    "  root:",
    "    add_prompt_files:",
    "      - .docker-agent/tokenjuice.md",
    "```",
    "",
    `In short: ${TOKENJUICE_DOCKER_AGENT_LOAD_GUIDANCE}.`,
    "",
  ].join("\n");
}

export async function installDockerAgentPrompt(
  promptPath?: string,
  options: DockerAgentPromptOptions = {},
): Promise<InstallDockerAgentPromptResult> {
  const resolvedPromptPath = promptPath ?? (await getDefaultPromptPath(options));
  const existing = await readInstructionFile(resolvedPromptPath);
  if (existing.exists && isTokenjuiceDockerAgentPromptText(existing.text)) {
    const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
    if (existing.text === buildDockerAgentPrompt({ restoreBackupSuffix })) {
      return { promptPath: resolvedPromptPath };
    }

    const result = await writeInstructionFile(
      resolvedPromptPath,
      buildDockerAgentPrompt({ restoreBackupSuffix }),
    );
    return {
      promptPath: result.filePath,
      ...(result.backupPath ? { backupPath: result.backupPath } : {}),
    };
  }

  if (existing.exists) {
    const backupPath = await chooseDockerAgentBackupPath(resolvedPromptPath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx" });
    await writeDockerAgentPromptWithoutBackup(
      resolvedPromptPath,
      buildDockerAgentPrompt({ restoreBackupSuffix: backupPath.slice(resolvedPromptPath.length) }),
    );
    return { promptPath: resolvedPromptPath, backupPath };
  }

  const result = await writeInstructionFile(resolvedPromptPath, buildDockerAgentPrompt());
  return {
    promptPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallDockerAgentPrompt(
  promptPath?: string,
  options: DockerAgentPromptOptions = {},
): Promise<UninstallDockerAgentPromptResult> {
  const resolvedPromptPath = promptPath ?? (await getDefaultPromptPath(options));
  const existing = await readInstructionFile(resolvedPromptPath);
  if (!existing.exists || !isTokenjuiceDockerAgentPromptText(existing.text)) {
    return { promptPath: resolvedPromptPath, removed: false };
  }

  const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
  if (restoreBackupSuffix) {
    const backupPath = `${resolvedPromptPath}${restoreBackupSuffix}`;
    const backup = await readInstructionFile(backupPath);
    if (backup.exists && !isTokenjuiceDockerAgentPromptText(backup.text)) {
      await rm(resolvedPromptPath, { force: true });
      await rename(backupPath, resolvedPromptPath);
      return { promptPath: resolvedPromptPath, removed: true };
    }
  }

  const result = await removeInstructionFile(resolvedPromptPath);
  return { promptPath: result.filePath, removed: result.removed };
}

export async function doctorDockerAgentPrompt(
  promptPath?: string,
  options: DockerAgentPromptOptions = {},
): Promise<DockerAgentDoctorReport> {
  const resolvedPromptPath = promptPath ?? (await getDefaultPromptPath(options));
  const existing = await readInstructionFile(resolvedPromptPath);
  if (!existing.exists) {
    return {
      promptPath: resolvedPromptPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Docker Agent prompt file is not installed"],
        advisory: TOKENJUICE_DOCKER_AGENT_ADVISORY,
        fixCommand: TOKENJUICE_DOCKER_AGENT_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_DOCKER_AGENT_MARKER,
        missingIssue: "configured Docker Agent prompt file does not look like the tokenjuice prompt",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Docker Agent prompt file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Docker Agent prompt file is missing the raw escape hatch",
      },
      {
        requiredText: ".docker-agent/tokenjuice.md",
        missingIssue: "configured Docker Agent prompt file is missing prompt-file path guidance",
      },
      {
        requiredText: "add_prompt_files",
        missingIssue: "configured Docker Agent prompt file is missing add_prompt_files guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Docker Agent prompt file still suggests the full escape hatch",
      },
    ],
  });

  return {
    promptPath: resolvedPromptPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_DOCKER_AGENT_ADVISORY,
      fixCommand: TOKENJUICE_DOCKER_AGENT_FIX_COMMAND,
    }),
  };
}
