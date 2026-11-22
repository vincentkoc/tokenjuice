import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { parseTokenjuiceHookCommand, type TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import type { HookCommandDoctorReport } from "../shared/hook-command-doctor.js";
import { writeEmptyHookJsonLine } from "../shared/hook-output.js";
import { type HooksSettings, isRecord, sanitizeHooksSettings } from "../shared/hooks-json-file.js";
import { readSettingsFile, writeSettingsFile } from "../shared/settings-file.js";

export type CommandCodeHookCommandOptions = TokenjuiceHookCommandOptions & { homeDir?: string; projectDir?: string };
export type InstallCommandCodeHookResult = { settingsPath: string; backupPath?: string; command: string };
export type UninstallCommandCodeHookResult = { settingsPath: string; removed: number };
export type CommandCodeDoctorReport = HookCommandDoctorReport<"settingsPath">;

const SUBCOMMAND = "command-code-post-tool-use";
const RETIRED = "Command Code automatic compaction is unavailable: additive hooks do not replace tool output. Use tokenjuice wrap -- <command>.";

function projectDir(options: CommandCodeHookCommandOptions): string | undefined {
  return options.projectDir || process.env.COMMANDCODE_PROJECT_DIR;
}

function defaultSettingsPath(options: CommandCodeHookCommandOptions): string {
  const project = projectDir(options);
  return project ? join(project, ".commandcode", "settings.json")
    : join(options.homeDir || process.env.COMMANDCODE_HOME || join(homedir(), ".commandcode"), "settings.json");
}

async function symlinkIssue(path: string, options: CommandCodeHookCommandOptions, defaultPath: boolean): Promise<string | undefined> {
  for (const candidate of [...(defaultPath && projectDir(options) ? [projectDir(options)!] : []), dirname(path), path]) {
    try {
      if ((await lstat(candidate)).isSymbolicLink()) return `cannot modify Command Code settings through symlink: ${candidate}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return undefined;
}

function ownedHook(entry: unknown): entry is Record<string, unknown> & { command: string } {
  if (!isRecord(entry) || entry.type !== "command" || typeof entry.command !== "string"
    || !entry.command.trimEnd().endsWith(` ${SUBCOMMAND}`)) return false;
  try {
    const parsed = parseTokenjuiceHookCommand(entry.command);
    if (parsed.subcommand !== SUBCOMMAND) return false;
    // Recognize generated launchers, not arbitrary scripts or shell text mentioning the name.
    return parsed.runtimePath
      ? parsed.argv.length === 3 && /(?:^|[\\/])dist[\\/]cli[\\/]main\.js$/u.test(parsed.launcherPath ?? "")
      : parsed.argv.length === 2;
  } catch {
    return false;
  }
}

function groups(config: HooksSettings): unknown[] {
  return Array.isArray(config.hooks.PostToolUse) ? config.hooks.PostToolUse : [];
}

function findCommand(config: HooksSettings): string | undefined {
  for (const group of groups(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) continue;
    for (const hook of group.hooks) if (ownedHook(hook)) return hook.command;
  }
  return undefined;
}

/** @deprecated Additive hook context cannot compact model-visible tool output. */
export async function installCommandCodeHook(
  _settingsPath?: string,
  _options: CommandCodeHookCommandOptions = {},
): Promise<InstallCommandCodeHookResult> {
  throw new Error(RETIRED);
}

export async function uninstallCommandCodeHook(
  settingsPath?: string,
  options: CommandCodeHookCommandOptions = {},
): Promise<UninstallCommandCodeHookResult> {
  const path = settingsPath ?? defaultSettingsPath(options);
  const issue = await symlinkIssue(path, options, settingsPath === undefined);
  if (issue) throw new Error(issue);
  const file = await readSettingsFile(path);
  const config = sanitizeHooksSettings(file.data ? JSON.parse(file.data.toString("utf8")) as unknown : {});
  let removed = 0;
  const retained: unknown[] = [];
  for (const group of groups(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) { retained.push(group); continue; }
    const before = removed;
    const hooks = group.hooks.filter(hook => {
      if (!ownedHook(hook)) return true;
      removed++;
      return false;
    });
    if (removed === before) retained.push(group);
    else if (hooks.length) retained.push({ ...group, hooks });
  }
  if (removed) {
    config.hooks.PostToolUse = retained;
    const changedIssue = await symlinkIssue(path, options, settingsPath === undefined);
    if (changedIssue) throw new Error(changedIssue);
    await writeSettingsFile(file, `${JSON.stringify(config, null, 2)}\n`);
  }
  return { settingsPath: path, removed };
}

export async function doctorCommandCodeHook(
  settingsPath?: string,
  options: CommandCodeHookCommandOptions = {},
): Promise<CommandCodeDoctorReport> {
  const path = settingsPath ?? defaultSettingsPath(options);
  const issue = await symlinkIssue(path, options, settingsPath === undefined);
  const file = issue ? undefined : await readSettingsFile(path);
  const config = sanitizeHooksSettings(file?.data ? JSON.parse(file.data.toString("utf8")) as unknown : {});
  const detectedCommand = findCommand(config);
  return {
    settingsPath: path,
    status: issue || detectedCommand ? "broken" : "disabled",
    expectedCommand: "tokenjuice wrap -- <command>",
    ...(detectedCommand ? { detectedCommand } : {}),
    issues: issue ? [issue] : detectedCommand ? ["retired tokenjuice Command Code hook is still installed"] : [],
    advisories: [RETIRED],
    fixCommand: detectedCommand ? "tokenjuice uninstall command-code" : "tokenjuice wrap -- <command>",
    checkedPaths: [path],
    missingPaths: file?.metadata || issue ? [] : [path],
  };
}

/** Keep stale configurations harmless until their hooks are removed. */
export async function runCommandCodePostToolUseHook(_rawText: string): Promise<number> {
  writeEmptyHookJsonLine();
  return 0;
}
