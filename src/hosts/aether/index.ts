import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { isRecord } from "../shared/hooks-json-file.js";

export type AetherPromptOptions = {
  projectDir?: string;
};

export type InstallAetherPromptResult = {
  promptPath: string;
  settingsPath: string;
  backupPath?: string;
  settingsBackupPath?: string;
  agentsUpdated: number;
};

export type UninstallAetherPromptResult = {
  promptPath: string;
  settingsPath: string;
  removed: boolean;
  promptsRemoved: number;
};

export type AetherDoctorReport = {
  promptPath: string;
  settingsPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

type AetherSettings = Record<string, unknown> & {
  agents?: unknown;
  prompts?: unknown;
};

type AetherSettingsRefsAdded = {
  topLevel: boolean;
  agents: string[];
};

const TOKENJUICE_AETHER_FIX_COMMAND = "tokenjuice install aether";
const TOKENJUICE_AETHER_INIT_FIX_COMMAND = "run aether once to create .aether/settings.json, then run tokenjuice install aether";
const TOKENJUICE_AETHER_PROMPT_SOURCE = ".aether/tokenjuice.md";
const TOKENJUICE_AETHER_MARKER = "tokenjuice Aether terminal output compaction";
const TOKENJUICE_AETHER_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:aether-restore-backup=";
const TOKENJUICE_AETHER_SETTINGS_REFS_MARKER_PREFIX = "<!-- tokenjuice:aether-settings-added=";
const TOKENJUICE_AETHER_ADVISORY =
  "Aether support is beta and prompt-source based; tokenjuice adds `.aether/tokenjuice.md` to every configured Aether agent's prompts array.";
const TOKENJUICE_AETHER_UNINITIALIZED_ISSUE =
  "Aether project is not initialized; run `aether` once before installing tokenjuice prompt guidance";

function isTokenjuiceAetherPromptText(text: string): boolean {
  return text.includes(TOKENJUICE_AETHER_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/^<!-- tokenjuice:aether-restore-backup=(\.bak(?:\.\d+)?) -->$/mu);
  return match?.[1];
}

function emptySettingsRefsAdded(): AetherSettingsRefsAdded {
  return { topLevel: false, agents: [] };
}

function mergeSettingsRefsAdded(
  first: AetherSettingsRefsAdded,
  second: AetherSettingsRefsAdded,
): AetherSettingsRefsAdded {
  return {
    topLevel: first.topLevel || second.topLevel,
    agents: [...first.agents, ...second.agents],
  };
}

function serializeSettingsRefsAdded(refs: AetherSettingsRefsAdded): string {
  return JSON.stringify({ topLevel: refs.topLevel, agents: refs.agents });
}

function readSettingsRefsAdded(text: string): AetherSettingsRefsAdded | undefined {
  const match = text.match(/^<!-- tokenjuice:aether-settings-added=(\{.*\}) -->$/mu);
  if (!match?.[1]) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!isRecord(parsed) || typeof parsed.topLevel !== "boolean" || !Array.isArray(parsed.agents)) {
      return undefined;
    }
    const agents = parsed.agents.filter((agent): agent is string => typeof agent === "string" && agent.length > 0);
    return { topLevel: parsed.topLevel, agents };
  } catch {
    return undefined;
  }
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key])]),
    );
  }
  return value;
}

function agentOwnershipDescriptor(agent: Record<string, unknown>): Record<string, unknown> {
  if (typeof agent.name === "string" && agent.name.trim()) {
    return { name: agent.name };
  }

  const prompts = Array.isArray(agent.prompts)
    ? agent.prompts.filter((prompt): prompt is string =>
        typeof prompt === "string" && prompt !== TOKENJUICE_AETHER_PROMPT_SOURCE)
    : [];
  if (prompts.length > 0) {
    return { prompts };
  }
  return { anonymous: true };
}

function agentOwnershipSignature(agent: Record<string, unknown>): string {
  const descriptor = JSON.stringify(canonicalizeJson(agentOwnershipDescriptor(agent)));
  return createHash("sha256").update(descriptor).digest("hex");
}

