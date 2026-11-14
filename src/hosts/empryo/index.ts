import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { inspectTokenjuiceHookCommand, type HookCommandDoctorReport } from "../shared/hook-command-doctor.js";
import { parseTokenjuiceHookCommand } from "../shared/host-command.js";
import { findHookCommand, pruneHookGroups, type HooksSettings } from "../shared/hooks-json-file.js";
import { readSettingsFile, writeSettingsFile } from "../shared/settings-file.js";
import {
  buildWrapLauncherHookCommand,
  buildWrappedCommand,
  commandAlreadyWrapped,
  isRecord,
  resolveHostShell,
} from "../shared/pre-tool-wrap.js";

export type EmpryoHookOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
  projectDir?: string;
};

export type InstallEmpryoHookResult = { settingsPath: string; command: string; backupPath?: string };
export type UninstallEmpryoHookResult = { settingsPath: string; removed: boolean; backupPath?: string };
export type EmpryoDoctorReport = HookCommandDoctorReport<"settingsPath">;

const SUBCOMMAND = "empryo-pre-tool-use";
const ADVISORY = "Empryo / SoulForge PreToolUse wrapping; inherited Claude hooks still run. See the integration guide for native output limits.";
const WINDOWS_ISSUE = "Empryo wrapping requires a POSIX shell; use WSL or explicit wrapping on native Windows.";

function projectDir(options: EmpryoHookOptions): string {
  return resolve(options.projectDir ?? process.cwd());
}

function defaultSettingsPath(options: EmpryoHookOptions): string {
  return join(projectDir(options), ".soulforge", "config.json");
}

function parseSettings(data: Buffer | undefined): HooksSettings {
  if (!data) return { hooks: {} };
  const raw: unknown = JSON.parse(data.toString("utf8"));
  if (!isRecord(raw) || (raw.hooks !== undefined && !isRecord(raw.hooks))) {
    throw new Error("Empryo settings and hooks must be JSON objects");
  }
  const hooks = isRecord(raw.hooks) ? { ...raw.hooks } : {};
  if (hooks.PreToolUse !== undefined && !Array.isArray(hooks.PreToolUse)) {
    throw new Error("Empryo PreToolUse hooks must be an array");
  }
  return { ...raw, hooks };
}

function ownedHook(hook: unknown): boolean {
  return isRecord(hook) && typeof hook.command === "string"
    && parseTokenjuiceHookCommand(hook.command).subcommand === SUBCOMMAND;
}

function groups(config: HooksSettings): unknown[] {
  return Array.isArray(config.hooks.PreToolUse) ? config.hooks.PreToolUse : [];
}

function hookCommand(options: EmpryoHookOptions): Promise<string> {
  return buildWrapLauncherHookCommand({ ...options, subcommand: SUBCOMMAND, hostName: "empryo" });
}

export async function installEmpryoHook(
  settingsPath?: string,
  options: EmpryoHookOptions = {},
): Promise<InstallEmpryoHookResult> {
  if (process.platform === "win32") throw new Error(WINDOWS_ISSUE);
  const path = settingsPath ?? defaultSettingsPath(options);
  const settings = await readSettingsFile(path);
  const config = parseSettings(settings.data);
  const command = await hookCommand(options);
  config.hooks.PreToolUse = [...pruneHookGroups(groups(config), ownedHook), {
    matcher: "Bash",
    hooks: [{ type: "command", command, timeout: 10 }],
  }];
  const backupPath = await writeSettingsFile(settings, `${JSON.stringify(config, null, 2)}\n`, "preserve");
  return { settingsPath: path, command, ...(backupPath ? { backupPath } : {}) };
}

