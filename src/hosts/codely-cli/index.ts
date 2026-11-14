import { homedir } from "node:os";
import { join } from "node:path";

import { findHookCommand, removeHookEntriesFromEvent, type HooksSettings } from "../shared/hooks-json-file.js";
import { buildHookCommandDoctorFields, type HookCommandDoctorReport } from "../shared/hook-command-doctor.js";
import { readSettingsFile, writeSettingsFile } from "../shared/settings-file.js";
import { writeEmptyHookJsonLine, writeHookJsonLine } from "../shared/hook-output.js";
import { buildWrapLauncherHookCommand, buildWrappedCommand, commandAlreadyWrapped, isRecord, resolveHostShell } from "../shared/pre-tool-wrap.js";
import type { TokenjuiceHookCommandOptions } from "../shared/host-command.js";

export type CodelyCliHookCommandOptions = TokenjuiceHookCommandOptions;
export type CodelyCliDoctorReport = HookCommandDoctorReport<"settingsPath">;
export type InstallCodelyCliHookResult = { settingsPath: string; backupPath?: string; command: string };
export type UninstallCodelyCliHookResult = { settingsPath: string; removed: number };

const SUBCOMMAND = "codely-cli-before-tool";
const HOOK_NAME = "tokenjuice-codely-cli";
const ADVISORY = "Codely CLI pre-tool wrapping is beta; native session and Cowork desktop acceptance remain unverified.";

function getDefaultSettingsPath(): string {
  return join(homedir(), ".codely-cli", "settings.json");
}

function parseSettings(data?: Buffer): HooksSettings {
  if (!data) return { hooks: {} };
  const parsed: unknown = JSON.parse(data.toString("utf8"));
  if (!isRecord(parsed) || (parsed.hooks !== undefined && !isRecord(parsed.hooks))) {
    throw new Error("Codely CLI settings and hooks must be JSON objects");
  }
  const hooks = isRecord(parsed.hooks) ? { ...parsed.hooks } : {};
  if (hooks.BeforeTool !== undefined && !Array.isArray(hooks.BeforeTool)) {
    throw new Error("Codely CLI hooks.BeforeTool must be an array");
  }
  return { ...parsed, hooks };
}

function isOwnedHook(hook: unknown): boolean {
  return isRecord(hook) && hook.type === "command" && hook.name === HOOK_NAME
    && typeof hook.command === "string" && hook.command.includes(SUBCOMMAND);
}

function hookGroups(config: HooksSettings): unknown[] {
  return Array.isArray(config.hooks.BeforeTool) ? config.hooks.BeforeTool : [];
}

function buildHookCommand(options: CodelyCliHookCommandOptions): Promise<string> {
  return buildWrapLauncherHookCommand({ ...options, subcommand: SUBCOMMAND, hostName: "codely-cli" });
}

export async function installCodelyCliHook(
  settingsPath = getDefaultSettingsPath(),
  options: CodelyCliHookCommandOptions = {},
): Promise<InstallCodelyCliHookResult> {
  if (process.platform === "win32") {
    throw new Error("Codely CLI pre-tool wrapping requires a POSIX shell; run Codely CLI and tokenjuice in WSL.");
  }
  const settings = await readSettingsFile(settingsPath);
  const config = parseSettings(settings.data);
  const command = await buildHookCommand(options);
  removeHookEntriesFromEvent(config, "BeforeTool", isOwnedHook);
  config.hooks.BeforeTool = [...hookGroups(config), {
    matcher: "^run_shell_command$",
    sequential: true,
    hooks: [{ type: "command", name: HOOK_NAME, command, timeout: 60000 }],
  }];
  // An explicit disable belongs to the user; doctor explains it after install.
  if (config.hooks.enabled === undefined) config.hooks.enabled = true;
  const backupPath = await writeSettingsFile(settings, `${JSON.stringify(config, null, 2)}\n`, "replace");
  return { settingsPath, command, ...(backupPath ? { backupPath } : {}) };
}

