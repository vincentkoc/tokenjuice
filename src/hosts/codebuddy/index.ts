import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

type CodeBuddyHook = Record<string, unknown>;

type CodeBuddyHookMatcherGroup = Record<string, unknown> & {
  matcher?: string;
  hooks: CodeBuddyHook[];
};

type CodeBuddySettings = Record<string, unknown> & {
  hooks: Record<string, unknown>;
};

type CodeBuddyPreToolUsePayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
};

type CodeBuddyBashToolInput = {
  command?: unknown;
  description?: unknown;
  shell?: unknown;
} & Record<string, unknown>;

export type InstallCodeBuddyHookResult = {
  settingsPath: string;
  backupPath?: string;
  command: string;
};

export type CodeBuddyDoctorReport = {
  settingsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  checkedPaths: string[];
  missingPaths: string[];
};

export type CodeBuddyHookCommandOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
};

const TOKENJUICE_CODEBUDDY_STATUS = "wrapping bash through tokenjuice for compaction";
const TOKENJUICE_CODEBUDDY_FIX_COMMAND = "tokenjuice install codebuddy";
const TOKENJUICE_CODEBUDDY_HOOK_SUBCOMMAND = "codebuddy-pre-tool-use";
const TOKENJUICE_CODEBUDDY_WINDOWS_ISSUE = "tokenjuice codebuddy integration does not support native Windows shells yet. run CodeBuddy in WSL instead.";
const TOKENJUICE_CODEBUDDY_WINDOWS_HOOK_ISSUE = "configured CodeBuddy hook cannot run on native Windows; use CodeBuddy in WSL instead.";
const TOKENJUICE_CODEBUDDY_WSL_FIX_COMMAND = "run CodeBuddy in WSL, then run tokenjuice install codebuddy";

function isNativeWindowsCodeBuddyUnsupported(): boolean {
  return process.platform === "win32";
}

function getCodeBuddyHome(): string {
  // CodeBuddy resolves its config directory from CODEBUDDY_CONFIG_DIR when
  // set, matching the environment knob used by other hosts (CLAUDE_CONFIG_DIR).
  // CODEBUDDY_HOME is kept as a compatibility fallback.
  return process.env.CODEBUDDY_CONFIG_DIR || process.env.CODEBUDDY_HOME || join(homedir(), ".codebuddy");
}

function getDefaultSettingsPath(): string {
  return join(getCodeBuddyHome(), "settings.json");
}

async function buildCodeBuddyHookCommand(options: CodeBuddyHookCommandOptions = {}): Promise<string> {
  return buildWrapLauncherHookCommand({
    ...options,
    subcommand: TOKENJUICE_CODEBUDDY_HOOK_SUBCOMMAND,
    hostName: "codebuddy",
  });
}

function getCodeBuddyFixCommand(local = false): string {
  return local ? "tokenjuice install codebuddy --local" : TOKENJUICE_CODEBUDDY_FIX_COMMAND;
}

function createTokenjuiceCodeBuddyHook(command: string): CodeBuddyHookMatcherGroup {
  return {
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command,
        statusMessage: TOKENJUICE_CODEBUDDY_STATUS,
      },
    ],
  };
}

function isTokenjuiceCodeBuddyHookEntry(hook: unknown): boolean {
  if (!isRecord(hook)) {
    return false;
  }
  if (hook.statusMessage === TOKENJUICE_CODEBUDDY_STATUS) {
    return true;
  }
  // Legacy PostToolUse status message from an earlier iteration of this
  // host. Treat it as a tokenjuice entry so `install` replaces it.
  if (hook.statusMessage === "compacting bash output with tokenjuice") {
    return true;
  }
  if (typeof hook.command !== "string") {
    return false;
  }
  return (
    hook.command.includes(TOKENJUICE_CODEBUDDY_HOOK_SUBCOMMAND)
    // Match the legacy PostToolUse subcommand so `install` can migrate users
    // who installed an earlier version of this host.
    || hook.command.includes("codebuddy-post-tool-use")
  );
}

function isTokenjuiceCodeBuddyHook(group: CodeBuddyHookMatcherGroup): boolean {
  return group.hooks.some(isTokenjuiceCodeBuddyHookEntry);
}

function findTokenjuiceCodeBuddyHookCommand(config: CodeBuddySettings): string | undefined {
  const preToolUse = Array.isArray(config.hooks.PreToolUse) ? config.hooks.PreToolUse : [];
  for (const group of preToolUse) {
    if (!(isRecord(group) && Array.isArray(group.hooks) && isTokenjuiceCodeBuddyHook(group as CodeBuddyHookMatcherGroup))) {
      continue;
    }

    const command = group.hooks.find((hook) =>
      isRecord(hook)
      && (
        hook.statusMessage === TOKENJUICE_CODEBUDDY_STATUS
        || (typeof hook.command === "string" && hook.command.includes(TOKENJUICE_CODEBUDDY_HOOK_SUBCOMMAND))
      ),
    )?.command;
    if (typeof command === "string" && command) {
      return command;
    }
  }

  return undefined;
}

function sanitizeHooksSubtree(raw: unknown): Record<string, unknown> {
  return isRecord(raw) ? { ...raw } : {};
}

function sanitizeCodeBuddySettings(raw: unknown): CodeBuddySettings {
  if (!isRecord(raw)) {
    return { hooks: {} };
  }

  return {
    ...raw,
    hooks: sanitizeHooksSubtree(raw.hooks),
  };
}

