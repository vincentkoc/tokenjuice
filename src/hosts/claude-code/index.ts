import { join } from "node:path";
import { homedir } from "node:os";

import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import { buildTokenjuiceHookCommand } from "../shared/host-command.js";
import { parseShellWords, posixShellQuote } from "../shared/hook-command.js";
import { inspectTokenjuiceHookCommand } from "../shared/hook-command-doctor.js";
import { pruneHookGroups, readJsonHooksConfig, sanitizeHooksSettings } from "../shared/hooks-json-file.js";
import { parseSettingsJson, readSettingsFile, writeSettingsFile } from "../shared/settings-file.js";
import {
  buildWrapLauncherHookCommand,
  buildWrappedCommand,
  commandAlreadyWrapped,
  isRecord,
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

type ClaudeCodePostToolUsePayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  cwd?: unknown;
  tool_input?: {
    command?: unknown;
  };
  tool_response?: unknown;
};

type ClaudeCodeBashToolInput = {
  command?: unknown;
  description?: unknown;
  shell?: unknown;
} & Record<string, unknown>;

type ClaudeCodeBashToolResponse = {
  stdout: string;
  stderr: string;
  interrupted: boolean;
  isImage?: boolean;
} & Record<string, unknown>;

type DetectedClaudeCodeHook = {
  hook: ClaudeCodeHook;
  hookEvent: ClaudeCodeHookEvent;
  matcher: unknown;
  handlerType: unknown;
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
  mode?: ClaudeCodeHookMode;
};

export type ClaudeCodeHookMode = "post-tool-use" | "pre-tool-use";

const TOKENJUICE_CLAUDE_CODE_POST_STATUS = "compacting bash output with tokenjuice";
const TOKENJUICE_CLAUDE_CODE_PRE_STATUS = "wrapping bash through tokenjuice for compaction";
const TOKENJUICE_CLAUDE_CODE_POST_SUBCOMMAND = "claude-code-post-tool-use";
const TOKENJUICE_CLAUDE_CODE_PRE_SUBCOMMAND = "claude-code-pre-tool-use";
const TOKENJUICE_CLAUDE_CODE_HOOK_TIMEOUT_SECONDS = 10;
// Claude Code has a large context window and truncates oversized Bash output on
// its own, so it only benefits from compaction on genuinely large output.
// Output at or below this many characters passes through untouched (no
// reduction, no footer); only larger output is compacted. Override with
// TOKENJUICE_CLAUDE_CODE_MIN_REDUCE_CHARS.
const TOKENJUICE_CLAUDE_CODE_DEFAULT_MIN_REDUCE_CHARS = 16384;

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
  const command = options.mode === "pre-tool-use"
    ? await buildWrapLauncherHookCommand({
      ...options,
      subcommand: TOKENJUICE_CLAUDE_CODE_PRE_SUBCOMMAND,
      hostName: "claude code",
    })
    : await buildTokenjuiceHookCommand(TOKENJUICE_CLAUDE_CODE_POST_SUBCOMMAND, "claude code", options);
  if (process.platform !== "win32") {
    return command;
  }

  // Claude Code runs hooks for the Bash tool through Git Bash on Windows.
  return parseShellWords(command, "win32")
    // Quote apostrophes without backslash escapes so Windows hook inspection can also read them.
    .map((arg) => posixShellQuote(arg.replaceAll("\\", "/")).replaceAll("'\\''", "'\"'\"'"))
    .join(" ");
}

function getClaudeCodeFixCommand(options: ClaudeCodeHookCommandOptions): string {
  return [
    "tokenjuice install claude-code",
    ...(options.local ? ["--local"] : []),
    ...(options.mode === "pre-tool-use" ? ["--pre-tool-use"] : []),
  ].join(" ");
}

