import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";

import { readPositiveIntegerEnv } from "../../core/env.js";
import { shouldRecordStats } from "../../core/artifacts.js";
import { stripLeadingCdPrefix } from "../../core/command.js";
import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import { type TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import { type HookCommandDoctorReport, buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { isTokenjuiceExecutablePath, parseShellWords } from "../shared/hook-command.js";
import { buildCompactedOutputContext, writeEmptyHookJsonLine, writeHookJsonLine } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";
import { buildWrapLauncherHookCommand, buildWrappedCommand, commandAlreadyWrapped, resolveHostShell } from "../shared/pre-tool-wrap.js";
import { readSettingsFile, writeSettingsFile } from "../shared/settings-file.js";

export type DroidHookCommandOptions = TokenjuiceHookCommandOptions;

export type InstallDroidHookResult = {
  settingsPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallDroidHookResult = {
  settingsPath: string;
  removed: number;
};

export type DroidDoctorReport = HookCommandDoctorReport<"settingsPath">;

type FactorySettings = Record<string, unknown> & {
  hooks: Record<string, unknown>;
};

type DroidPostToolUsePayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: {
    command?: unknown;
  };
  tool_response?: unknown;
  cwd?: unknown;
};

const TOKENJUICE_DROID_SUBCOMMAND = "droid-pre-tool-use";
const TOKENJUICE_DROID_LEGACY_SUBCOMMAND = "droid-post-tool-use";
const TOKENJUICE_DROID_FIX_COMMAND = "tokenjuice install droid";
const TOKENJUICE_DROID_ADVISORY = "Droid PreToolUse hook wraps Execute commands through tokenjuice before execution.";
const TOKENJUICE_DROID_DISABLED_ADVISORY = "Droid PreToolUse hook is not installed.";

function getFactoryHome(): string {
  return process.env.FACTORY_HOME || join(homedir(), ".factory");
}

async function getDefaultSettingsPath(): Promise<string> {
  const home = getFactoryHome();
  for (const path of [join(home, "hooks.json"), join(home, "hooks", "hooks.json")]) {
    try {
      // A dangling link is still configured; let the settings reader report it.
      await lstat(path);
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  return join(home, "settings.json");
}

function parseFactorySettings(text: string | undefined, settingsPath: string): FactorySettings {
  const raw = text === undefined ? undefined : JSON.parse(text) as unknown;
  return sanitizeFactorySettings(basename(settingsPath) === "hooks.json" ? { hooks: raw } : raw);
}

function serializeFactorySettings(config: FactorySettings, settingsPath: string): string {
  return `${JSON.stringify(basename(settingsPath) === "hooks.json" ? config.hooks : config, null, 2)}\n`;
}

function sanitizeFactorySettings(raw: unknown): FactorySettings {
  if (!isRecord(raw)) {
    return { hooks: {} };
  }
  return {
    ...raw,
    hooks: isRecord(raw.hooks) ? { ...raw.hooks } : {},
  };
}

async function readFactorySettings(settingsPath: string): Promise<{ config: FactorySettings; exists: boolean }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    return { config: parseFactorySettings(rawText, settingsPath), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} }, exists: false };
    }
    throw error;
  }
}

function isTokenjuiceDroidHook(entry: unknown): boolean {
  return isRecord(entry)
    && typeof entry.command === "string"
    && (entry.command.includes(TOKENJUICE_DROID_SUBCOMMAND) || entry.command.includes(TOKENJUICE_DROID_LEGACY_SUBCOMMAND));
}

function getHookGroups(config: FactorySettings, event: "PreToolUse" | "PostToolUse"): unknown[] {
  const groups = config.hooks[event];
  return Array.isArray(groups) ? groups : [];
}

function findTokenjuiceDroidHookCommand(config: FactorySettings): string | undefined {
  for (const group of [...getHookGroups(config, "PreToolUse"), ...getHookGroups(config, "PostToolUse")]) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }
    for (const hook of group.hooks) {
      if (isTokenjuiceDroidHook(hook)) {
        return (hook as { command: string }).command;
      }
    }
  }
  return undefined;
}

