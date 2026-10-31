import { constants as fsConstants } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { parseTokenjuiceHookCommand, type TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import type { HookCommandDoctorReport } from "../shared/hook-command-doctor.js";
import { writeEmptyHookJsonLine } from "../shared/hook-output.js";
import { type HooksSettings as GrokCliUserSettings, isRecord, sanitizeHooksSettings as sanitizeGrokCliSettings } from "../shared/hooks-json-file.js";

export type GrokCliHookCommandOptions = TokenjuiceHookCommandOptions;

export type InstallGrokCliHookResult = {
  settingsPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallGrokCliHookResult = {
  settingsPath: string;
  removed: number;
};

export type GrokCliDoctorReport = HookCommandDoctorReport<"settingsPath">;

const TOKENJUICE_GROK_CLI_SUBCOMMAND = "grok-cli-post-tool-use";
const TOKENJUICE_GROK_CLI_RETIRED =
  "Grok CLI automatic compaction is unavailable: additive hooks do not replace tool output. Use tokenjuice wrap -- <command>.";

function getDefaultSettingsPath(): string {
  return join(homedir(), ".grok", "user-settings.json");
}

async function readGrokCliSettings(settingsPath: string): Promise<{ config: GrokCliUserSettings; exists: boolean }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    return { config: sanitizeGrokCliSettings(JSON.parse(rawText) as unknown), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} }, exists: false };
    }
    throw error;
  }
}

async function writeGrokCliSettings(settingsPath: string, config: GrokCliUserSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true, mode: fsConstants.S_IRWXU });
  const tempPath = `${settingsPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: fsConstants.S_IRUSR | fsConstants.S_IWUSR,
  });
  await rename(tempPath, settingsPath);
  await chmod(settingsPath, fsConstants.S_IRUSR | fsConstants.S_IWUSR);
}

function isTokenjuiceGrokCliHook(entry: unknown): boolean {
  if (!isRecord(entry) || typeof entry.command !== "string") return false;
  // Generated hook commands end with this unquoted argument. Preserve custom shell text.
  if (!entry.command.trimEnd().endsWith(` ${TOKENJUICE_GROK_CLI_SUBCOMMAND}`)) return false;
  try {
    return parseTokenjuiceHookCommand(entry.command).subcommand === TOKENJUICE_GROK_CLI_SUBCOMMAND;
  } catch {
    return false;
  }
}

function getPostToolUseHooks(config: GrokCliUserSettings): unknown[] {
  const postToolUse = config.hooks.PostToolUse;
  return Array.isArray(postToolUse) ? postToolUse : [];
}

function findTokenjuiceGrokCliHookCommand(config: GrokCliUserSettings): string | undefined {
  for (const group of getPostToolUseHooks(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }
    for (const hook of group.hooks) {
      if (isTokenjuiceGrokCliHook(hook)) {
        return (hook as { command: string }).command;
      }
    }
  }
  return undefined;
}

function removeTokenjuiceGrokCliHooks(config: GrokCliUserSettings): number {
  let removed = 0;
  const retainedGroups: unknown[] = [];
  for (const group of getPostToolUseHooks(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      retainedGroups.push(group);
      continue;
    }
    const retainedHooks = group.hooks.filter((hook) => {
      const remove = isTokenjuiceGrokCliHook(hook);
      if (remove) {
        removed += 1;
      }
      return !remove;
    });
    if (retainedHooks.length > 0) {
      retainedGroups.push({ ...group, hooks: retainedHooks });
    }
  }
  config.hooks.PostToolUse = retainedGroups;
  return removed;
}

/** @deprecated Additive hook context cannot compact model-visible tool output. */
export async function installGrokCliHook(
  _settingsPath?: string,
  _options: GrokCliHookCommandOptions = {},
): Promise<InstallGrokCliHookResult> {
  throw new Error(TOKENJUICE_GROK_CLI_RETIRED);
}

export async function uninstallGrokCliHook(settingsPath = getDefaultSettingsPath()): Promise<UninstallGrokCliHookResult> {
  const { config } = await readGrokCliSettings(settingsPath);
  const removed = removeTokenjuiceGrokCliHooks(config);
  if (removed > 0) {
    await writeGrokCliSettings(settingsPath, config);
  }
  return { settingsPath, removed };
}

export async function doctorGrokCliHook(
  settingsPath = getDefaultSettingsPath(),
  _options: GrokCliHookCommandOptions = {},
): Promise<GrokCliDoctorReport> {
  const { config, exists } = await readGrokCliSettings(settingsPath);
  const detectedCommand = findTokenjuiceGrokCliHookCommand(config);
  return {
    settingsPath,
    status: detectedCommand ? "broken" : "disabled",
    expectedCommand: "tokenjuice wrap -- <command>",
    ...(detectedCommand ? { detectedCommand } : {}),
    issues: detectedCommand ? ["retired tokenjuice Grok CLI hook is still installed"] : [],
    advisories: [TOKENJUICE_GROK_CLI_RETIRED],
    fixCommand: detectedCommand ? "tokenjuice uninstall grok-cli" : "tokenjuice wrap -- <command>",
    checkedPaths: [settingsPath],
    missingPaths: exists ? [] : [settingsPath],
  };
}

/** Keep stale configurations harmless until their hooks are removed. */
export async function runGrokCliPostToolUseHook(_rawText: string): Promise<number> {
  writeEmptyHookJsonLine();
  return 0;
}