function getExplicitProjectDir(options: AetherPromptOptions = {}): string | undefined {
  return options.projectDir || process.env.AETHER_PROJECT_DIR;
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
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

async function chooseAetherBackupPath(filePath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${filePath}.bak` : `${filePath}.bak.${index}`;
    if (!(await backupPathExists(candidate))) {
      return candidate;
    }
  }
}

async function resolveProjectDir(options: AetherPromptOptions = {}): Promise<string> {
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

async function rejectAetherPathSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use Aether source ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectAetherPathSymlink(`${filePath}.bak`);
  await rejectAetherPathSymlink(`${filePath}.tmp`);
}

async function rejectSymlinkPathComponents(filePath: string, projectDir: string): Promise<void> {
  const relativePath = relative(projectDir, filePath);
  const segments = relativePath.split(sep).filter(Boolean);
  let currentPath = projectDir;
  for (const segment of segments.slice(0, -1)) {
    currentPath = join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`cannot use Aether source ${filePath}; tokenjuice will not read or write through instruction symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function resolveSafeProjectPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use Aether source ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectAetherPathSymlink(resolvedPath);
  return resolvedPath;
}

async function resolveAetherPaths(promptPath?: string, options: AetherPromptOptions = {}): Promise<{
  promptPath: string;
  settingsPath: string;
}> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  const defaultPromptPath = resolve(projectDir, ".aether", "tokenjuice.md");
  const requestedPromptPath = promptPath ? resolve(promptPath) : defaultPromptPath;
  const resolvedPromptPath = await resolveSafeProjectPath(requestedPromptPath, projectDir, realProjectDir);
  if (resolvedPromptPath !== defaultPromptPath) {
    throw new Error(
      `cannot use Aether source ${resolvedPromptPath}; Aether settings load ${TOKENJUICE_AETHER_PROMPT_SOURCE}`,
    );
  }
  return {
    promptPath: resolvedPromptPath,
    settingsPath: await resolveSafeProjectPath(join(projectDir, ".aether", "settings.json"), projectDir, realProjectDir),
  };
}

async function getDefaultAliasPaths(promptPath?: string, options: AetherPromptOptions = {}): Promise<{
  promptPath: string;
  settingsPath: string;
}> {
  const projectDir = await resolveProjectDir(options);
  return {
    promptPath: promptPath ? resolve(promptPath) : join(projectDir, ".aether", "tokenjuice.md"),
    settingsPath: join(projectDir, ".aether", "settings.json"),
  };
}

async function hasPromptUnderSymlinkedParent(promptPath: string): Promise<boolean> {
  try {
    const parentStats = await lstat(dirname(promptPath));
    if (!parentStats.isSymbolicLink()) {
      return false;
    }
    const prompt = await readInstructionFile(promptPath);
    return prompt.exists && prompt.text.includes(TOKENJUICE_AETHER_MARKER);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function detectAetherInstallEvidence(
  promptPath: string,
  settingsPath: string,
  options: AetherPromptOptions = {},
): Promise<boolean> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);

  const safeSettingsPath = await resolveSafeProjectPath(settingsPath, projectDir, realProjectDir).catch(() => undefined);
  if (safeSettingsPath) {
    try {
      const settings = await readAetherSettings(safeSettingsPath);
      if (settings.exists && settingsLoadsPromptSource(settings.config)) {
        return true;
      }
    } catch {
      // Broken settings still allow prompt-marker evidence below.
    }
  }

  const safePromptPath = await resolveSafeProjectPath(promptPath, projectDir, realProjectDir).catch(() => undefined);
  if (safePromptPath) {
    const prompt = await readInstructionFile(safePromptPath);
    if (prompt.exists && isTokenjuiceAetherPromptText(prompt.text)) {
      return true;
    }
  }

  return hasPromptUnderSymlinkedParent(promptPath);
}

async function readAetherSettings(settingsPath: string): Promise<{ config: AetherSettings; text: string; exists: boolean }> {
  try {
    const text = await readFile(settingsPath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) {
      throw new Error(`configured Aether settings at ${settingsPath} must be a JSON object`);
    }
    return { config: parsed, text, exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: {}, text: "", exists: false };
    }
    if (error instanceof SyntaxError) {
      throw new Error(`configured Aether settings at ${settingsPath} are not valid JSON`);
    }
    throw error;
  }
}

function agentLabel(agent: Record<string, unknown>, index: number): string {
  return typeof agent.name === "string" && agent.name.trim() ? agent.name : `#${index + 1}`;
}