export async function uninstallEmpryoHook(
  settingsPath?: string,
  options: EmpryoHookOptions = {},
): Promise<UninstallEmpryoHookResult> {
  const path = settingsPath ?? defaultSettingsPath(options);
  const settings = await readSettingsFile(path);
  const config = parseSettings(settings.data);
  const before = groups(config);
  const after = pruneHookGroups(before, ownedHook);
  const removed = after.length !== before.length || after.some((group, index) => group !== before[index]);
  if (!removed) return { settingsPath: path, removed: false };
  if (after.length) config.hooks.PreToolUse = after;
  else delete config.hooks.PreToolUse;
  const backupPath = await writeSettingsFile(settings, `${JSON.stringify(config, null, 2)}\n`, "preserve");
  return { settingsPath: path, removed, ...(backupPath ? { backupPath } : {}) };
}

async function hooksDisabled(options: EmpryoHookOptions, settingsPath: string): Promise<boolean> {
  const root = projectDir(options);
  const paths = new Set([
    join(homedir(), ".claude", "settings.json"),
    join(root, ".claude", "settings.json"),
    join(root, ".claude", "settings.local.json"),
    join(homedir(), ".soulforge", "config.json"),
    join(root, ".soulforge", "config.json"),
    settingsPath,
  ]);
  for (const path of paths) {
    // SoulForge ignores invalid inherited files. The managed file is validated separately.
    try {
      const file = await readSettingsFile(path);
      const value: unknown = file.data && JSON.parse(file.data.toString("utf8"));
      if (isRecord(value) && value.disableAllHooks === true) return true;
    } catch { /* Ignore the same unreadable inherited sources as the host. */ }
  }
  return false;
}

export async function doctorEmpryoHook(
  settingsPath?: string,
  options: EmpryoHookOptions = {},
): Promise<EmpryoDoctorReport> {
  const path = settingsPath ?? defaultSettingsPath(options);
  const settings = await readSettingsFile(path);
  const config = parseSettings(settings.data);
  const expectedCommand = await hookCommand(options);
  const detectedCommand = findHookCommand(groups(config), ownedHook);
  const fixCommand = `tokenjuice install empryo${options.local ? " --local" : ""}`;
  const base = { settingsPath: path, expectedCommand, fixCommand, advisories: [ADVISORY] };
  if (!detectedCommand) return { ...base, status: "disabled", issues: [], checkedPaths: [], missingPaths: [] };
  const inspection = await inspectTokenjuiceHookCommand({ command: detectedCommand });
  const missingPaths = [...new Set([...inspection.missingPaths, ...inspection.nonExecutablePaths])];
  const issues: string[] = [];
  if (process.platform === "win32") issues.push(WINDOWS_ISSUE);
  if (await hooksDisabled(options, path)) issues.push("Empryo hooks are disabled by disableAllHooks in a loaded config");
  if (missingPaths.length) issues.push("configured Empryo hook points at a missing or non-executable path");
  const broken = issues.length > 0;
  if (detectedCommand !== expectedCommand) issues.push("configured Empryo hook command differs from the current command");
  return {
    ...base, detectedCommand, issues, checkedPaths: inspection.checkedPaths, missingPaths,
    status: broken ? "broken" : issues.length ? "warn" : "ok",
  };
}

export async function runEmpryoPreToolUseHook(rawText: string, wrapLauncher = "tokenjuice"): Promise<number> {
  let payload: unknown;
  try { payload = JSON.parse(rawText); } catch { return 0; }
  if (!isRecord(payload) || payload.hook_event_name !== "PreToolUse" || payload.tool_name !== "Bash"
    || !isRecord(payload.tool_input) || process.platform === "win32") return 0;
  const input = payload.tool_input;
  if (typeof input.command !== "string" || !input.command.trim() || commandAlreadyWrapped(input.command)) return 0;
  // SoulForge's POSIX shell is sh -c; do not substitute the user's login shell.
  const shellPath = await resolveHostShell(["sh"]);
  if (!shellPath) return 0;
  const command = buildWrappedCommand({ wrapLauncher, shellPath, command: input.command, source: "empryo", loginShell: false });
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: {
    hookEventName: "PreToolUse", updatedInput: { ...input, command },
  } })}\n`);
  return 0;
}
