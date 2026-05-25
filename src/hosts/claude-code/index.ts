import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { extractHookCommandPaths } from "../shared/hook-command.js";
import {
  buildWrapLauncherHookCommand,
  buildWrappedCommand,
  commandAlreadyWrapped,
  isExecutableFile,
  isRecord,
  pathExists,
  resolveHostShell,
} from "../shared/pre-tool-wrap.js";

type ClaudeCodeHook = Record<string, unknown>;

type ClaudeCodeHookMatcherGroup = Record<string, unknown> & {
  matcher?: string;
  hooks: ClaudeCodeHook[];
};

type ClaudeCodeSettings = Record<string, unknown> & {
  hooks: Record<string, unknown>;
};

type ClaudeCodeHookEvent = "PreToolUse" | "PostToolUse";

type ClaudeCodePreToolUsePayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
};

type ClaudeCodeBashToolInput = {
  command?: unknown;
  description?: unknown;
  shell?: unknown;
} & Record<string, unknown>;

type DetectedClaudeCodeHook = {
  hook: ClaudeCodeHook;
  hookEvent: ClaudeCodeHookEvent;
};

export type InstallClaudeCodeHookResult = {
  settingsPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallClaudeCodeHookResult = {
  settingsPath: string;
  backupPath?: string;
  removed: boolean;
};

export type ClaudeCodeDoctorReport = {
  settingsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  checkedPaths: string[];
  missingPaths: string[];
};

export type ClaudeCodeHookCommandOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
};

const TOKENJUICE_CLAUDE_CODE_STATUS = "wrapping bash through tokenjuice for compaction";
const TOKENJUICE_CLAUDE_CODE_LEGACY_STATUS = "compacting bash output with tokenjuice";
const TOKENJUICE_CLAUDE_CODE_FIX_COMMAND = "tokenjuice install claude-code";
const TOKENJUICE_CLAUDE_CODE_HOOK_SUBCOMMAND = "claude-code-pre-tool-use";
const TOKENJUICE_CLAUDE_CODE_LEGACY_HOOK_SUBCOMMAND = "claude-code-post-tool-use";
const TOKENJUICE_CLAUDE_CODE_HOOK_TIMEOUT_SECONDS = 10;

function getClaudeCodeHome(): string {
  // Claude Code resolves its config directory from CLAUDE_CONFIG_DIR, so honor
  // it first to stay aligned with the host. CLAUDE_HOME is kept as a fallback
  // for backwards compatibility with existing tokenjuice installs.
  return process.env.CLAUDE_CONFIG_DIR || process.env.CLAUDE_HOME || join(homedir(), ".claude");
}

function getDefaultSettingsPath(): string {
  return join(getClaudeCodeHome(), "settings.json");
}

async function buildClaudeCodeHookCommand(options: ClaudeCodeHookCommandOptions = {}): Promise<string> {
  return buildWrapLauncherHookCommand({
    ...options,
    subcommand: TOKENJUICE_CLAUDE_CODE_HOOK_SUBCOMMAND,
    hostName: "claude code",
  });
}

function getClaudeCodeFixCommand(local = false): string {
  return local ? "tokenjuice install claude-code --local" : TOKENJUICE_CLAUDE_CODE_FIX_COMMAND;
}

function createTokenjuiceClaudeCodeHook(command: string): ClaudeCodeHookMatcherGroup {
  return {
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command,
        statusMessage: TOKENJUICE_CLAUDE_CODE_STATUS,
        timeout: TOKENJUICE_CLAUDE_CODE_HOOK_TIMEOUT_SECONDS,
      },
    ],
  };
}

function isTokenjuiceClaudeCodeHookEntry(hook: unknown): hook is ClaudeCodeHook {
  if (!isRecord(hook)) {
    return false;
  }
  if (hook.statusMessage === TOKENJUICE_CLAUDE_CODE_STATUS || hook.statusMessage === TOKENJUICE_CLAUDE_CODE_LEGACY_STATUS) {
    return true;
  }
  if (typeof hook.command !== "string") {
    return false;
  }
  return hook.command.includes(TOKENJUICE_CLAUDE_CODE_HOOK_SUBCOMMAND)
    || hook.command.includes(TOKENJUICE_CLAUDE_CODE_LEGACY_HOOK_SUBCOMMAND);
}

function isCurrentClaudeCodeHookEntry(hook: unknown): hook is ClaudeCodeHook {
  return isRecord(hook) && (
    hook.statusMessage === TOKENJUICE_CLAUDE_CODE_STATUS
    || (typeof hook.command === "string" && hook.command.includes(TOKENJUICE_CLAUDE_CODE_HOOK_SUBCOMMAND))
  );
}