function getPromptIssues(config: AetherSettings): string[] {
  if (config.prompts !== undefined && !Array.isArray(config.prompts)) {
    return ["configured Aether settings have a non-array top-level prompts field"];
  }
  if (!Array.isArray(config.agents)) {
    return ["configured Aether settings are missing an agents array"];
  }
  if (config.agents.length === 0) {
    return ["configured Aether settings do not define any agents"];
  }

  const issues: string[] = [];
  for (const [index, agent] of config.agents.entries()) {
    if (!isRecord(agent)) {
      issues.push(`configured Aether agent #${index + 1} is not an object`);
      continue;
    }
    if (agent.prompts === undefined && Array.isArray(config.prompts) && config.prompts.includes(TOKENJUICE_AETHER_PROMPT_SOURCE)) {
      continue;
    }
    if (!Array.isArray(agent.prompts)) {
      issues.push(`configured Aether agent ${agentLabel(agent, index)} is missing a prompts array`);
      continue;
    }
    if (!agent.prompts.includes(TOKENJUICE_AETHER_PROMPT_SOURCE)) {
      issues.push(`configured Aether agent ${agentLabel(agent, index)} does not load ${TOKENJUICE_AETHER_PROMPT_SOURCE}`);
    }
  }
  return issues;
}

function settingsLoadsPromptSource(config: AetherSettings): boolean {
  return (Array.isArray(config.prompts) && config.prompts.includes(TOKENJUICE_AETHER_PROMPT_SOURCE))
    || Array.isArray(config.agents)
    && config.agents.some((agent) => isRecord(agent)
      && Array.isArray(agent.prompts)
      && agent.prompts.includes(TOKENJUICE_AETHER_PROMPT_SOURCE));
}

function addPromptSourceToAgents(config: AetherSettings): {
  agentsUpdated: number;
  refsAdded: AetherSettingsRefsAdded;
} {
  if (config.prompts !== undefined && !Array.isArray(config.prompts)) {
    throw new Error("cannot install Aether prompt because .aether/settings.json has a non-array top-level prompts field");
  }
  if (!Array.isArray(config.agents)) {
    throw new Error("cannot install Aether prompt because .aether/settings.json is missing an agents array");
  }
  if (config.agents.length === 0) {
    throw new Error("cannot install Aether prompt because .aether/settings.json does not define any agents");
  }

  let updated = 0;
  const refsAdded = emptySettingsRefsAdded();
  const topLevelPrompts = Array.isArray(config.prompts) ? config.prompts : undefined;
  const preExistingPromptSourceSignatures = new Set<string>();
  for (const agent of config.agents) {
    if (isRecord(agent) && Array.isArray(agent.prompts) && agent.prompts.includes(TOKENJUICE_AETHER_PROMPT_SOURCE)) {
      preExistingPromptSourceSignatures.add(agentOwnershipSignature(agent));
    }
  }

  if (topLevelPrompts && !topLevelPrompts.includes(TOKENJUICE_AETHER_PROMPT_SOURCE)) {
    config.prompts = [...topLevelPrompts, TOKENJUICE_AETHER_PROMPT_SOURCE];
    refsAdded.topLevel = true;
  }
  config.agents = config.agents.map((agent, index) => {
    if (!isRecord(agent)) {
      throw new Error(`cannot install Aether prompt because configured Aether agent #${index + 1} is not an object`);
    }
    if (topLevelPrompts && agent.prompts === undefined) {
      return agent;
    }
    if (agent.prompts !== undefined && !Array.isArray(agent.prompts)) {
      throw new Error(`cannot install Aether prompt because configured Aether agent ${agentLabel(agent, index)} has a non-array prompts field`);
    }
    const prompts = Array.isArray(agent.prompts) ? [...agent.prompts] : [];
    if (!prompts.includes(TOKENJUICE_AETHER_PROMPT_SOURCE)) {
      const ownershipSignature = agentOwnershipSignature(agent);
      if (preExistingPromptSourceSignatures.has(ownershipSignature)) {
        throw new Error(
          `cannot install Aether prompt because configured Aether agent ${agentLabel(agent, index)} has duplicate ownership for ${TOKENJUICE_AETHER_PROMPT_SOURCE}`,
        );
      }
      refsAdded.agents.push(ownershipSignature);
      prompts.push(TOKENJUICE_AETHER_PROMPT_SOURCE);
      updated += 1;
    }
    return { ...agent, prompts };
  });
  return { agentsUpdated: updated, refsAdded };
}

