import { homedir } from "node:os";
import { join } from "node:path";

import { inspectTokenjuiceHookCommand, type HookCommandDoctorReport } from "../shared/hook-command-doctor.js";
import { pruneHookGroups } from "../shared/hooks-json-file.js";
import { buildDirectWrappedCommand, buildWrapLauncherHookCommand, commandAlreadyWrapped, isRecord } from "../shared/pre-tool-wrap.js";
import { readSettingsFile, writeSettingsFile } from "../shared/settings-file.js";

export type ZCodeHookCommandOptions = { local?: boolean; binaryPath?: string; nodePath?: string };
export type InstallZCodeHookResult = { settingsPath: string; backupPath?: string; command: string };
export type UninstallZCodeHookResult = { settingsPath: string; backupPath?: string; removed: boolean };
export type ZCodeDoctorReport = HookCommandDoctorReport<"settingsPath">;

const SUBCOMMAND = "zcode-pre-tool-use";
const FIX_COMMAND = "tokenjuice install zcode";

function defaultSettingsPath(): string {
  return join(homedir(), ".zcode", "cli", "config.json");
}

function settingsObject(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`invalid ZCode ${label}: expected an object`);
  return { ...value };
}

function parseSettings(data?: Buffer): {
  config: Record<string, unknown>;
  hooks: Record<string, unknown>;
  events: Record<string, unknown>;
} {
  const config = settingsObject(data ? JSON.parse(data.toString("utf8")) as unknown : undefined, "settings");
  const hooks = settingsObject(config.hooks, "hooks");
  const events = settingsObject(hooks.events, "hook events");
  if (events.PreToolUse !== undefined && !Array.isArray(events.PreToolUse)) {
    throw new Error("invalid ZCode PreToolUse hooks: expected an array");
  }
  return { config, hooks, events };
}

function ownsHook(hook: unknown): boolean {
  return isRecord(hook) && hook.type === "command" && typeof hook.command === "string"
    && hook.command.split(/\s+/u).includes(SUBCOMMAND);
}

function groups(events: Record<string, unknown>): unknown[] {
  return Array.isArray(events.PreToolUse) ? events.PreToolUse : [];
}

async function hookCommand(options: ZCodeHookCommandOptions): Promise<string> {
  return buildWrapLauncherHookCommand({ ...options, subcommand: SUBCOMMAND, hostName: "zcode" });
}

export async function installZCodeHook(
  settingsPath = defaultSettingsPath(), options: ZCodeHookCommandOptions = {},
): Promise<InstallZCodeHookResult> {
  if (process.platform === "win32") throw new Error("run ZCode and tokenjuice in WSL to install the ZCode hook");
  const settings = await readSettingsFile(settingsPath);
  const { config, hooks, events } = parseSettings(settings.data);
  const command = await hookCommand(options);
  events.PreToolUse = [...pruneHookGroups(groups(events), ownsHook), {
    matcher: "Bash",
    hooks: [{ type: "command", command, timeoutMs: 10000 }],
  }];
  // An explicit global disable also covers unrelated hooks. Preserve that choice.
  config.hooks = { ...hooks, enabled: hooks.enabled ?? true, events };
  const backupPath = await writeSettingsFile(settings, `${JSON.stringify(config, null, 2)}\n`, "replace");
  return { settingsPath, ...(backupPath ? { backupPath } : {}), command };
}

export async function uninstallZCodeHook(settingsPath = defaultSettingsPath()): Promise<UninstallZCodeHookResult> {
  const settings = await readSettingsFile(settingsPath);
  if (!settings.data) return { settingsPath, removed: false };
  const { config, hooks, events } = parseSettings(settings.data);
  const current = groups(events);
  const retained = pruneHookGroups(current, ownsHook);
  const removed = retained.length !== current.length || retained.some((group, index) => group !== current[index]);
  if (!removed) return { settingsPath, removed: false };
  if (retained.length) events.PreToolUse = retained;
  else delete events.PreToolUse;
  config.hooks = { ...hooks, events };
  const backupPath = await writeSettingsFile(settings, `${JSON.stringify(config, null, 2)}\n`, "preserve");
  return { settingsPath, ...(backupPath ? { backupPath } : {}), removed };
}

export async function doctorZCodeHook(
  settingsPath = defaultSettingsPath(), options: ZCodeHookCommandOptions = {},
): Promise<ZCodeDoctorReport> {
  const expectedCommand = await hookCommand(options);
  const fixCommand = `${FIX_COMMAND}${options.local ? " --local" : ""}`;
  const settings = await readSettingsFile(settingsPath);
  const { hooks, events } = parseSettings(settings.data);
  const entries = groups(events).flatMap((group) => isRecord(group) && Array.isArray(group.hooks)
    ? group.hooks.filter(ownsHook).map((entry) => ({ group, entry: entry as Record<string, unknown> })) : []);
  const entry = entries[0];
  if (!entry) return { settingsPath, status: "disabled", issues: [], advisories: [], fixCommand, expectedCommand, checkedPaths: [], missingPaths: [] };
  const detectedCommand = entry.entry.command as string;
  const inspection = await inspectTokenjuiceHookCommand({ command: detectedCommand });
  const missingPaths = [...new Set([...inspection.missingPaths, ...inspection.nonExecutablePaths])];
  const issues: string[] = [];
  if (hooks.enabled !== true) issues.push("ZCode hooks are globally disabled; enable hooks in ZCode settings to activate the installed hook");
  if (entry.entry.enabled === false || entry.entry.async === true) issues.push("the ZCode hook is disabled or asynchronous and cannot rewrite tool input");
  if (entry.group.matcher !== "Bash" || entries.length !== 1) issues.push("ZCode hook matcher or entry count does not match the recommended configuration");
  if (detectedCommand !== expectedCommand) issues.push("configured ZCode hook command does not match the current recommended command");
  if (process.platform === "win32") issues.push("the ZCode wrapper requires a POSIX shell; run ZCode and tokenjuice in WSL");
  if (missingPaths.length) issues.push("configured ZCode hook points at missing or non-executable paths");
  return {
    settingsPath, status: missingPaths.length ? "broken" : issues.length ? "warn" : "ok", issues, advisories: [],
    fixCommand, expectedCommand, detectedCommand, checkedPaths: inspection.checkedPaths, missingPaths,
  };
}

export async function runZCodePreToolUseHook(rawText: string, wrapLauncher = "tokenjuice"): Promise<number> {
  let payload: unknown;
  try { payload = JSON.parse(rawText) as unknown; } catch { return 0; }
  if (!isRecord(payload) || payload.hook_event_name !== "PreToolUse" || payload.tool_name !== "Bash"
    || !isRecord(payload.tool_input) || process.platform === "win32") return 0;
  const input = payload.tool_input;
  if (typeof input.command !== "string" || !input.command.trim() || commandAlreadyWrapped(input.command)) return 0;
  // ZCode can select Bash or Zsh and carries cwd changes between tool calls.
  const command = buildDirectWrappedCommand({ wrapLauncher, command: input.command, source: "zcode" });
  if (!command) return 0;
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: {
    hookEventName: "PreToolUse", updatedInput: { ...input, command },
  } })}\n`);
  return 0;
}