export async function uninstallCodelyCliHook(settingsPath = getDefaultSettingsPath()): Promise<UninstallCodelyCliHookResult> {
  const settings = await readSettingsFile(settingsPath);
  const config = parseSettings(settings.data);
  const removed = removeHookEntriesFromEvent(config, "BeforeTool", isOwnedHook);
  if (removed) await writeSettingsFile(settings, `${JSON.stringify(config, null, 2)}\n`, "replace");
  return { settingsPath, removed };
}

export async function doctorCodelyCliHook(
  settingsPath = getDefaultSettingsPath(),
  options: CodelyCliHookCommandOptions = {},
): Promise<CodelyCliDoctorReport> {
  const settings = await readSettingsFile(settingsPath);
  const config = parseSettings(settings.data);
  const expectedCommand = await buildHookCommand(options);
  const detectedCommand = findHookCommand(hookGroups(config), isOwnedHook);
  const fields = await buildHookCommandDoctorFields({
    expectedCommand,
    detectedCommand,
    disabledIssue: "tokenjuice BeforeTool hook is not installed for Codely CLI",
    hostLabel: "Codely CLI",
    advisory: detectedCommand ? ADVISORY : "Codely CLI BeforeTool hook is not installed.",
    fixCommand: `tokenjuice install codely-cli${options.local ? " --local" : ""}`,
  });
  if (detectedCommand && !hookGroups(config).some((group) => isRecord(group)
    && group.matcher === "^run_shell_command$" && group.sequential === true
    && Array.isArray(group.hooks) && group.hooks.some(isOwnedHook))) {
    fields.status = "broken";
    fields.issues.push("Codely CLI tokenjuice hook has an unexpected matcher or execution order; reinstall it");
  }
  if (detectedCommand && (config.hooks.enabled !== true || config.hooks.mode === "disabled"
    || (Array.isArray(config.hooks.disabled) && (config.hooks.disabled.includes(HOOK_NAME) || config.hooks.disabled.includes(detectedCommand))))) {
    fields.status = "broken";
    fields.issues.push("Codely CLI settings disable the configured tokenjuice hook; enable it in /hooks before use");
  }
  if (process.platform === "win32") {
    fields.status = detectedCommand ? "broken" : "disabled";
    fields.issues.push("Codely CLI pre-tool wrapping requires a POSIX shell; use WSL.");
    fields.fixCommand = "run Codely CLI in WSL, then run tokenjuice install codely-cli";
  }
  return { settingsPath, ...fields };
}

/** Codely rechecks its permission policy against this rewritten input. */
export async function runCodelyCliBeforeToolHook(rawText: string, wrapLauncher = "tokenjuice"): Promise<number> {
  try {
    const payload: unknown = JSON.parse(rawText);
    if (!isRecord(payload) || payload.hook_event_name !== "BeforeTool"
      || payload.tool_name !== "run_shell_command" || !isRecord(payload.tool_input)) {
      writeEmptyHookJsonLine();
      return 0;
    }
    const command = payload.tool_input.command;
    if (typeof command !== "string" || !command.trim() || commandAlreadyWrapped(command) || process.platform === "win32") {
      writeEmptyHookJsonLine();
      return 0;
    }
    const shellPath = await resolveHostShell([process.env.TOKENJUICE_CODELY_CLI_SHELL, "bash"]);
    if (!shellPath) {
      writeEmptyHookJsonLine();
      return 0;
    }
    writeHookJsonLine({
      hookSpecificOutput: {
        hookEventName: "BeforeTool",
        tool_input: {
          ...payload.tool_input,
          command: buildWrappedCommand({ wrapLauncher, shellPath, command, source: "codely-cli" }),
        },
      },
    });
  } catch {
    writeEmptyHookJsonLine();
  }
  return 0;
}