function removePromptSourceFromAgents(
  config: AetherSettings,
  refsAdded: AetherSettingsRefsAdded | undefined,
  { removeAll }: { removeAll?: boolean } = {},
): number {
  if (!refsAdded && !removeAll) {
    return 0;
  }

  let removed = 0;
  if (Array.isArray(config.prompts) && (removeAll || refsAdded?.topLevel)) {
    config.prompts = config.prompts.filter((prompt) => {
      const shouldRemove = prompt === TOKENJUICE_AETHER_PROMPT_SOURCE;
      if (shouldRemove) {
        removed += 1;
      }
      return !shouldRemove;
    });
  }
  if (!Array.isArray(config.agents)) {
    return removed;
  }

  const removableAgentSignatures = new Map<string, number>();
  for (const signature of refsAdded?.agents ?? []) {
    removableAgentSignatures.set(signature, (removableAgentSignatures.get(signature) ?? 0) + 1);
  }

  config.agents = config.agents.map((agent) => {
    if (!isRecord(agent) || !Array.isArray(agent.prompts)) {
      return agent;
    }
    if (!removeAll) {
      const signature = agentOwnershipSignature(agent);
      const remainingMatches = removableAgentSignatures.get(signature) ?? 0;
      if (remainingMatches <= 0) {
        return agent;
      }
      removableAgentSignatures.set(signature, remainingMatches - 1);
    }
    const prompts = agent.prompts.filter((prompt) => {
      const shouldRemove = prompt === TOKENJUICE_AETHER_PROMPT_SOURCE;
      if (shouldRemove) {
        removed += 1;
      }
      return !shouldRemove;
    });
    if (prompts.length === 0 && config.prompts === undefined) {
      const withoutPrompts = { ...agent };
      delete withoutPrompts.prompts;
      return withoutPrompts;
    }
    return { ...agent, prompts };
  });
  return removed;
}

async function writeTextFileWithoutBackup(filePath: string, text: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, text, { encoding: "utf8", flag: "wx" });
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function writeAetherSettings(settingsPath: string, config: AetherSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeTextFileWithoutBackup(settingsPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function readRequiredAetherSettings(settingsPath: string): Promise<{ config: AetherSettings; text: string }> {
  const existing = await readAetherSettings(settingsPath);
  if (!existing.exists) {
    throw new Error(
      `cannot install Aether prompt because ${settingsPath} does not exist; run aether once, then rerun tokenjuice install aether`,
    );
  }
  return { config: existing.config, text: existing.text };
}

async function backupAetherFile(filePath: string, text: string): Promise<string> {
  const backupPath = await chooseAetherBackupPath(filePath);
  await writeFile(backupPath, text, { encoding: "utf8", flag: "wx" });
  return backupPath;
}

function buildAetherPrompt(
  {
    restoreBackupSuffix,
    settingsRefsAdded = emptySettingsRefsAdded(),
  }: {
    restoreBackupSuffix?: string | undefined;
    settingsRefsAdded?: AetherSettingsRefsAdded | undefined;
  } = {},
): string {
  return [
    ...(restoreBackupSuffix
      ? [`${TOKENJUICE_AETHER_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix} -->`, ""]
      : []),
    `${TOKENJUICE_AETHER_SETTINGS_REFS_MARKER_PREFIX}${serializeSettingsRefsAdded(settingsRefsAdded)} -->`,
    "",
    `# ${TOKENJUICE_AETHER_MARKER}`,
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        "- When an Aether agent runs terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
    }),
    "- This file is loaded through `.aether/settings.json` as an agent prompt source.",
    "- Verify the active prompt with `aether show-prompt -a <agent>` after installing.",
    "",
  ].join("\n");
}