function createTokenjuiceClaudeCodeHook(command: string, mode: ClaudeCodeHookMode): ClaudeCodeHookMatcherGroup {
  return {
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command,
        statusMessage: mode === "pre-tool-use" ? TOKENJUICE_CLAUDE_CODE_PRE_STATUS : TOKENJUICE_CLAUDE_CODE_POST_STATUS,
        timeout: TOKENJUICE_CLAUDE_CODE_HOOK_TIMEOUT_SECONDS,
      },
    ],
  };
}

function isTokenjuiceClaudeCodeHookEntry(hook: unknown): hook is ClaudeCodeHook {
  if (!isRecord(hook)) {
    return false;
  }
  if (hook.statusMessage === TOKENJUICE_CLAUDE_CODE_POST_STATUS || hook.statusMessage === TOKENJUICE_CLAUDE_CODE_PRE_STATUS) {
    return true;
  }
  if (typeof hook.command !== "string") {
    return false;
  }
  return hook.command.includes(TOKENJUICE_CLAUDE_CODE_POST_SUBCOMMAND)
    || hook.command.includes(TOKENJUICE_CLAUDE_CODE_PRE_SUBCOMMAND);
}

function findTokenjuiceClaudeCodeHooks(
  config: ClaudeCodeSettings,
  preferredEvent: ClaudeCodeHookEvent,
): DetectedClaudeCodeHook[] {
  const events: ClaudeCodeHookEvent[] = preferredEvent === "PostToolUse"
    ? ["PostToolUse", "PreToolUse"]
    : ["PreToolUse", "PostToolUse"];
  const detected: DetectedClaudeCodeHook[] = [];
  for (const hookEvent of events) {
    const groups = Array.isArray(config.hooks[hookEvent]) ? config.hooks[hookEvent] : [];
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.hooks)) {
        continue;
      }
      for (const hook of group.hooks.filter(isTokenjuiceClaudeCodeHookEntry)) {
        detected.push({
          hook,
          hookEvent,
          matcher: group.matcher,
          handlerType: hook.type,
        });
      }
    }
  }
  return detected;
}