function findTokenjuiceClaudeCodeHook(config: ClaudeCodeSettings): DetectedClaudeCodeHook | undefined {
  const preToolUse = Array.isArray(config.hooks.PreToolUse) ? config.hooks.PreToolUse : [];
  for (const group of preToolUse) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }
    const hook = group.hooks.find(isCurrentClaudeCodeHookEntry);
    if (hook) {
      return { hook, hookEvent: "PreToolUse" };
    }
  }

  const postToolUse = Array.isArray(config.hooks.PostToolUse) ? config.hooks.PostToolUse : [];
  for (const group of postToolUse) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }
    const hook = group.hooks.find(isTokenjuiceClaudeCodeHookEntry);
    if (hook) {
      return { hook, hookEvent: "PostToolUse" };
    }
  }

  return undefined;
}

function findTokenjuiceClaudeCodeHookCommand(config: ClaudeCodeSettings): string | undefined {
  const detected = findTokenjuiceClaudeCodeHook(config);
  return typeof detected?.hook.command === "string" && detected.hook.command ? detected.hook.command : undefined;
}

function sanitizeHooksSubtree(raw: unknown): Record<string, unknown> {
  return isRecord(raw) ? { ...raw } : {};
}

function sanitizeClaudeCodeSettings(raw: unknown): ClaudeCodeSettings {
  if (!isRecord(raw)) {
    return { hooks: {} };
  }

  return {
    ...raw,
    hooks: sanitizeHooksSubtree(raw.hooks),
  };
}

async function loadClaudeCodeSettings(settingsPath: string): Promise<{ config: ClaudeCodeSettings; backupPath?: string }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    const config = sanitizeClaudeCodeSettings(parsed);
    const backupPath = `${settingsPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config, backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} } };
    }
    throw new Error(`failed to load claude code settings from ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readClaudeCodeSettings(settingsPath: string): Promise<{ config: ClaudeCodeSettings; exists: boolean }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    return {
      config: sanitizeClaudeCodeSettings(parsed),
      exists: true,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        config: { hooks: {} },
        exists: false,
      };
    }
    throw new Error(`failed to read claude code settings from ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function chooseBackupPath(filePath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${filePath}.bak` : `${filePath}.bak.${index}`;
    try {
      await access(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return candidate;
      }
      throw error;
    }
  }
}

function pruneTokenjuiceHookEntries(groups: unknown[]): unknown[] {
  const pruned: unknown[] = [];
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      pruned.push(group);
      continue;
    }
    const retainedHooks = group.hooks.filter((hook) => !isTokenjuiceClaudeCodeHookEntry(hook));
    if (retainedHooks.length === 0) {
      continue;
    }
    if (retainedHooks.length === group.hooks.length) {
      pruned.push(group);
      continue;
    }
    pruned.push({ ...group, hooks: retainedHooks });
  }
  return pruned;
}

function removeTokenjuiceHookEvent(config: ClaudeCodeSettings, event: ClaudeCodeHookEvent): boolean {
  if (!Array.isArray(config.hooks[event])) {
    return false;
  }

  const groups = config.hooks[event];
  const pruned = pruneTokenjuiceHookEntries(groups);
  const changed = pruned.length !== groups.length || pruned.some((group, index) => group !== groups[index]);
  if (!changed) {
    return false;
  }

  if (pruned.length === 0) {
    delete config.hooks[event];
  } else {
    config.hooks[event] = pruned;
  }
  return true;
}

async function resolveClaudeCodeHostShell(toolInput: ClaudeCodeBashToolInput): Promise<string | undefined> {
  return resolveHostShell([
    typeof toolInput.shell === "string" ? toolInput.shell : undefined,
    process.env.TOKENJUICE_CLAUDE_CODE_SHELL,
    process.env.SHELL,
    "bash",
    "sh",
  ]);
}

