import { lstat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseTokenjuiceHookCommand, type TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import type { HookCommandDoctorReport } from "../shared/hook-command-doctor.js";
import { writeEmptyHookJsonLine } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";
import { readSettingsFile, writeSettingsFile } from "../shared/settings-file.js";

export type OpenHandsHookCommandOptions = TokenjuiceHookCommandOptions & { projectDir?: string };
export type InstallOpenHandsHookResult = { hooksPath: string; backupPath?: string; command: string };
export type UninstallOpenHandsHookResult = { hooksPath: string; removed: number };
export type OpenHandsDoctorReport = HookCommandDoctorReport<"hooksPath">;

const SUBCOMMAND = "openhands-post-tool-use";
const RETIRED = "OpenHands automatic compaction is unavailable: additive hooks do not replace tool output. Use tokenjuice wrap -- <command>.";
const EVENTS = ["post_tool_use", "PostToolUse"] as const;

function projectDir(options: OpenHandsHookCommandOptions): string {
  return options.projectDir || process.env.OPENHANDS_PROJECT_DIR || process.cwd();
}

function defaultHooksPath(options: OpenHandsHookCommandOptions): string {
  return join(projectDir(options), ".openhands", "hooks.json");
}

async function symlinkIssue(path: string, options: OpenHandsHookCommandOptions, defaultPath: boolean): Promise<string | undefined> {
  for (const candidate of [...(defaultPath ? [projectDir(options)] : []), dirname(path), path]) {
    try {
      if ((await lstat(candidate)).isSymbolicLink()) return `cannot modify OpenHands hooks through symlink: ${candidate}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return undefined;
}

function ownedHook(hook: unknown): hook is Record<string, unknown> & { command: string } {
  if (!isRecord(hook) || (hook.type !== undefined && hook.type !== "command") || typeof hook.command !== "string"
    || !hook.command.trimEnd().endsWith(` ${SUBCOMMAND}`)) return false;
  try {
    const parsed = parseTokenjuiceHookCommand(hook.command);
    if (parsed.subcommand !== SUBCOMMAND) return false;
    // Retain arbitrary scripts and compound shell commands that mention this name.
    return parsed.runtimePath
      ? parsed.argv.length === 3 && /(?:^|[\\/])dist[\\/]cli[\\/]main\.js$/u.test(parsed.launcherPath ?? "")
      : parsed.argv.length === 2;
  } catch {
    return false;
  }
}

function containers(config: Record<string, unknown>): Record<string, unknown>[] {
  return isRecord(config.hooks) ? [config, config.hooks] : [config];
}

function findCommand(config: Record<string, unknown>): string | undefined {
  for (const container of containers(config)) for (const event of EVENTS) {
    const groups = container[event];
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.hooks)) continue;
      for (const hook of group.hooks) if (ownedHook(hook)) return hook.command;
    }
  }
  return undefined;
}

function removeHooks(config: Record<string, unknown>): number {
  let removed = 0;
  for (const container of containers(config)) for (const event of EVENTS) {
    const groups = container[event];
    if (!Array.isArray(groups)) continue;
    const retained: unknown[] = [];
    for (const group of groups) {
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
    container[event] = retained;
  }
  return removed;
}

/** @deprecated Additive hook context cannot compact model-visible tool output. */
export async function installOpenHandsHook(
  _hooksPath?: string,
  _options: OpenHandsHookCommandOptions = {},
): Promise<InstallOpenHandsHookResult> {
  throw new Error(RETIRED);
}

export async function uninstallOpenHandsHook(
  hooksPath?: string,
  options: OpenHandsHookCommandOptions = {},
): Promise<UninstallOpenHandsHookResult> {
  const path = hooksPath ?? defaultHooksPath(options);
  const issue = await symlinkIssue(path, options, hooksPath === undefined);
  if (issue) throw new Error(issue);
  const file = await readSettingsFile(path);
  const parsed: unknown = file.data ? JSON.parse(file.data.toString("utf8")) as unknown : {};
  const removed = isRecord(parsed) ? removeHooks(parsed) : 0;
  if (removed) {
    const changedIssue = await symlinkIssue(path, options, hooksPath === undefined);
    if (changedIssue) throw new Error(changedIssue);
    await writeSettingsFile(file, `${JSON.stringify(parsed, null, 2)}\n`);
  }
  return { hooksPath: path, removed };
}

export async function doctorOpenHandsHook(
  hooksPath?: string,
  options: OpenHandsHookCommandOptions = {},
): Promise<OpenHandsDoctorReport> {
  const path = hooksPath ?? defaultHooksPath(options);
  const issue = await symlinkIssue(path, options, hooksPath === undefined);
  const file = issue ? undefined : await readSettingsFile(path);
  const parsed: unknown = file?.data ? JSON.parse(file.data.toString("utf8")) as unknown : {};
  const detectedCommand = isRecord(parsed) ? findCommand(parsed) : undefined;
  return {
    hooksPath: path,
    status: issue || detectedCommand ? "broken" : "disabled",
    expectedCommand: "tokenjuice wrap -- <command>",
    ...(detectedCommand ? { detectedCommand } : {}),
    issues: issue ? [issue] : detectedCommand ? ["retired tokenjuice OpenHands hook is still installed"] : [],
    advisories: [RETIRED],
    fixCommand: detectedCommand ? "tokenjuice uninstall openhands" : "tokenjuice wrap -- <command>",
    checkedPaths: [path],
    missingPaths: file?.metadata || issue ? [] : [path],
  };
}

/** Keep stale configurations harmless until their hooks are removed. */
export async function runOpenHandsPostToolUseHook(_rawText: string): Promise<number> {
  writeEmptyHookJsonLine();
  return 0;
}