function removeTokenjuiceHookEvent(config: ClaudeCodeSettings, event: ClaudeCodeHookEvent): boolean {
  if (!Array.isArray(config.hooks[event])) {
    return false;
  }

  const groups = config.hooks[event];
  const pruned = pruneHookGroups(groups, isTokenjuiceClaudeCodeHookEntry);
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

export function resolveClaudeCodeMinReduceChars(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TOKENJUICE_CLAUDE_CODE_MIN_REDUCE_CHARS;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return TOKENJUICE_CLAUDE_CODE_DEFAULT_MIN_REDUCE_CHARS;
}

export async function installClaudeCodeHook(
  settingsPath = getDefaultSettingsPath(),
  options: ClaudeCodeHookCommandOptions = {},
): Promise<InstallClaudeCodeHookResult> {
  const settings = await readSettingsFile(settingsPath);
  const config = sanitizeHooksSettings(parseSettingsJson(settings, "claude code"));
  const mode = options.mode ?? "post-tool-use";
  const command = await buildClaudeCodeHookCommand(options);

  removeTokenjuiceHookEvent(config, "PreToolUse");
  removeTokenjuiceHookEvent(config, "PostToolUse");

  const event = mode === "pre-tool-use" ? "PreToolUse" : "PostToolUse";
  const retained = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
  retained.push(createTokenjuiceClaudeCodeHook(command, mode));
  config.hooks[event] = retained;

  const backupPath = await writeSettingsFile(settings, `${JSON.stringify(config, null, 2)}\n`, "replace");

  return {
    settingsPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallClaudeCodeHook(
  settingsPath = getDefaultSettingsPath(),
): Promise<UninstallClaudeCodeHookResult> {
  const settings = await readSettingsFile(settingsPath);
  if (!settings.data) {
    return { settingsPath, removed: false };
  }
  const config = sanitizeHooksSettings(parseSettingsJson(settings, "claude code"));
  const removedPreToolUse = removeTokenjuiceHookEvent(config, "PreToolUse");
  const removedPostToolUse = removeTokenjuiceHookEvent(config, "PostToolUse");
  const removed = removedPreToolUse || removedPostToolUse;

  if (!removed) {
    return { settingsPath, removed: false };
  }

  const backupPath = await writeSettingsFile(settings, `${JSON.stringify(config, null, 2)}\n`, "preserve");

  return {
    settingsPath,
    ...(backupPath ? { backupPath } : {}),
    removed: true,
  };
}

export async function doctorClaudeCodeHook(
  settingsPath = getDefaultSettingsPath(),
  options: ClaudeCodeHookCommandOptions = {},
): Promise<ClaudeCodeDoctorReport> {
  const expectedEvent = options.mode === "pre-tool-use" ? "PreToolUse" : "PostToolUse";
  const [postToolUseCommand, preToolUseCommand] = await Promise.all([
    buildClaudeCodeHookCommand({ ...options, mode: "post-tool-use" }),
    buildClaudeCodeHookCommand({ ...options, mode: "pre-tool-use" }),
  ]);
  const expectedCommands: Record<ClaudeCodeHookEvent, string> = {
    PostToolUse: postToolUseCommand,
    PreToolUse: preToolUseCommand,
  };
  const expectedCommand = expectedCommands[expectedEvent];
  const fixCommand = getClaudeCodeFixCommand(options);
  const { config, exists } = await readJsonHooksConfig(settingsPath, "claude code settings", sanitizeHooksSettings, { hooks: {} });
  const detectedHooks = findTokenjuiceClaudeCodeHooks(config, expectedEvent);
  const detectedCommand = detectedHooks
    .map(({ hook }) => typeof hook.command === "string" && hook.command.trim() ? hook.command : undefined)
    .find((command): command is string => command !== undefined);

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

  if (detectedHooks.length === 0) {
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

  const issues: string[] = [];
  const addIssue = (issue: string): void => {
    if (!issues.includes(issue)) {
      issues.push(issue);
    }
  };
  const expectedHooks = detectedHooks.filter(({ hookEvent }) => hookEvent === expectedEvent);
  const unexpectedHooks = detectedHooks.filter(({ hookEvent }) => hookEvent !== expectedEvent);
  if (unexpectedHooks.length > 0 && expectedHooks.length === 0) {
    issues.push(expectedEvent === "PostToolUse"
      ? "Claude Code PreToolUse tokenjuice hook is installed; rerun tokenjuice install claude-code to migrate to non-mutating PostToolUse"
      : "Claude Code PostToolUse tokenjuice hook is installed; rerun tokenjuice install claude-code --pre-tool-use to opt in to PreToolUse wrapping");
  } else if (unexpectedHooks.length > 0) {
    issues.push(expectedEvent === "PostToolUse"
      ? "an additional Claude Code PreToolUse tokenjuice hook is active; rerun tokenjuice install claude-code to remove command wrapping"
      : "an additional Claude Code PostToolUse tokenjuice hook is active; rerun tokenjuice install claude-code --pre-tool-use to keep only PreToolUse wrapping");
  }

  for (const hookEvent of ["PostToolUse", "PreToolUse"] as const) {
    if (detectedHooks.filter((entry) => entry.hookEvent === hookEvent).length > 1) {
      addIssue(`multiple Claude Code ${hookEvent} tokenjuice hooks are active; rerun ${fixCommand} to keep only one`);
    }
  }

  const checkedPathSet = new Set<string>();
  const missingPathSet = new Set<string>();
  let malformedCommand = false;
  let malformedHookStructure = false;
  for (const { hook, hookEvent, matcher, handlerType } of detectedHooks) {
    if (matcher !== "Bash") {
      malformedHookStructure = true;
      addIssue(
        `configured Claude Code tokenjuice hook matcher is not Bash; run ${fixCommand} to restore Bash output compaction`,
      );
    }
    if (handlerType !== "command") {
      malformedHookStructure = true;
      addIssue(
        `configured Claude Code tokenjuice hook type is not command; run ${fixCommand} to restore Bash output compaction`,
      );
    }

    const command = typeof hook.command === "string" && hook.command.trim() ? hook.command : undefined;
    if (!command) {
      malformedCommand = true;
      addIssue("configured Claude Code tokenjuice hook is missing its command");
      continue;
    }

    const inspection = await inspectTokenjuiceHookCommand({ command });
    for (const path of inspection.checkedPaths) {
      checkedPathSet.add(path);
    }
    for (const path of [...inspection.missingPaths, ...inspection.nonExecutablePaths]) {
      missingPathSet.add(path);
    }

    if (hook.timeout !== TOKENJUICE_CLAUDE_CODE_HOOK_TIMEOUT_SECONDS) {
      addIssue(
        `configured Claude Code tokenjuice hook timeout is missing or stale; run ${fixCommand} to add the ${TOKENJUICE_CLAUDE_CODE_HOOK_TIMEOUT_SECONDS}s safety cap`,
      );
    }
    if (command !== expectedCommands[hookEvent]) {
      if (command.includes("/Cellar/")) {
        addIssue("configured Claude Code hook is pinned to a versioned Homebrew Cellar path");
      } else {
        addIssue("configured Claude Code hook command does not match the current recommended command");
      }
    }
  }

  const checkedPaths = [...checkedPathSet];
  const missingPaths = [...missingPathSet];
  if (missingPaths.length > 0) {
    addIssue(`configured Claude Code hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
  }

  return {
    settingsPath,
    status: malformedCommand || malformedHookStructure || missingPaths.length > 0
      ? "broken"
      : issues.length > 0 ? "warn" : "ok",
    issues,
    fixCommand,
    expectedCommand,
    ...(detectedCommand ? { detectedCommand } : {}),
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

  if (!isRecord(payload) || payload.hook_event_name !== "PreToolUse") {
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

  const wrappedCommand = buildWrappedCommand({
    wrapLauncher,
    shellPath,
    command,
    source: "claude-code",
    minReduceChars: resolveClaudeCodeMinReduceChars(),
  });
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

function parseBashToolResponse(value: unknown): ClaudeCodeBashToolResponse | undefined {
  if (
    !isRecord(value)
    || typeof value.stdout !== "string"
    || typeof value.stderr !== "string"
    || typeof value.interrupted !== "boolean"
    || (value.isImage !== undefined && typeof value.isImage !== "boolean")
  ) {
    return undefined;
  }
  return value as ClaudeCodeBashToolResponse;
}

export async function runClaudeCodePostToolUseHook(rawText: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    return 0;
  }
  if (!isRecord(parsed)) {
    return 0;
  }
  const payload = parsed as ClaudeCodePostToolUsePayload;

  const command = payload.tool_input?.command;
  if (
    payload.hook_event_name !== "PostToolUse"
    || payload.tool_name !== "Bash"
    || typeof command !== "string"
    || !command.trim()
    || commandAlreadyWrapped(command)
  ) {
    return 0;
  }

  const toolResponse = parseBashToolResponse(payload.tool_response);
  if (
    !toolResponse
    || toolResponse.isImage === true
    || !toolResponse.stdout.trim()
    || toolResponse.stdout.length <= resolveClaudeCodeMinReduceChars()
  ) {
    return 0;
  }

  try {
    const outcome = await compactBashResult({
      source: "claude-code",
      command,
      visibleText: toolResponse.stdout,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      inspectionPolicy: "allow-safe-inventory",
      metadata: { source: "claude-code-post-tool-use" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.action === "rewrite") {
      process.stdout.write(`${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          updatedToolOutput: {
            ...toolResponse,
            stdout: outcome.result.inlineText,
          },
        },
      })}\n`);
    }
  } catch {
    return 0;
  }
  return 0;
}
