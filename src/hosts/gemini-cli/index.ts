import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { readStringField } from "../../core/record-fields.js";
import { readPositiveIntegerEnv } from "../../core/env.js";
import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import type { TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import { type HookCommandDoctorReport, buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { buildCompactedOutputContext, writeEmptyHookJsonLine, writeHookJsonLine } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";
import { buildWrapLauncherHookCommand, buildWrappedCommand, commandAlreadyWrapped, resolveHostShell } from "../shared/pre-tool-wrap.js";

export type GeminiCliHookCommandOptions = TokenjuiceHookCommandOptions;

export type InstallGeminiCliHookResult = {
  settingsPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallGeminiCliHookResult = {
  settingsPath: string;
  removed: number;
};

export type GeminiCliDoctorReport = HookCommandDoctorReport<"settingsPath">;

type GeminiSettings = Record<string, unknown> & {
  hooks: Record<string, unknown>;
};

type GeminiCliAfterToolPayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
  tool_response?: unknown;
  cwd?: unknown;
};

const TOKENJUICE_GEMINI_CLI_SUBCOMMAND = "gemini-cli-before-tool";
const TOKENJUICE_GEMINI_CLI_LEGACY_SUBCOMMAND = "gemini-cli-after-tool";
const TOKENJUICE_GEMINI_CLI_FIX_COMMAND = "tokenjuice install gemini-cli";
const TOKENJUICE_GEMINI_CLI_DISABLED_ADVISORY = "Gemini CLI BeforeTool hook is not installed.";
const TOKENJUICE_GEMINI_CLI_ADVISORY = "Gemini CLI pre-tool wrapping is beta; shell commands run through tokenjuice before execution.";

function getGeminiCliHome(): string {
  return process.env.GEMINI_CLI_HOME
    ? join(process.env.GEMINI_CLI_HOME, ".gemini")
    : process.env.GEMINI_HOME || join(homedir(), ".gemini");
}

function getDefaultSettingsPath(): string {
  return join(getGeminiCliHome(), "settings.json");
}

function sanitizeGeminiSettings(raw: unknown): GeminiSettings {
  if (!isRecord(raw)) {
    return { hooks: {} };
  }
  return {
    ...raw,
    hooks: isRecord(raw.hooks) ? { ...raw.hooks } : {},
  };
}

async function readGeminiSettings(settingsPath: string): Promise<{ config: GeminiSettings; exists: boolean }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    return { config: sanitizeGeminiSettings(JSON.parse(rawText) as unknown), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} }, exists: false };
    }
    throw error;
  }
}