function removeTokenjuiceDroidHookEvent(config: FactorySettings, event: "PreToolUse" | "PostToolUse"): number {
  let removed = 0;
  const retainedGroups: unknown[] = [];
  for (const group of getHookGroups(config, event)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      retainedGroups.push(group);
      continue;
    }
    const retainedHooks = group.hooks.filter((hook) => {
      const shouldRemove = isTokenjuiceDroidHook(hook);
      if (shouldRemove) {
        removed += 1;
      }
      return !shouldRemove;
    });
    if (retainedHooks.length > 0) {
      retainedGroups.push({ ...group, hooks: retainedHooks });
    }
  }
  if (retainedGroups.length > 0) {
    config.hooks[event] = retainedGroups;
  } else {
    delete config.hooks[event];
  }
  return removed;
}

function removeTokenjuiceDroidHooks(config: FactorySettings): number {
  return removeTokenjuiceDroidHookEvent(config, "PreToolUse") + removeTokenjuiceDroidHookEvent(config, "PostToolUse");
}

function createDroidPreToolUseHook(command: string): Record<string, unknown> {
  return {
    matcher: "Execute",
    hooks: [
      {
        type: "command",
        command,
        timeout: 60,
      },
    ],
  };
}

export async function installDroidHook(
  settingsPath?: string,
  options: DroidHookCommandOptions = {},
): Promise<InstallDroidHookResult> {
  if (process.platform === "win32") {
    throw new Error("Droid pre-tool wrapping requires a POSIX shell; run Droid and tokenjuice in WSL.");
  }
  settingsPath ??= await getDefaultSettingsPath();
  const settings = await readSettingsFile(settingsPath);
  const config = parseFactorySettings(settings.data?.toString("utf8"), settingsPath);
  const command = await buildWrapLauncherHookCommand({ ...options, subcommand: TOKENJUICE_DROID_SUBCOMMAND, hostName: "droid" });
  removeTokenjuiceDroidHooks(config);
  config.hooks.PreToolUse = [...getHookGroups(config, "PreToolUse"), createDroidPreToolUseHook(command)];
  const backupPath = await writeSettingsFile(settings, serializeFactorySettings(config, settingsPath), "replace");
  return {
    settingsPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallDroidHook(
  settingsPath?: string,
): Promise<UninstallDroidHookResult> {
  settingsPath ??= await getDefaultSettingsPath();
  const settings = await readSettingsFile(settingsPath);
  if (!settings.data) {
    return { settingsPath, removed: 0 };
  }
  const config = parseFactorySettings(settings.data.toString("utf8"), settingsPath);
  const removed = removeTokenjuiceDroidHooks(config);
  if (removed > 0) {
    await writeSettingsFile(settings, serializeFactorySettings(config, settingsPath));
  }
  return { settingsPath, removed };
}

export async function doctorDroidHook(
  settingsPath?: string,
  options: DroidHookCommandOptions = {},
): Promise<DroidDoctorReport> {
  settingsPath ??= await getDefaultSettingsPath();
  const expectedCommand = await buildWrapLauncherHookCommand({ ...options, subcommand: TOKENJUICE_DROID_SUBCOMMAND, hostName: "droid" });
  const { config, exists } = await readFactorySettings(settingsPath);
  const detectedCommand = exists ? findTokenjuiceDroidHookCommand(config) : undefined;

  const fields = await buildHookCommandDoctorFields({
    expectedCommand,
    detectedCommand,
    disabledIssue: "tokenjuice PreToolUse hook is not installed for Droid",
    hostLabel: "Droid",
    advisory: detectedCommand?.includes(TOKENJUICE_DROID_LEGACY_SUBCOMMAND)
      ? "Legacy Droid PostToolUse hook adds context without replacing the original output; reinstall to enable pre-tool wrapping."
      : detectedCommand ? TOKENJUICE_DROID_ADVISORY : TOKENJUICE_DROID_DISABLED_ADVISORY,
    fixCommand: TOKENJUICE_DROID_FIX_COMMAND,
  });
  if (process.platform === "win32") {
    fields.status = detectedCommand ? "broken" : "disabled";
    fields.issues.push("Droid pre-tool wrapping requires a POSIX shell; run Droid and tokenjuice in WSL.");
    fields.fixCommand = "run Droid in WSL, then run tokenjuice install droid";
  }
  return { settingsPath, ...fields };
}

function commandRequestsTokenjuiceRawBypass(command: string): boolean {
  let argv: string[];
  try {
    argv = parseShellWords(stripLeadingCdPrefix(command));
  } catch {
    return false;
  }
  if (argv.length < 3) {
    return false;
  }

  const first = argv[0];
  const wrapIndex = typeof first === "string" && isTokenjuiceExecutablePath(first) ? 1 : -1;

  if (wrapIndex === -1 || argv[wrapIndex] !== "wrap") {
    return false;
  }

  const optionEndIndex = argv.indexOf("--", wrapIndex + 1);
  if (optionEndIndex === -1) {
    return false;
  }

  const optionArgs = argv.slice(wrapIndex + 1, optionEndIndex);
  return optionArgs.includes("--raw") || optionArgs.includes("--full");
}

function shouldStoreFromEnv(): boolean {
  const value = process.env.TOKENJUICE_DROID_STORE;
  return value === "1" || value === "true" || value === "TRUE" || value === "yes" || value === "YES";
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

async function writeHookDebug(record: Record<string, unknown>): Promise<void> {
  if (!shouldRecordStats()) {
    return;
  }
  try {
    const debugPath = join(getFactoryHome(), "tokenjuice-hook.last.json");
    await mkdir(dirname(debugPath), { recursive: true });
    await writeFile(debugPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  } catch {
    // Optional diagnostics must not fail a hook or duplicate an already-written response.
  }
}

export async function runDroidPostToolUseHook(rawText: string): Promise<number> {
  let payload: DroidPostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as DroidPostToolUsePayload;
  } catch {
    writeEmptyHookJsonLine();
    return 0;
  }

  const command = typeof payload.tool_input?.command === "string" ? payload.tool_input.command : undefined;
  const debug: Record<string, unknown> = {
    hookEvent: payload.hook_event_name,
    toolName: payload.tool_name,
    command,
    rewrote: false,
  };

  if (payload.hook_event_name !== "PostToolUse") {
    await writeHookDebug({ ...debug, skipped: "non-post-tool-use" });
    writeEmptyHookJsonLine();
    return 0;
  }
  if (payload.tool_name !== "Execute") {
    await writeHookDebug({ ...debug, skipped: "non-execute" });
    writeEmptyHookJsonLine();
    return 0;
  }
  if (typeof command !== "string" || !command.trim()) {
    await writeHookDebug({ ...debug, skipped: "missing-command" });
    writeEmptyHookJsonLine();
    return 0;
  }

  const visibleText = stringifyToolResponse(payload.tool_response);
  if (!visibleText.trim()) {
    await writeHookDebug({ ...debug, skipped: "empty-tool-response" });
    writeEmptyHookJsonLine();
    return 0;
  }

  const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_DROID_MAX_INLINE_CHARS");

  if (commandRequestsTokenjuiceRawBypass(command)) {
    await writeHookDebug({ ...debug, skipped: "explicit-raw-bypass" });
    writeEmptyHookJsonLine();
    return 0;
  }

  try {
    const outcome = await compactBashResult({
      source: "droid",
      command,
      visibleText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      inspectionPolicy: "allow-safe-inventory",
      storeRaw: shouldStoreFromEnv(),
      metadata: { source: "droid-post-tool-use" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.result) {
      debug.rawChars = outcome.result.stats.rawChars;
      debug.reducedChars = outcome.result.stats.reducedChars;
      debug.matchedReducer = outcome.result.classification.matchedReducer;
    }

    if (outcome.action === "keep") {
      await writeHookDebug({ ...debug, skipped: outcome.reason });
      writeEmptyHookJsonLine();
      return 0;
    }

    writeHookJsonLine({
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: buildCompactedOutputContext(outcome.result.inlineText),
      },
    });
    await writeHookDebug({ ...debug, rewrote: true });
    return 0;
  } catch (error) {
    await writeHookDebug({
      ...debug,
      skipped: "hook-error",
      error: error instanceof Error ? error.message : String(error),
    });
    writeEmptyHookJsonLine();
    return 0;
  }
}

/** Rewrite only Execute commands; permission policy remains owned by Droid. */
export async function runDroidPreToolUseHook(rawText: string, wrapLauncher = "tokenjuice"): Promise<number> {
  try {
    const payload: unknown = JSON.parse(rawText);
    if (!isRecord(payload) || payload.hook_event_name !== "PreToolUse"
      || payload.tool_name !== "Execute" || !isRecord(payload.tool_input)) {
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
      process.env.TOKENJUICE_DROID_SHELL, process.env.SHELL, "bash", "sh",
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
          command: buildWrappedCommand({ wrapLauncher, shellPath, command, source: "droid" }),
        },
      },
    });
  } catch {
    writeEmptyHookJsonLine();
  }
  return 0;
}