export async function installAetherPrompt(
  promptPath?: string,
  options: AetherPromptOptions = {},
): Promise<InstallAetherPromptResult> {
  const { promptPath: resolvedPromptPath, settingsPath } = await resolveAetherPaths(promptPath, options);
  await rejectInstallSidecarSymlinks(resolvedPromptPath);
  await rejectInstallSidecarSymlinks(settingsPath);
  const settings = await readRequiredAetherSettings(settingsPath);
  const beforeConfig = JSON.stringify(settings.config);
  const { agentsUpdated, refsAdded } = addPromptSourceToAgents(settings.config);
  const settingsChanged = beforeConfig !== JSON.stringify(settings.config);
  let settingsBackupPath: string | undefined;
  if (settingsChanged) {
    settingsBackupPath = await backupAetherFile(settingsPath, settings.text);
  }

  const existingPrompt = await readInstructionFile(resolvedPromptPath);
  let promptBackupPath: string | undefined;
  if (existingPrompt.exists && isTokenjuiceAetherPromptText(existingPrompt.text)) {
    const restoreBackupSuffix = readRestoreBackupSuffix(existingPrompt.text);
    const settingsRefsAdded = mergeSettingsRefsAdded(readSettingsRefsAdded(existingPrompt.text) ?? emptySettingsRefsAdded(), refsAdded);
    const nextPrompt = buildAetherPrompt({ restoreBackupSuffix, settingsRefsAdded });
    if (existingPrompt.text !== nextPrompt) {
      const promptResult = await writeInstructionFile(resolvedPromptPath, nextPrompt);
      promptBackupPath = promptResult.backupPath;
    }
  } else if (existingPrompt.exists) {
    promptBackupPath = await backupAetherFile(resolvedPromptPath, existingPrompt.text);
    await writeTextFileWithoutBackup(
      resolvedPromptPath,
      buildAetherPrompt({
        restoreBackupSuffix: promptBackupPath.slice(resolvedPromptPath.length),
        settingsRefsAdded: refsAdded,
      }),
    );
  } else {
    await writeTextFileWithoutBackup(resolvedPromptPath, buildAetherPrompt({ settingsRefsAdded: refsAdded }));
  }

  if (settingsChanged) {
    await writeAetherSettings(settingsPath, settings.config);
  }
  return {
    promptPath: resolvedPromptPath,
    settingsPath,
    ...(promptBackupPath ? { backupPath: promptBackupPath } : {}),
    ...(settingsBackupPath ? { settingsBackupPath } : {}),
    agentsUpdated,
  };
}

export async function uninstallAetherPrompt(
  promptPath?: string,
  options: AetherPromptOptions = {},
): Promise<UninstallAetherPromptResult> {
  const { promptPath: resolvedPromptPath, settingsPath } = await resolveAetherPaths(promptPath, options);
  await rejectInstallSidecarSymlinks(settingsPath);
  const settings = await readAetherSettings(settingsPath);
  const existingPrompt = await readInstructionFile(resolvedPromptPath);
  const isTokenjuicePrompt = existingPrompt.exists && isTokenjuiceAetherPromptText(existingPrompt.text);
  const restoreBackupSuffix = existingPrompt.exists && isTokenjuiceAetherPromptText(existingPrompt.text)
    ? readRestoreBackupSuffix(existingPrompt.text)
    : undefined;
  if (restoreBackupSuffix) {
    await rejectAetherPathSymlink(`${resolvedPromptPath}${restoreBackupSuffix}`);
  }

  const settingsRefsAdded = isTokenjuicePrompt ? readSettingsRefsAdded(existingPrompt.text) : undefined;
  const removeLegacySettingsRefs = isTokenjuicePrompt && !settingsRefsAdded && !restoreBackupSuffix;
  const promptsRemoved = settings.exists
    ? removePromptSourceFromAgents(settings.config, settingsRefsAdded, { removeAll: removeLegacySettingsRefs })
    : 0;
  if (promptsRemoved > 0) {
    await writeAetherSettings(settingsPath, settings.config);
  }
  if (!isTokenjuicePrompt) {
    return { promptPath: resolvedPromptPath, settingsPath, removed: false, promptsRemoved };
  }

  const settingsStillLoadPrompt = settings.exists && settingsLoadsPromptSource(settings.config);
  if (restoreBackupSuffix) {
    const backupPath = `${resolvedPromptPath}${restoreBackupSuffix}`;
    const backup = await readInstructionFile(backupPath);
    if (backup.exists && !isTokenjuiceAetherPromptText(backup.text)) {
      await rm(resolvedPromptPath, { force: true });
      await rename(backupPath, resolvedPromptPath);
      return { promptPath: resolvedPromptPath, settingsPath, removed: true, promptsRemoved };
    }
  }

  if (settingsStillLoadPrompt) {
    return { promptPath: resolvedPromptPath, settingsPath, removed: false, promptsRemoved };
  }

  const result = await removeInstructionFile(resolvedPromptPath);
  return { promptPath: result.filePath, settingsPath, removed: result.removed, promptsRemoved };
}