async function loadGeminiSettingsWithBackup(settingsPath: string): Promise<{ config: GeminiSettings; backupPath?: string }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const backupPath = `${settingsPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config: sanitizeGeminiSettings(JSON.parse(rawText) as unknown), backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} } };
    }
    throw error;
  }
}

async function writeGeminiSettings(settingsPath: string, config: GeminiSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(tempPath, settingsPath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

function isTokenjuiceGeminiHook(entry: unknown): boolean {
  return isRecord(entry)
    && entry.type === "command"
    && entry.name === "tokenjuice"
    && typeof entry.command === "string"
    && (entry.command.includes(TOKENJUICE_GEMINI_CLI_SUBCOMMAND) || entry.command.includes(TOKENJUICE_GEMINI_CLI_LEGACY_SUBCOMMAND));
}

function getHookGroups(config: GeminiSettings, event: "BeforeTool" | "AfterTool"): unknown[] {
  const groups = config.hooks[event];
  return Array.isArray(groups) ? groups : [];
}

function findTokenjuiceGeminiHookCommand(config: GeminiSettings): string | undefined {
  for (const group of [...getHookGroups(config, "BeforeTool"), ...getHookGroups(config, "AfterTool")]) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }
    for (const hook of group.hooks) {
      if (isTokenjuiceGeminiHook(hook)) {
        return (hook as { command: string }).command;
      }
    }
  }
  return undefined;
}

function removeTokenjuiceGeminiHookEvent(config: GeminiSettings, event: "BeforeTool" | "AfterTool"): number {
  let removed = 0;
  const retainedGroups: unknown[] = [];
  for (const group of getHookGroups(config, event)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      retainedGroups.push(group);
      continue;
    }
    const retainedHooks = group.hooks.filter((hook) => {
      const remove = isTokenjuiceGeminiHook(hook);
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

function removeTokenjuiceGeminiHooks(config: GeminiSettings): number {
  return removeTokenjuiceGeminiHookEvent(config, "BeforeTool") + removeTokenjuiceGeminiHookEvent(config, "AfterTool");
}

function createGeminiCliHook(command: string): Record<string, unknown> {
  return {
    matcher: "run_shell_command",
    sequential: true,
    hooks: [
      {
        type: "command",
        name: "tokenjuice",
        command,
        timeout: 60000,
        description: "Wrap shell commands through tokenjuice before Gemini CLI executes them.",
      },
    ],
  };
}

export async function installGeminiCliHook(
  settingsPath = getDefaultSettingsPath(),
  options: GeminiCliHookCommandOptions = {},
): Promise<InstallGeminiCliHookResult> {
  if (process.platform === "win32") {
    throw new Error("Gemini CLI pre-tool wrapping requires a POSIX shell; run Gemini CLI and tokenjuice in WSL.");
  }
  const { config, backupPath } = await loadGeminiSettingsWithBackup(settingsPath);
  const command = await buildWrapLauncherHookCommand({ ...options, subcommand: TOKENJUICE_GEMINI_CLI_SUBCOMMAND, hostName: "gemini-cli" });
  removeTokenjuiceGeminiHooks(config);
  config.hooks.BeforeTool = [...getHookGroups(config, "BeforeTool"), createGeminiCliHook(command)];
  await writeGeminiSettings(settingsPath, config);
  return {
    settingsPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallGeminiCliHook(settingsPath = getDefaultSettingsPath()): Promise<UninstallGeminiCliHookResult> {
  const { config } = await readGeminiSettings(settingsPath);
  const removed = removeTokenjuiceGeminiHooks(config);
  if (removed > 0) {
    await writeGeminiSettings(settingsPath, config);
  }
  return { settingsPath, removed };
}

export async function doctorGeminiCliHook(
  settingsPath = getDefaultSettingsPath(),
  options: GeminiCliHookCommandOptions = {},
): Promise<GeminiCliDoctorReport> {
  const expectedCommand = await buildWrapLauncherHookCommand({ ...options, subcommand: TOKENJUICE_GEMINI_CLI_SUBCOMMAND, hostName: "gemini-cli" });
  const { config, exists } = await readGeminiSettings(settingsPath);
  const detectedCommand = findTokenjuiceGeminiHookCommand(config);

  const fields = await buildHookCommandDoctorFields({
    expectedCommand,
    detectedCommand: exists ? detectedCommand : undefined,
    disabledIssue: "tokenjuice BeforeTool hook is not installed for Gemini CLI",
    hostLabel: "Gemini CLI",
    advisory: detectedCommand?.includes(TOKENJUICE_GEMINI_CLI_LEGACY_SUBCOMMAND)
      ? "Legacy Gemini CLI AfterTool hook marks compacted results as errors; reinstall to enable pre-tool wrapping."
      : detectedCommand ? TOKENJUICE_GEMINI_CLI_ADVISORY : TOKENJUICE_GEMINI_CLI_DISABLED_ADVISORY,
    fixCommand: TOKENJUICE_GEMINI_CLI_FIX_COMMAND,
  });
  if (process.platform === "win32") {
    fields.status = detectedCommand ? "broken" : "disabled";
    fields.issues.push("Gemini CLI pre-tool wrapping requires a POSIX shell; run Gemini CLI and tokenjuice in WSL.");
    fields.fixCommand = "run Gemini CLI in WSL, then run tokenjuice install gemini-cli";
  }
  if (detectedCommand && isRecord(config.hooksConfig)
    && (config.hooksConfig.enabled === false || (Array.isArray(config.hooksConfig.disabled) && config.hooksConfig.disabled.includes("tokenjuice")))) {
    fields.status = "broken";
    fields.issues.push("Gemini CLI hooksConfig disables the configured tokenjuice hook");
  }
  return { settingsPath, ...fields };
}

function readGeminiOutputText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }
  if (!isRecord(response)) {
    return "";
  }
  const direct = readStringField(response, ["llmContent", "returnDisplay", "text", "content", "output"]);
  if (direct) {
    return direct;
  }
  return "";
}

export async function runGeminiCliAfterToolHook(rawText: string): Promise<number> {
  let payload: GeminiCliAfterToolPayload;
  try {
    payload = JSON.parse(rawText) as GeminiCliAfterToolPayload;
  } catch {
    writeEmptyHookJsonLine();
    return 0;
  }

  if (payload.hook_event_name !== "AfterTool" || payload.tool_name !== "run_shell_command") {
    writeEmptyHookJsonLine();
    return 0;
  }

  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : undefined;
  const command = toolInput ? readStringField(toolInput, ["command", "cmd"]) : undefined;
  const visibleText = readGeminiOutputText(payload.tool_response);
  if (!command || !visibleText.trim()) {
    writeEmptyHookJsonLine();
    return 0;
  }

  try {
    const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_GEMINI_CLI_MAX_INLINE_CHARS");
    const outcome = await compactBashResult({
      source: "gemini-cli",
      command,
      visibleText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      inspectionPolicy: "allow-safe-inventory",
      metadata: { source: "gemini-cli-after-tool" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.action === "keep") {
      writeEmptyHookJsonLine();
      return 0;
    }

    writeHookJsonLine({
      decision: "deny",
      reason: buildCompactedOutputContext(outcome.result.inlineText),
      suppressOutput: true,
    });
    return 0;
  } catch {
    writeEmptyHookJsonLine();
    return 0;
  }
}

/** Rewrite shell input through the shared wrapper; Gemini CLI retains permission policy. */
export async function runGeminiCliBeforeToolHook(rawText: string, wrapLauncher = "tokenjuice"): Promise<number> {
  try {
    const payload: unknown = JSON.parse(rawText);
    if (!isRecord(payload) || payload.hook_event_name !== "BeforeTool"
      || payload.tool_name !== "run_shell_command" || !isRecord(payload.tool_input)) {
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
      process.env.TOKENJUICE_GEMINI_CLI_SHELL, "bash",
    ]);
    if (!shellPath) {
      writeEmptyHookJsonLine();
      return 0;
    }
    writeHookJsonLine({
      hookSpecificOutput: {
        hookEventName: "BeforeTool",
        tool_input: {
          ...toolInput,
          command: buildWrappedCommand({ wrapLauncher, shellPath, command, source: "gemini-cli" }),
        },
      },
    });
  } catch {
    writeEmptyHookJsonLine();
  }
  return 0;
}
