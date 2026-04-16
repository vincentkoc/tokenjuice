import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { isCompoundShellCommand } from "./command.js";
import { reduceExecution } from "./reduce.js";

import type { CompactResult, ReduceOptions } from "../types.js";

type ClaudeCodeHookCommand = {
  type: "command";
  command: string;
  statusMessage?: string;
  timeout?: number;
};

type ClaudeCodeHookMatcherGroup = {
  matcher?: string;
  hooks: ClaudeCodeHookCommand[];
};

type ClaudeCodeSettings = Record<string, unknown> & {
  hooks: Record<string, ClaudeCodeHookMatcherGroup[]>;
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

const GENERIC_FALLBACK_MIN_SAVED_CHARS = 120;
const GENERIC_FALLBACK_MAX_RATIO = 0.75;

export type InstallClaudeCodeHookResult = {
  settingsPath: string;
  backupPath?: string;
  command: string;
};

const TOKENJUICE_CLAUDE_CODE_STATUS = "compacting bash output with tokenjuice";

function getClaudeCodeHome(): string {
  return process.env.CLAUDE_HOME || join(homedir(), ".claude");
}

function getDefaultSettingsPath(): string {
  return join(getClaudeCodeHome(), "settings.json");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/u.test(value)) {
    return value;
  }
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

function buildClaudeCodeHookCommand(binaryPath = process.argv[1], nodePath = process.execPath): string {
  if (!binaryPath) {
    throw new Error("unable to resolve tokenjuice binary path for claude code install");
  }

  if (binaryPath.endsWith(".js")) {
    return `${shellQuote(nodePath)} ${shellQuote(binaryPath)} claude-code-post-tool-use`;
  }

  return `${shellQuote(binaryPath)} claude-code-post-tool-use`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyToolResponse(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => stringifyToolResponse(entry))
      .filter(Boolean)
      .join("\n");
  }
  if (isRecord(value)) {
    for (const key of ["output", "text", "stdout", "stderr", "combinedText"]) {
      const text = value[key];
      if (typeof text === "string" && text) {
        return text;
      }
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function createTokenjuiceClaudeCodeHook(command: string): ClaudeCodeHookMatcherGroup {
  return {
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command,
        statusMessage: TOKENJUICE_CLAUDE_CODE_STATUS,
      },
    ],
  };
}

function isTokenjuiceClaudeCodeHook(group: ClaudeCodeHookMatcherGroup): boolean {
  return group.hooks.some((hook) =>
    hook.statusMessage === TOKENJUICE_CLAUDE_CODE_STATUS
    || hook.command.includes("claude-code-post-tool-use"),
  );
}

function sanitizeHooksSubtree(raw: unknown): Record<string, ClaudeCodeHookMatcherGroup[]> {
  if (!isRecord(raw)) {
    return {};
  }

  const hooks: Record<string, ClaudeCodeHookMatcherGroup[]> = {};
  for (const [eventName, groups] of Object.entries(raw)) {
    if (!Array.isArray(groups)) {
      continue;
    }

    const normalizedGroups = groups.flatMap((group): ClaudeCodeHookMatcherGroup[] => {
      if (!isRecord(group) || !Array.isArray(group.hooks)) {
        return [];
      }

      const commands = group.hooks.flatMap((hook): ClaudeCodeHookCommand[] => {
        if (!isRecord(hook) || hook.type !== "command" || typeof hook.command !== "string") {
          return [];
        }

        const normalized: ClaudeCodeHookCommand = {
          type: "command",
          command: hook.command,
        };
        if (typeof hook.statusMessage === "string" && hook.statusMessage) {
          normalized.statusMessage = hook.statusMessage;
        }
        if (typeof hook.timeout === "number" && Number.isFinite(hook.timeout)) {
          normalized.timeout = hook.timeout;
        }
        return [normalized];
      });

      if (commands.length === 0) {
        return [];
      }

      const normalizedGroup: ClaudeCodeHookMatcherGroup = {
        hooks: commands,
      };
      if (typeof group.matcher === "string" && group.matcher) {
        normalizedGroup.matcher = group.matcher;
      }
      return [normalizedGroup];
    });

    if (normalizedGroups.length > 0) {
      hooks[eventName] = normalizedGroups;
    }
  }

  return hooks;
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

export async function installClaudeCodeHook(settingsPath = getDefaultSettingsPath()): Promise<InstallClaudeCodeHookResult> {
  const { config, backupPath } = await loadClaudeCodeSettings(settingsPath);
  const command = buildClaudeCodeHookCommand();
  const postToolUse = config.hooks.PostToolUse ?? [];
  const retained = postToolUse.filter((group) => !isTokenjuiceClaudeCodeHook(group));
  retained.push(createTokenjuiceClaudeCodeHook(command));
  config.hooks.PostToolUse = retained;

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

function readPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function shouldStoreFromEnv(): boolean {
  const value = process.env.TOKENJUICE_CLAUDE_CODE_STORE;
  return value === "1" || value === "true" || value === "TRUE" || value === "yes" || value === "YES";
}

function getClaudeCodeRewriteSkipReason(command: string, combinedText: string, result: CompactResult): string | null {
  const inlineText = result.inlineText.trim();
  const rawText = combinedText.trim();
  const rawChars = result.stats.rawChars;
  const reducedChars = result.stats.reducedChars;

  if (!inlineText || inlineText === rawText || reducedChars >= rawChars) {
    return "no-compaction";
  }

  if (result.classification.matchedReducer !== "generic/fallback") {
    return null;
  }

  if (isCompoundShellCommand(command)) {
    return "generic-compound-command";
  }

  const savedChars = rawChars - reducedChars;
  const ratio = rawChars === 0 ? 1 : reducedChars / rawChars;
  if (savedChars < GENERIC_FALLBACK_MIN_SAVED_CHARS || ratio > GENERIC_FALLBACK_MAX_RATIO) {
    return "generic-weak-compaction";
  }

  return null;
}

async function writeHookDebug(record: Record<string, unknown>): Promise<void> {
  const debugPath = join(getClaudeCodeHome(), "tokenjuice-hook.last.json");
  await mkdir(dirname(debugPath), { recursive: true });
  await writeFile(debugPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function runClaudeCodePostToolUseHook(rawText: string): Promise<number> {
  let payload: ClaudeCodePostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as ClaudeCodePostToolUsePayload;
  } catch {
    return 0;
  }

  const command = payload.tool_input?.command;
  const debug: Record<string, unknown> = {
    hookEvent: payload.hook_event_name,
    toolName: payload.tool_name,
    command,
    rewrote: false,
  };

  if (payload.hook_event_name !== "PostToolUse") {
    await writeHookDebug({ ...debug, skipped: "non-post-tool-use" });
    return 0;
  }
  if (payload.tool_name !== "Bash") {
    await writeHookDebug({ ...debug, skipped: "non-bash" });
    return 0;
  }
  if (typeof command !== "string" || !command.trim()) {
    await writeHookDebug({ ...debug, skipped: "missing-command" });
    return 0;
  }

  const combinedText = stringifyToolResponse(payload.tool_response);
  if (!combinedText.trim()) {
    await writeHookDebug({ ...debug, skipped: "empty-tool-response" });
    return 0;
  }

  const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_CLAUDE_CODE_MAX_INLINE_CHARS");
  const options: ReduceOptions = {
    ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
    ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
    ...(shouldStoreFromEnv() ? { store: true } : {}),
  };

  try {
    const result = await reduceExecution(
      {
        toolName: "exec",
        command,
        combinedText,
        ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
        metadata: {
          source: "claude-code-post-tool-use",
        },
      },
      options,
    );

    const rawChars = result.stats.rawChars;
    const reducedChars = result.stats.reducedChars;
    debug.rawChars = rawChars;
    debug.reducedChars = reducedChars;
    debug.matchedReducer = result.classification.matchedReducer;

    const skipReason = getClaudeCodeRewriteSkipReason(command, combinedText, result);
    if (skipReason) {
      await writeHookDebug({ ...debug, skipped: skipReason });
      return 0;
    }

    const hookOutput: Record<string, unknown> = {
      decision: "block",
      reason: result.inlineText,
    };
    if (result.rawRef?.id) {
      hookOutput.hookSpecificOutput = {
        hookEventName: "PostToolUse",
        additionalContext: `tokenjuice stored raw bash output as artifact ${result.rawRef.id}. use \`tokenjuice cat ${result.rawRef.id}\` only if the compacted output is insufficient.`,
      };
    }

    process.stdout.write(`${JSON.stringify(hookOutput)}\n`);
    await writeHookDebug({ ...debug, rewrote: true });
    return 0;
  } catch (error) {
    await writeHookDebug({
      ...debug,
      skipped: "hook-error",
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
