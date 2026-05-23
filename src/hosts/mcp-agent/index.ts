import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type McpAgentDefinitionOptions = {
  projectDir?: string;
};

export type InstallMcpAgentDefinitionResult = {
  agentPath: string;
  backupPath?: string;
};

export type UninstallMcpAgentDefinitionResult = {
  agentPath: string;
  removed: boolean;
};

export type McpAgentDoctorReport = {
  agentPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_MCP_AGENT_FIX_COMMAND = "tokenjuice install mcp-agent";
const TOKENJUICE_MCP_AGENT_MARKER = "tokenjuice mcp-agent terminal output compaction";
const TOKENJUICE_MCP_AGENT_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:mcp-agent-restore-backup=";
const TOKENJUICE_MCP_AGENT_LOAD_GUIDANCE = "enable agents.search_paths with .mcp-agent/agents in mcp_agent.config.yaml";
const TOKENJUICE_MCP_AGENT_ADVISORY =
  "mcp-agent support is beta and agent-file based; enable `.mcp-agent/agents` in `agents.search_paths` so mcp-agent can load it.";

function isTokenjuiceMcpAgentDefinitionText(text: string): boolean {
  return text.includes(TOKENJUICE_MCP_AGENT_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/^<!-- tokenjuice:mcp-agent-restore-backup=(\.bak(?:\.\d+)?) -->$/mu);
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

async function chooseMcpAgentBackupPath(agentPath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${agentPath}.bak` : `${agentPath}.bak.${index}`;
    if (!(await backupPathExists(candidate))) {
      return candidate;
    }
  }
}

async function writeMcpAgentDefinitionWithoutBackup(agentPath: string, text: string): Promise<void> {
  await mkdir(dirname(agentPath), { recursive: true });
  const tempPath = `${agentPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, text, { encoding: "utf8", flag: "wx" });
  try {
    await rename(tempPath, agentPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

function getExplicitProjectDir(options: McpAgentDefinitionOptions = {}): string | undefined {
  return options.projectDir || process.env.MCP_AGENT_PROJECT_DIR;
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

async function resolveProjectDir(options: McpAgentDefinitionOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

function isInsideOrEqual(parentDir: string, childPath: string): boolean {
  const relativePath = relative(parentDir, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

async function realpathExistingAncestor(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
}

async function rejectDefinitionSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use mcp-agent definition ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectDefinitionSymlink(`${filePath}.bak`);
  await rejectDefinitionSymlink(`${filePath}.tmp`);
}

async function resolveSafeProjectAgentPath(filePath: string, projectDir: string): Promise<string> {
  const realParentDir = await realpathExistingAncestor(dirname(filePath));
  if (!isInsideOrEqual(projectDir, realParentDir)) {
    throw new Error(
      `cannot use mcp-agent definition ${filePath}; tokenjuice will not write through instruction directories outside ${projectDir}`,
    );
  }

  await rejectDefinitionSymlink(filePath);
  return filePath;
}

async function getDefaultAgentPath(options: McpAgentDefinitionOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectAgentPath(join(projectDir, ".mcp-agent", "agents", "tokenjuice.md"), realProjectDir);
}

async function getDefaultAliasPath(options: McpAgentDefinitionOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".mcp-agent", "agents", "tokenjuice.md");
}

async function resolveAgentPath(agentPath?: string, options: McpAgentDefinitionOptions = {}): Promise<string> {
  if (agentPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectAgentPath(resolve(agentPath), realProjectDir);
  }

  return getDefaultAgentPath(options);
}

function buildMcpAgentDefinition(
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): string {
  return [
    "---",
    "name: tokenjuice",
    "description: Use when mcp-agent workflows run terminal commands likely to produce long output or need compacted shell evidence.",
    "---",
    "",
    ...(restoreBackupSuffix
      ? [`${TOKENJUICE_MCP_AGENT_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix} -->`, ""]
      : []),
    `# ${TOKENJUICE_MCP_AGENT_MARKER}`,
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        `- When an mcp-agent workflow or subagent runs terminal commands likely to produce long output, prefer \`${TOKENJUICE_WRAP_COMMAND}\`.`,
    }),
    "",
    "Load this agent definition by enabling project agent files in `mcp_agent.config.yaml`:",
    "",
    "```yaml",
    "agents:",
    "  enabled: true",
    "  search_paths:",
    "    - .mcp-agent/agents",
    "```",
    "",
    `In short: ${TOKENJUICE_MCP_AGENT_LOAD_GUIDANCE}.`,
    "",
  ].join("\n");
}

export async function installMcpAgentDefinition(
  agentPath?: string,
  options: McpAgentDefinitionOptions = {},
): Promise<InstallMcpAgentDefinitionResult> {
  const resolvedAgentPath = await resolveAgentPath(agentPath, options);
  await rejectInstallSidecarSymlinks(resolvedAgentPath);
  const existing = await readInstructionFile(resolvedAgentPath);
  if (existing.exists && isTokenjuiceMcpAgentDefinitionText(existing.text)) {
    const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
    const nextDefinition = buildMcpAgentDefinition({ restoreBackupSuffix });
    if (existing.text === nextDefinition) {
      return { agentPath: resolvedAgentPath };
    }

    const result = await writeInstructionFile(resolvedAgentPath, nextDefinition);
    return {
      agentPath: result.filePath,
      ...(result.backupPath ? { backupPath: result.backupPath } : {}),
    };
  }

  if (existing.exists) {
    const backupPath = await chooseMcpAgentBackupPath(resolvedAgentPath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx" });
    await writeMcpAgentDefinitionWithoutBackup(
      resolvedAgentPath,
      buildMcpAgentDefinition({ restoreBackupSuffix: backupPath.slice(resolvedAgentPath.length) }),
    );
    return { agentPath: resolvedAgentPath, backupPath };
  }

  const result = await writeInstructionFile(resolvedAgentPath, buildMcpAgentDefinition());
  return {
    agentPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallMcpAgentDefinition(
  agentPath?: string,
  options: McpAgentDefinitionOptions = {},
): Promise<UninstallMcpAgentDefinitionResult> {
  const resolvedAgentPath = await resolveAgentPath(agentPath, options);
  const existing = await readInstructionFile(resolvedAgentPath);
  if (!existing.exists || !isTokenjuiceMcpAgentDefinitionText(existing.text)) {
    return { agentPath: resolvedAgentPath, removed: false };
  }

  const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
  if (restoreBackupSuffix) {
    const backupPath = `${resolvedAgentPath}${restoreBackupSuffix}`;
    await rejectDefinitionSymlink(backupPath);
    const backup = await readInstructionFile(backupPath);
    if (backup.exists && !isTokenjuiceMcpAgentDefinitionText(backup.text)) {
      await rm(resolvedAgentPath, { force: true });
      await rename(backupPath, resolvedAgentPath);
      return { agentPath: resolvedAgentPath, removed: true };
    }
  }

  const result = await removeInstructionFile(resolvedAgentPath);
  return { agentPath: result.filePath, removed: result.removed };
}

export async function doctorMcpAgentDefinition(
  agentPath?: string,
  options: McpAgentDefinitionOptions = {},
): Promise<McpAgentDoctorReport> {
  let resolvedAgentPath: string;
  try {
    resolvedAgentPath = await resolveAgentPath(agentPath, options);
  } catch (error) {
    const aliasPath = agentPath ?? (await getDefaultAliasPath(options));
    return {
      agentPath: aliasPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_MCP_AGENT_ADVISORY,
        fixCommand: (error as Error).message.includes("outside")
          ? "use a project-local mcp-agent definition path, then run tokenjuice install mcp-agent"
          : "replace symlinked mcp-agent definition with a regular project file, then run tokenjuice install mcp-agent",
      }),
    };
  }
  const existing = await readInstructionFile(resolvedAgentPath);
  const hasTokenjuiceMarker = isTokenjuiceMcpAgentDefinitionText(existing.text);
  if (!existing.exists || !hasTokenjuiceMarker) {
    return {
      agentPath: resolvedAgentPath,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice mcp-agent definition is not installed"],
        advisory: TOKENJUICE_MCP_AGENT_ADVISORY,
        fixCommand: TOKENJUICE_MCP_AGENT_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_MCP_AGENT_MARKER,
        missingIssue: "configured mcp-agent definition does not look like the tokenjuice definition",
      },
      {
        requiredText: "name: tokenjuice",
        missingIssue: "configured mcp-agent definition is missing tokenjuice agent frontmatter",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured mcp-agent definition is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured mcp-agent definition is missing the raw escape hatch",
      },
      {
        requiredText: ".mcp-agent/agents",
        missingIssue: "configured mcp-agent definition is missing search path guidance",
      },
      {
        requiredText: "agents.search_paths",
        missingIssue: "configured mcp-agent definition is missing load guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured mcp-agent definition still suggests the full escape hatch",
      },
    ],
  });

  return {
    agentPath: resolvedAgentPath,
    hasTokenjuiceMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_MCP_AGENT_ADVISORY,
      fixCommand: TOKENJUICE_MCP_AGENT_FIX_COMMAND,
    }),
  };
}