export async function doctorAetherPrompt(
  promptPath?: string,
  options: AetherPromptOptions = {},
): Promise<AetherDoctorReport> {
  let resolvedPromptPath: string;
  let settingsPath: string;
  try {
    ({ promptPath: resolvedPromptPath, settingsPath } = await resolveAetherPaths(promptPath, options));
  } catch (error) {
    const aliases = await getDefaultAliasPaths(promptPath, options);
    const hasTokenjuiceMarker = await detectAetherInstallEvidence(aliases.promptPath, aliases.settingsPath, options);
    return {
      promptPath: aliases.promptPath,
      settingsPath: aliases.settingsPath,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_AETHER_ADVISORY,
        fixCommand: (error as Error).message.includes("outside")
          ? "use a project-local Aether prompt path, then run tokenjuice install aether"
          : (error as Error).message.includes("settings load")
            ? "use .aether/tokenjuice.md as the Aether prompt path, then run tokenjuice install aether"
            : "replace symlinked Aether prompt/settings files with regular project files, then run tokenjuice install aether",
      }),
      checkedPaths: [aliases.settingsPath, aliases.promptPath],
      missingPaths: [],
    };
  }
  const checkedPaths = [settingsPath, resolvedPromptPath];
  const missingPaths = (await Promise.all(checkedPaths.map((path) => pathExists(path))))
    .map((exists, index) => (exists ? undefined : checkedPaths[index]))
    .filter((path): path is string => Boolean(path));
  const prompt = await readInstructionFile(resolvedPromptPath);

  let settings: Awaited<ReturnType<typeof readAetherSettings>>;
  try {
    settings = await readAetherSettings(settingsPath);
  } catch (error) {
    if (!prompt.exists) {
      return {
        promptPath: resolvedPromptPath,
        settingsPath,
        hasTokenjuiceMarker: false,
        ...buildInstructionDoctorReportFields({
          status: "disabled",
          issues: ["tokenjuice Aether prompt is not installed", (error as Error).message],
          advisory: TOKENJUICE_AETHER_ADVISORY,
          fixCommand: "repair .aether/settings.json, then run tokenjuice install aether",
        }),
        checkedPaths,
        missingPaths,
      };
    }
    return {
      promptPath: resolvedPromptPath,
      settingsPath,
      hasTokenjuiceMarker: isTokenjuiceAetherPromptText(prompt.text),
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_AETHER_ADVISORY,
        fixCommand: TOKENJUICE_AETHER_FIX_COMMAND,
      }),
      checkedPaths,
      missingPaths,
    };
  }

  const promptIssues = prompt.exists
    ? collectGuidanceIssues(prompt.text, {
        required: [
          {
            requiredText: TOKENJUICE_AETHER_MARKER,
            missingIssue: "configured Aether prompt does not look like the tokenjuice prompt",
          },
          {
            requiredText: TOKENJUICE_WRAP_COMMAND,
            missingIssue: "configured Aether prompt is missing tokenjuice wrap guidance",
          },
          {
            requiredText: TOKENJUICE_RAW_COMMAND,
            missingIssue: "configured Aether prompt is missing the raw escape hatch",
          },
          {
            requiredText: "aether show-prompt",
            missingIssue: "configured Aether prompt is missing prompt verification guidance",
          },
        ],
        forbidden: [
          {
            forbiddenText: TOKENJUICE_FULL_COMMAND,
            presentIssue: "configured Aether prompt still suggests the full escape hatch",
          },
        ],
      })
    : ["tokenjuice Aether prompt is not installed"];

  const settingsIssues = settings.exists ? getPromptIssues(settings.config) : [TOKENJUICE_AETHER_UNINITIALIZED_ISSUE];
  const issues = [...promptIssues, ...settingsIssues];
  const installed = prompt.exists || (settings.exists && settingsLoadsPromptSource(settings.config));
  const hasTokenjuiceMarker = isTokenjuiceAetherPromptText(prompt.text)
    || (!prompt.exists && settings.exists && settingsLoadsPromptSource(settings.config));
  const status = !installed && !prompt.exists
    ? "disabled"
    : instructionDoctorStatusFromIssues(issues);

  return {
    promptPath: resolvedPromptPath,
    settingsPath,
    hasTokenjuiceMarker,
    ...buildInstructionDoctorReportFields({
      status,
      issues,
      advisory: TOKENJUICE_AETHER_ADVISORY,
      fixCommand: settings.exists ? TOKENJUICE_AETHER_FIX_COMMAND : TOKENJUICE_AETHER_INIT_FIX_COMMAND,
    }),
    checkedPaths,
    missingPaths,
  };
}
