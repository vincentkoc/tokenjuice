import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import {
  buildTokenjuiceHookCommand,
  type TokenjuiceHookCommandOptions,
} from "../shared/host-command.js";
import { buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { buildCompactedOutputContext, writeEmptyHookJsonLine, writeHookJsonLine } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";

export type QwenCodeHookCommandOptions = TokenjuiceHookCommandOptions & {
  projectDir?: string;
};

export type InstallQwenCodeHookResult = {
  settingsPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallQwenCodeHookResult = {
  settingsPath: string;
  removed: number;
};

export type QwenCodeDoctorReport = {
  settingsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  checkedPaths: string[];
  missingPaths: string[];
};

type QwenCodeSettings = Record<string, unknown> & {
  hooks: Record<string, unknown>;
};

type QwenCodePostToolUsePayload = {
  hook_event_name?: unknown;
  hookEventName?: unknown;
  tool_name?: unknown;
  toolName?: unknown;
  tool_input?: unknown;
  toolInput?: unknown;
  tool_response?: unknown;
  toolResponse?: unknown;
  cwd?: unknown;
};

const TOKENJUICE_QWEN_CODE_SUBCOMMAND = "qwen-code-post-tool-use";
const TOKENJUICE_QWEN_CODE_FIX_COMMAND = "tokenjuice install qwen-code";
const TOKENJUICE_QWEN_CODE_ADVISORY = "Qwen Code support is beta and injects compacted context without suppressing the original tool result.";
const TOKENJUICE_QWEN_CODE_DISABLED_ADVISORY = "Qwen Code support is beta; verify live PostToolUse behavior after install.";

function getProjectDir(options: QwenCodeHookCommandOptions = {}): string {
  return options.projectDir || process.env.QWEN_PROJECT_DIR || process.cwd();
}

function getDefaultSettingsPath(options: QwenCodeHookCommandOptions = {}): string {
  return join(getProjectDir(options), ".qwen", "settings.json");
}

function sanitizeQwenCodeSettings(raw: unknown): QwenCodeSettings {
  if (!isRecord(raw)) {
    return { hooks: {} };
  }
  return {
    ...raw,
    hooks: isRecord(raw.hooks) ? { ...raw.hooks } : {},
  };
}

async function readQwenCodeSettings(settingsPath: string): Promise<{ config: QwenCodeSettings; exists: boolean }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    return { config: sanitizeQwenCodeSettings(JSON.parse(rawText) as unknown), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} }, exists: false };
    }
    throw error;
  }
}