async function loadCodeBuddySettings(settingsPath: string): Promise<{ config: CodeBuddySettings; backupPath?: string }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    const config = sanitizeCodeBuddySettings(parsed);
    const backupPath = `${settingsPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config, backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} } };
    }
    throw new Error(`failed to load codebuddy settings from ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readCodeBuddySettings(settingsPath: string): Promise<{ config: CodeBuddySettings; exists: boolean }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    return {
      config: sanitizeCodeBuddySettings(parsed),
      exists: true,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        config: { hooks: {} },
        exists: false,
      };
    }
    throw new Error(`failed to read codebuddy settings from ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function resolveCodeBuddyHostShell(toolInput: CodeBuddyBashToolInput): Promise<string | undefined> {
  return resolveHostShell([
    typeof toolInput.shell === "string" ? toolInput.shell : undefined,
    process.env.TOKENJUICE_CODEBUDDY_SHELL,
    process.env.SHELL,
    "bash",
    "sh",
  ]);
}

/**
 * Return `groups` with every tokenjuice hook entry removed from each group's
 * `.hooks[]`. Unrelated hooks are preserved; groups that end up empty are
 * dropped.
 *
 * This is the surgical counterpart to a simple group-level filter — dropping
 * a whole group would silently delete any user-authored hook that happens to
 * share a matcher group with the tokenjuice entry.
 */
function pruneTokenjuiceHookEntries(groups: unknown[]): unknown[] {
  const pruned: unknown[] = [];
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      pruned.push(group);
      continue;
    }
    const retainedHooks = group.hooks.filter((hook) => !isTokenjuiceCodeBuddyHookEntry(hook));
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

export async function installCodeBuddyHook(
  settingsPath = getDefaultSettingsPath(),
  options: CodeBuddyHookCommandOptions = {},
): Promise<InstallCodeBuddyHookResult> {
  if (isNativeWindowsCodeBuddyUnsupported()) {
    throw new Error(TOKENJUICE_CODEBUDDY_WINDOWS_ISSUE);
  }

  const { config, backupPath } = await loadCodeBuddySettings(settingsPath);
  const command = await buildCodeBuddyHookCommand(options);

  // Drop any legacy PostToolUse tokenjuice entries left behind by a prior
  // version of this host, but preserve unrelated hooks that happen to live in
  // the same matcher group.
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
  retained.push(createTokenjuiceCodeBuddyHook(command));
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

export async function doctorCodeBuddyHook(
  settingsPath = getDefaultSettingsPath(),
  options: CodeBuddyHookCommandOptions = {},
): Promise<CodeBuddyDoctorReport> {
  if (isNativeWindowsCodeBuddyUnsupported()) {
    const { config, exists } = await readCodeBuddySettings(settingsPath);
    const detectedCommand = findTokenjuiceCodeBuddyHookCommand(config);
    const checkedPaths = detectedCommand ? extractHookCommandPaths(detectedCommand) : [];
    return {
      settingsPath,
      status: exists && detectedCommand ? "broken" : "disabled",
      issues: [exists && detectedCommand ? TOKENJUICE_CODEBUDDY_WINDOWS_HOOK_ISSUE : TOKENJUICE_CODEBUDDY_WINDOWS_ISSUE],
      fixCommand: TOKENJUICE_CODEBUDDY_WSL_FIX_COMMAND,
      expectedCommand: TOKENJUICE_CODEBUDDY_WSL_FIX_COMMAND,
      ...(detectedCommand ? { detectedCommand } : {}),
      checkedPaths,
      missingPaths: [],
    };
  }

  const expectedCommand = await buildCodeBuddyHookCommand(options);
  const fixCommand = getCodeBuddyFixCommand(options.local);
  const { config, exists } = await readCodeBuddySettings(settingsPath);
  const detectedCommand = findTokenjuiceCodeBuddyHookCommand(config);

  if (!exists || !detectedCommand) {
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
  if (detectedCommand !== expectedCommand) {
    if (detectedCommand.includes("/Cellar/")) {
      issues.push("configured CodeBuddy hook is pinned to a versioned Homebrew Cellar path");
    } else {
      issues.push("configured CodeBuddy hook command does not match the current recommended command");
    }
  }
  if (missingPaths.length > 0) {
    issues.push(`configured CodeBuddy hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
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

export async function runCodeBuddyPreToolUseHook(rawText: string, wrapLauncher = "tokenjuice"): Promise<number> {
  let payload: CodeBuddyPreToolUsePayload;
  try {
    payload = JSON.parse(rawText) as CodeBuddyPreToolUsePayload;
  } catch {
    return 0;
  }

  if (payload.hook_event_name !== "PreToolUse") {
    return 0;
  }
  if (payload.tool_name !== "Bash" || !isRecord(payload.tool_input)) {
    return 0;
  }

  const toolInput = payload.tool_input as CodeBuddyBashToolInput;
  const command = typeof toolInput.command === "string" ? toolInput.command : undefined;
  if (!command || !command.trim()) {
    return 0;
  }
  if (commandAlreadyWrapped(command)) {
    return 0;
  }
  if (isNativeWindowsCodeBuddyUnsupported()) {
    const response = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: TOKENJUICE_CODEBUDDY_WINDOWS_ISSUE,
      },
    };
    process.stdout.write(`${JSON.stringify(response)}\n`);
    return 0;
  }

  const shellPath = await resolveCodeBuddyHostShell(toolInput);
  if (!shellPath) {
    return 0;
  }

  const wrappedCommand = buildWrappedCommand({ wrapLauncher, shellPath, command, source: "codebuddy" });

  const response = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      modifiedInput: {
        ...toolInput,
        command: wrappedCommand,
      },
    },
  };
  process.stdout.write(`${JSON.stringify(response)}\n`);
  return 0;
}
