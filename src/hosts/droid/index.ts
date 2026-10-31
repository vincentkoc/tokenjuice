import { lstat, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";

import { type TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import { type HookCommandDoctorReport, buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { writeEmptyHookJsonLine, writeHookJsonLine } from "../shared/hook-output.js";
import { type HooksSettings as FactorySettings, isRecord, sanitizeHooksSettings as sanitizeFactorySettings } from "../shared/hooks-json-file.js";
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

/** @deprecated Reinstall to migrate additive hooks to pre-tool wrapping. */
export async function runDroidPostToolUseHook(_rawText: string): Promise<number> {
  writeEmptyHookJsonLine();
  return 0;
}

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