async function loadQwenCodeSettingsWithBackup(settingsPath: string): Promise<{ config: QwenCodeSettings; backupPath?: string }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const backupPath = `${settingsPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config: sanitizeQwenCodeSettings(JSON.parse(rawText) as unknown), backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} } };
    }
    throw error;
  }
}

async function writeQwenCodeSettings(settingsPath: string, config: QwenCodeSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, settingsPath);
}

function isTokenjuiceQwenCodeHook(entry: unknown): boolean {
  return isRecord(entry)
    && typeof entry.command === "string"
    && entry.command.includes(TOKENJUICE_QWEN_CODE_SUBCOMMAND);
}

function getPostToolUseHooks(config: QwenCodeSettings): unknown[] {
  const postToolUse = config.hooks.PostToolUse;
  return Array.isArray(postToolUse) ? postToolUse : [];
}

function findTokenjuiceQwenCodeHookCommand(config: QwenCodeSettings): string | undefined {
  for (const group of getPostToolUseHooks(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }
    for (const hook of group.hooks) {
      if (isTokenjuiceQwenCodeHook(hook)) {
        return (hook as { command: string }).command;
      }
    }
  }
  return undefined;
}

function removeTokenjuiceQwenCodeHooks(config: QwenCodeSettings): number {
  let removed = 0;
  const retainedGroups: unknown[] = [];
  for (const group of getPostToolUseHooks(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      retainedGroups.push(group);
      continue;
    }
    const retainedHooks = group.hooks.filter((hook) => {
      const remove = isTokenjuiceQwenCodeHook(hook);
      if (remove) {
        removed += 1;
      }
      return !remove;
    });
    if (retainedHooks.length > 0) {
      retainedGroups.push({ ...group, hooks: retainedHooks });
    }
  }
  config.hooks.PostToolUse = retainedGroups;
  return removed;
}

function createQwenCodeHook(command: string): Record<string, unknown> {
  return {
    matcher: "^(Bash|Shell|run_shell_command)$",
    sequential: true,
    hooks: [
      {
        type: "command",
        name: "tokenjuice",
        command,
        timeout: 60000,
        description: "Inject compacted context for noisy shell output after Qwen Code runs a command.",
      },
    ],
  };
}

export async function installQwenCodeHook(
  settingsPath?: string,
  options: QwenCodeHookCommandOptions = {},
): Promise<InstallQwenCodeHookResult> {
  const resolvedSettingsPath = settingsPath ?? getDefaultSettingsPath(options);
  const { config, backupPath } = await loadQwenCodeSettingsWithBackup(resolvedSettingsPath);
  const command = await buildTokenjuiceHookCommand(TOKENJUICE_QWEN_CODE_SUBCOMMAND, "qwen-code", options);
  removeTokenjuiceQwenCodeHooks(config);
  config.hooks.PostToolUse = [...getPostToolUseHooks(config), createQwenCodeHook(command)];
  await writeQwenCodeSettings(resolvedSettingsPath, config);
  return {
    settingsPath: resolvedSettingsPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallQwenCodeHook(
  settingsPath?: string,
  options: QwenCodeHookCommandOptions = {},
): Promise<UninstallQwenCodeHookResult> {
  const resolvedSettingsPath = settingsPath ?? getDefaultSettingsPath(options);
  const { config } = await readQwenCodeSettings(resolvedSettingsPath);
  const removed = removeTokenjuiceQwenCodeHooks(config);
  if (removed > 0) {
    await writeQwenCodeSettings(resolvedSettingsPath, config);
  }
  return { settingsPath: resolvedSettingsPath, removed };
}

export async function doctorQwenCodeHook(
  settingsPath?: string,
  options: QwenCodeHookCommandOptions = {},
): Promise<QwenCodeDoctorReport> {
  const resolvedSettingsPath = settingsPath ?? getDefaultSettingsPath(options);
  const expectedCommand = await buildTokenjuiceHookCommand(TOKENJUICE_QWEN_CODE_SUBCOMMAND, "qwen-code", options);
  const { config, exists } = await readQwenCodeSettings(resolvedSettingsPath);
  const detectedCommand = findTokenjuiceQwenCodeHookCommand(config);
  const fields = await buildHookCommandDoctorFields({
    expectedCommand,
    detectedCommand: exists ? detectedCommand : undefined,
    disabledIssue: "tokenjuice PostToolUse hook is not installed for Qwen Code",
    hostLabel: "Qwen Code",
    advisory: detectedCommand ? TOKENJUICE_QWEN_CODE_ADVISORY : TOKENJUICE_QWEN_CODE_DISABLED_ADVISORY,
    fixCommand: TOKENJUICE_QWEN_CODE_FIX_COMMAND,
  });

  if (detectedCommand && config.disableAllHooks === true) {
    return {
      settingsPath: resolvedSettingsPath,
      ...fields,
      status: "broken",
      issues: [...fields.issues, "Qwen Code has disableAllHooks enabled; configured hooks will not run"],
    };
  }

  return {
    settingsPath: resolvedSettingsPath,
    ...fields,
  };
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function readNestedStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value)) {
      const text = value.map(readQwenCodeOutputText).filter(Boolean).join("\n");
      if (text.trim()) {
        return text;
      }
    }
  }
  return undefined;
}

function readQwenCodeOutputText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }
  if (Array.isArray(response)) {
    return response.map(readQwenCodeOutputText).filter(Boolean).join("\n");
  }
  if (!isRecord(response)) {
    return "";
  }
  const direct = readNestedStringField(response, ["llmContent", "returnDisplay", "text", "content", "output", "result", "stdout"]);
  if (direct) {
    return direct;
  }
  if (isRecord(response.result)) {
    return readQwenCodeOutputText(response.result);
  }
  return "";
}

function readPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readPayloadField(payload: QwenCodePostToolUsePayload, snakeKey: keyof QwenCodePostToolUsePayload, camelKey: keyof QwenCodePostToolUsePayload): unknown {
  return payload[snakeKey] ?? payload[camelKey];
}

export async function runQwenCodePostToolUseHook(rawText: string): Promise<number> {
  let payload: QwenCodePostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as QwenCodePostToolUsePayload;
  } catch {
    writeEmptyHookJsonLine();
    return 0;
  }

  const hookEventName = readPayloadField(payload, "hook_event_name", "hookEventName");
  const toolName = readPayloadField(payload, "tool_name", "toolName");
  if (
    (typeof hookEventName === "string" && hookEventName !== "PostToolUse")
    || (toolName !== "Bash" && toolName !== "Shell" && toolName !== "run_shell_command")
  ) {
    writeEmptyHookJsonLine();
    return 0;
  }

  const toolInputValue = readPayloadField(payload, "tool_input", "toolInput");
  const toolInput = isRecord(toolInputValue) ? toolInputValue : undefined;
  const command = toolInput ? readStringField(toolInput, ["command", "cmd"]) : undefined;
  const visibleText = readQwenCodeOutputText(readPayloadField(payload, "tool_response", "toolResponse"));
  if (!command || !visibleText.trim()) {
    writeEmptyHookJsonLine();
    return 0;
  }

  try {
    const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_QWEN_CODE_MAX_INLINE_CHARS");
    const outcome = await compactBashResult({
      source: "qwen-code",
      command,
      visibleText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      inspectionPolicy: "allow-safe-inventory",
      metadata: { source: "qwen-code-post-tool-use" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.action === "keep") {
      writeEmptyHookJsonLine();
      return 0;
    }

    writeHookJsonLine({
      decision: "allow",
      reason: "tokenjuice compacted noisy shell output",
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: buildCompactedOutputContext(outcome.result.inlineText),
      },
    });
    return 0;
  } catch {
    writeEmptyHookJsonLine();
    return 0;
  }
}
