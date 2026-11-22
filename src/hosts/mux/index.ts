import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { findGitRoot } from "../shared/project-root.js";
import { parseTokenjuiceHookCommand, pathExists, type TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import type { HookCommandDoctorReport } from "../shared/hook-command-doctor.js";
import { readSettingsFile, removeSettingsFile, writeSettingsFile } from "../shared/settings-file.js";

export type MuxHookCommandOptions = TokenjuiceHookCommandOptions & { projectDir?: string };
export type InstallMuxHookResult = { hookPath: string; backupPath?: string; command: string };
export type UninstallMuxHookResult = { hookPath: string; removed: boolean };
export type MuxDoctorReport = HookCommandDoctorReport<"hookPath">;

const TOKENJUICE_MUX_RETIRED =
  "Mux/Xum automatic compaction is unavailable: additive hooks do not replace tool output. Use tokenjuice wrap -- <command>.";

async function findMuxHookSymlink(hookPath: string): Promise<{ label: string; path: string } | undefined> {
  for (const candidate of [
    { label: "directory", path: dirname(hookPath) },
    { label: "file", path: hookPath },
  ]) {
    try {
      const details = await lstat(candidate.path);
      if (details.isSymbolicLink()) {
        return candidate;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  return undefined;
}

async function assertNoMuxHookSymlink(hookPath: string, operation: string): Promise<void> {
  const symlink = await findMuxHookSymlink(hookPath);
  if (symlink) {
    throw new Error(`cannot safely ${operation} Mux hook through symlinked ${symlink.label} ${symlink.path}; remove the symlink, then rerun tokenjuice ${operation} mux`);
  }
}

function getProjectDir(options: MuxHookCommandOptions = {}): string {
  return options.projectDir || process.env.MUX_PROJECT_DIR || "";
}

async function resolveProjectDir(options: MuxHookCommandOptions = {}): Promise<string> {
  const projectDir = getProjectDir(options);
  if (projectDir) {
    return resolve(projectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultHookPath(options: MuxHookCommandOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".mux", "tool_post");
}

function findManagedBlock(script: string): { start: number; end: number; command: string } | undefined {
  const match = /^# tokenjuice:mux begin\r?\n\(\r?\n  set -euo pipefail\r?\n  ([^\r\n]+)\r?\n\) \|\| true\r?\n# tokenjuice:mux end(?:\r?\n|$)/mu.exec(script);
  if (!match || match.index === undefined) return undefined;
  const command = match[1]!;
  // Only remove the generated block; preserve custom scripts that mention the command.
  if (!command.trimEnd().endsWith(" mux-post-tool-use")) return undefined;
  try {
    if (parseTokenjuiceHookCommand(command).subcommand !== "mux-post-tool-use") return undefined;
  } catch {
    return undefined;
  }
  return { start: match.index, end: match.index + match[0].length, command };
}

/** @deprecated Additive hook context cannot compact model-visible tool output. */
export async function installMuxHook(
  _hookPath?: string,
  _options: MuxHookCommandOptions = {},
): Promise<InstallMuxHookResult> {
  throw new Error(TOKENJUICE_MUX_RETIRED);
}

export async function uninstallMuxHook(
  hookPath?: string,
  options: MuxHookCommandOptions = {},
): Promise<UninstallMuxHookResult> {
  const resolvedHookPath = hookPath ?? (await getDefaultHookPath(options));
  await assertNoMuxHookSymlink(resolvedHookPath, "uninstall");
  const file = await readSettingsFile(resolvedHookPath);
  if (!file.metadata || !file.data) return { hookPath: resolvedHookPath, removed: false };
  const script = file.data.toString("utf8");
  const block = findManagedBlock(script);
  if (!block) return { hookPath: resolvedHookPath, removed: false };
  const remaining = script.slice(0, block.start) + script.slice(block.end);
  await assertNoMuxHookSymlink(resolvedHookPath, "uninstall");
  if (remaining.replace(/^#![^\n]*\n?/u, "").trim()) {
    await writeSettingsFile(file, remaining, undefined, { mode: file.metadata.mode & 0o777 });
  } else {
    await removeSettingsFile(file);
  }
  return { hookPath: resolvedHookPath, removed: true };
}

export async function doctorMuxHook(
  hookPath?: string,
  options: MuxHookCommandOptions = {},
): Promise<MuxDoctorReport> {
  const resolvedHookPath = hookPath ?? (await getDefaultHookPath(options));
  const symlink = await findMuxHookSymlink(resolvedHookPath);
  let detectedCommand: string | undefined;
  if (!symlink) {
    try {
      detectedCommand = findManagedBlock(await readFile(resolvedHookPath, "utf8"))?.command;
    } catch {
      // Missing or unreadable hooks are not installed.
    }
  }
  const issues = symlink
    ? [`configured Mux tool_post hook uses a symlinked ${symlink.label} at ${symlink.path}; inspect it before removing the retired tokenjuice block`]
    : detectedCommand ? ["retired tokenjuice Mux tool_post hook is still installed"] : [];
  return {
    hookPath: resolvedHookPath,
    status: issues.length ? "broken" : "disabled",
    expectedCommand: "tokenjuice wrap -- <command>",
    ...(detectedCommand ? { detectedCommand } : {}),
    issues,
    advisories: [TOKENJUICE_MUX_RETIRED],
    fixCommand: detectedCommand ? "tokenjuice uninstall mux" : "tokenjuice wrap -- <command>",
    checkedPaths: [resolvedHookPath],
    missingPaths: await pathExists(resolvedHookPath) ? [] : [resolvedHookPath],
  };
}

/** Keep stale configurations silent until their hooks are removed. */
export async function runMuxPostToolUseHook(_env: NodeJS.ProcessEnv = process.env): Promise<number> {
  return 0;
}
