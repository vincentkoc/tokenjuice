import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { readStringField } from "../../core/record-fields.js";
import { readPositiveIntegerEnv } from "../../core/env.js";
import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import type { TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import { type HookCommandDoctorReport, buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { buildCompactedOutputContext, writeEmptyHookJsonLine, writeHookJsonLine } from "../shared/hook-output.js";
import { type HooksSettings as QwenCodeSettings, isRecord, sanitizeHooksSettings as sanitizeQwenCodeSettings } from "../shared/hooks-json-file.js";
import { buildWrapLauncherHookCommand, buildWrappedCommand, commandAlreadyWrapped, resolveHostShell } from "../shared/pre-tool-wrap.js";

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

export type QwenCodeDoctorReport = HookCommandDoctorReport<"settingsPath">;

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

const TOKENJUICE_QWEN_CODE_SUBCOMMAND = "qwen-code-pre-tool-use";
const TOKENJUICE_QWEN_CODE_LEGACY_SUBCOMMAND = "qwen-code-post-tool-use";
const TOKENJUICE_QWEN_CODE_FIX_COMMAND = "tokenjuice install qwen-code";
const TOKENJUICE_QWEN_CODE_ADVISORY = "Qwen Code pre-tool wrapping is beta; shell commands run through tokenjuice before execution.";
const TOKENJUICE_QWEN_CODE_DISABLED_ADVISORY = "Qwen Code PreToolUse hook is not installed.";

function getProjectDir(options: QwenCodeHookCommandOptions = {}): string {
  return options.projectDir || process.env.QWEN_PROJECT_DIR || process.cwd();
}

function getDefaultSettingsPath(options: QwenCodeHookCommandOptions = {}): string {
  return join(getProjectDir(options), ".qwen", "settings.json");
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
    && (entry.command.includes(TOKENJUICE_QWEN_CODE_SUBCOMMAND) || entry.command.includes(TOKENJUICE_QWEN_CODE_LEGACY_SUBCOMMAND));
}

function getHookGroups(config: QwenCodeSettings, event: "PreToolUse" | "PostToolUse"): unknown[] {
  const groups = config.hooks[event];
  return Array.isArray(groups) ? groups : [];
}

function findTokenjuiceQwenCodeHookCommand(config: QwenCodeSettings): string | undefined {
  for (const group of [...getHookGroups(config, "PreToolUse"), ...getHookGroups(config, "PostToolUse")]) {
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

function removeTokenjuiceQwenCodeHookEvent(config: QwenCodeSettings, event: "PreToolUse" | "PostToolUse"): number {
  let removed = 0;
  const retainedGroups: unknown[] = [];
  for (const group of getHookGroups(config, event)) {
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
  if (retainedGroups.length > 0) config.hooks[event] = retainedGroups;
  else delete config.hooks[event];
  return removed;
}

function removeTokenjuiceQwenCodeHooks(config: QwenCodeSettings): number {
  return removeTokenjuiceQwenCodeHookEvent(config, "PreToolUse") + removeTokenjuiceQwenCodeHookEvent(config, "PostToolUse");
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
        description: "Wrap shell commands through tokenjuice before Qwen Code executes them.",
      },
    ],
  };
}

export async function installQwenCodeHook(
  settingsPath?: string,
  options: QwenCodeHookCommandOptions = {},
): Promise<InstallQwenCodeHookResult> {
  if (process.platform === "win32") {
    throw new Error("Qwen Code pre-tool wrapping requires a POSIX shell; run Qwen Code and tokenjuice in WSL.");
  }
  const resolvedSettingsPath = settingsPath ?? getDefaultSettingsPath(options);
  const { config, backupPath } = await loadQwenCodeSettingsWithBackup(resolvedSettingsPath);
  const command = await buildWrapLauncherHookCommand({ ...options, subcommand: TOKENJUICE_QWEN_CODE_SUBCOMMAND, hostName: "qwen-code" });
  removeTokenjuiceQwenCodeHooks(config);
  config.hooks.PreToolUse = [...getHookGroups(config, "PreToolUse"), createQwenCodeHook(command)];
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
  const expectedCommand = await buildWrapLauncherHookCommand({ ...options, subcommand: TOKENJUICE_QWEN_CODE_SUBCOMMAND, hostName: "qwen-code" });
  const { config, exists } = await readQwenCodeSettings(resolvedSettingsPath);
  const detectedCommand = findTokenjuiceQwenCodeHookCommand(config);
  const fields = await buildHookCommandDoctorFields({
    expectedCommand,
    detectedCommand: exists ? detectedCommand : undefined,
    disabledIssue: "tokenjuice PreToolUse hook is not installed for Qwen Code",
    hostLabel: "Qwen Code",
    advisory: detectedCommand?.includes(TOKENJUICE_QWEN_CODE_LEGACY_SUBCOMMAND)
      ? "Legacy Qwen Code PostToolUse hook cannot replace terminal output; reinstall to enable pre-tool wrapping."
      : detectedCommand ? TOKENJUICE_QWEN_CODE_ADVISORY : TOKENJUICE_QWEN_CODE_DISABLED_ADVISORY,
    fixCommand: TOKENJUICE_QWEN_CODE_FIX_COMMAND,
  });

  if (process.platform === "win32") {
    fields.status = detectedCommand ? "broken" : "disabled";
    fields.issues.push("Qwen Code pre-tool wrapping requires a POSIX shell; run Qwen Code and tokenjuice in WSL.");
    fields.fixCommand = "run Qwen Code in WSL, then run tokenjuice install qwen-code";
  }

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

/** Rewrite shell input through the shared wrapper; Qwen Code retains permission policy. */
export async function runQwenCodePreToolUseHook(rawText: string, wrapLauncher = "tokenjuice"): Promise<number> {
  try {
    const payload: unknown = JSON.parse(rawText);
    if (!isRecord(payload) || payload.hook_event_name !== "PreToolUse"
      || !["Bash", "Shell", "run_shell_command"].includes(String(payload.tool_name)) || !isRecord(payload.tool_input)) {
      writeEmptyHookJsonLine();
      return 0;
    }
    const toolInput = payload.tool_input;
    const command = toolInput.command;
    if (typeof command !== "string" || !command.trim() || commandAlreadyWrapped(command)
      || process.platform === "win32") {
      writeEmptyHookJsonLine();
      return 0;
    }
    const shellPath = await resolveHostShell([
      process.env.TOKENJUICE_QWEN_CODE_SHELL, process.env.SHELL, "bash", "sh",
    ]);
    if (!shellPath) {
      writeEmptyHookJsonLine();
      return 0;
    }
    writeHookJsonLine({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput: {
          ...toolInput,
          command: buildWrappedCommand({ wrapLauncher, shellPath, command, source: "qwen-code" }),
        },
      },
    });
  } catch {
    writeEmptyHookJsonLine();
  }
  return 0;
}