export async function installClaudeCodeHook(
  settingsPath = getDefaultSettingsPath(),
  options: ClaudeCodeHookCommandOptions = {},
): Promise<InstallClaudeCodeHookResult> {
  const { config, backupPath } = await loadClaudeCodeSettings(settingsPath);
  const command = await buildClaudeCodeHookCommand(options);

  if (Array.isArray(config.hooks.PostToolUse)) {
    const prunedPost = pruneTokenjuiceHookEntries(config.hooks.PostToolUse);
    if (prunedPost.length === 0) {
      delete config.hooks.PostToolUse;
    } else {
      config.hooks.PostToolUse = prunedPost;
    }
  }

  const preToolUse = Array.isArray(config.hooks.PreToolUse) ? config.hooks.PreToolUse : [];
  const retained = pruneTokenjuiceHookEntries(preToolUse);
  retained.push(createTokenjuiceClaudeCodeHook(command));
  config.hooks.PreToolUse = retained;

  await mkdir(dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, settingsPath);

  return {
    settingsPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallClaudeCodeHook(
  settingsPath = getDefaultSettingsPath(),
): Promise<UninstallClaudeCodeHookResult> {
  let rawText: string;
  try {
    rawText = await readFile(settingsPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { settingsPath, removed: false };
    }
    throw new Error(`failed to read claude code settings from ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch (error) {
    throw new Error(`failed to read claude code settings from ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const config = sanitizeClaudeCodeSettings(parsed);
  const removedPreToolUse = removeTokenjuiceHookEvent(config, "PreToolUse");
  const removedPostToolUse = removeTokenjuiceHookEvent(config, "PostToolUse");
  const removed = removedPreToolUse || removedPostToolUse;

  if (!removed) {
    return { settingsPath, removed: false };
  }

  const backupPath = await chooseBackupPath(settingsPath);
  await writeFile(backupPath, rawText, "utf8");
  await mkdir(dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, settingsPath);

  return {
    settingsPath,
    backupPath,
    removed: true,
  };
}

export async function doctorClaudeCodeHook(
  settingsPath = getDefaultSettingsPath(),
  options: ClaudeCodeHookCommandOptions = {},
): Promise<ClaudeCodeDoctorReport> {
  const expectedCommand = await buildClaudeCodeHookCommand(options);
  const fixCommand = getClaudeCodeFixCommand(options.local);
  const { config, exists } = await readClaudeCodeSettings(settingsPath);
  const detected = findTokenjuiceClaudeCodeHook(config);
  const detectedCommand = findTokenjuiceClaudeCodeHookCommand(config);

  if (!exists) {
    return {
      settingsPath,
      status: "disabled",
      issues: [],
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  if (!detectedCommand || !detected) {
    return {
      settingsPath,
      status: "disabled",
      issues: [],
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const checkedPaths = extractHookCommandPaths(detectedCommand);
  const missingPaths: string[] = [];
  for (const path of checkedPaths) {
    if (!(await isExecutableFile(path)) && !(path.endsWith(".js") && await pathExists(path))) {
      missingPaths.push(path);
    }
  }

  const issues: string[] = [];
  if (detected.hookEvent !== "PreToolUse") {
    issues.push("legacy Claude Code PostToolUse tokenjuice hook is installed; rerun tokenjuice install claude-code to migrate to PreToolUse");
  } else if (detected.hook.timeout !== TOKENJUICE_CLAUDE_CODE_HOOK_TIMEOUT_SECONDS) {
    issues.push(
      `configured Claude Code tokenjuice hook timeout is missing or stale; run ${fixCommand} to add the ${TOKENJUICE_CLAUDE_CODE_HOOK_TIMEOUT_SECONDS}s safety cap`,
    );
  }
  if (detectedCommand !== expectedCommand) {
    if (detectedCommand.includes("/Cellar/")) {
      issues.push("configured Claude Code hook is pinned to a versioned Homebrew Cellar path");
    } else {
      issues.push("configured Claude Code hook command does not match the current recommended command");
    }
  }
  if (missingPaths.length > 0) {
    issues.push(`configured Claude Code hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
  }

  return {
    settingsPath,
    status: missingPaths.length > 0 ? "broken" : issues.length > 0 ? "warn" : "ok",
    issues,
    fixCommand,
    expectedCommand,
    detectedCommand,
    checkedPaths,
    missingPaths,
  };
}

export async function runClaudeCodePreToolUseHook(rawText: string, wrapLauncher = "tokenjuice"): Promise<number> {
  let payload: ClaudeCodePreToolUsePayload;
  try {
    payload = JSON.parse(rawText) as ClaudeCodePreToolUsePayload;
  } catch {
    return 0;
  }

  if (payload.hook_event_name !== "PreToolUse") {
    return 0;
  }
  if (payload.tool_name !== "Bash" || !isRecord(payload.tool_input)) {
    return 0;
  }

  const toolInput = payload.tool_input as ClaudeCodeBashToolInput;
  const command = typeof toolInput.command === "string" ? toolInput.command : undefined;
  if (!command || !command.trim()) {
    return 0;
  }
  if (commandAlreadyWrapped(command)) {
    return 0;
  }

  const shellPath = await resolveClaudeCodeHostShell(toolInput);
  if (!shellPath) {
    return 0;
  }

  const wrappedCommand = buildWrappedCommand({ wrapLauncher, shellPath, command, source: "claude-code" });
  const response = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: {
        ...toolInput,
        command: wrappedCommand,
      },
    },
  };
  process.stdout.write(`${JSON.stringify(response)}\n`);
  return 0;
}

export async function runClaudeCodePostToolUseHook(_rawText: string): Promise<number> {
  process.stderr.write(
    "tokenjuice claude-code-post-tool-use is deprecated; run tokenjuice install claude-code to migrate to the Claude Code PreToolUse hook.\n",
  );
  return 0;
}
