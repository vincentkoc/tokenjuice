import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import { buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { buildTokenjuiceHookCommand, parseTokenjuiceHookCommand, type TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import { isRecord } from "../shared/hooks-json-file.js";
import { readSettingsFile, writeSettingsFile } from "../shared/settings-file.js";

const SUBCOMMAND = "snow-cli-after-tool-call";
const FIX_COMMAND = "tokenjuice install snow-cli";
const ADVISORY = "Snow CLI hooks are beta; verify model-visible replacement in a fresh session. Project afterToolCall rules override global rules. Exit 1 is the native replacement protocol, not a shell failure.";

type Settings = Record<string, unknown>;

function settingsPath(path?: string): string {
  const override = process.env.SNOW_CONFIG_DIR?.trim();
  return path ?? join(override && isAbsolute(override) ? override : join(homedir(), ".snow"), "hooks", "afterToolCall.json");
}

async function load(path: string) {
  const file = await readSettingsFile(path);
  const raw: unknown = file.data ? JSON.parse(file.data.toString("utf8")) : {};
  const config = Array.isArray(raw) ? { afterToolCall: raw } : raw;
  if (!isRecord(config) || (config.afterToolCall !== undefined && !Array.isArray(config.afterToolCall))) {
    throw new Error(`invalid Snow CLI hooks in ${path}; expected an array or an object with afterToolCall rules`);
  }
  return { file, config: { ...config } as Settings };
}

function owned(hook: unknown): hook is Record<string, unknown> & { command: string } {
  return isRecord(hook) && hook.type === "command" && typeof hook.command === "string"
    && parseTokenjuiceHookCommand(hook.command).subcommand === SUBCOMMAND;
}

function groups(config: Settings): unknown[] {
  return Array.isArray(config.afterToolCall) ? config.afterToolCall : [];
}

function removeOwned(config: Settings): number {
  let removed = 0;
  const retained = groups(config).flatMap((group) => {
    if (!isRecord(group) || !Array.isArray(group.hooks)) return [group];
    const hooks = group.hooks.filter((hook) => !owned(hook));
    if (hooks.length === group.hooks.length) return [group];
    removed += group.hooks.length - hooks.length;
    return hooks.length ? [{ ...group, hooks }] : [];
  });
  if (removed) {
    if (retained.length) config.afterToolCall = retained;
    else delete config.afterToolCall;
  }
  return removed;
}

export async function installSnowCliHook(path?: string, options: TokenjuiceHookCommandOptions = {}) {
  const resolved = settingsPath(path);
  const { file, config } = await load(resolved);
  const before = JSON.stringify(config);
  const command = await buildTokenjuiceHookCommand(SUBCOMMAND, "Snow CLI", options);
  removeOwned(config);
  config.afterToolCall = [...groups(config), {
    matcher: "terminal-execute",
    hooks: [{ type: "command", command, timeout: 10000, enabled: true }],
  }];
  const backupPath = JSON.stringify(config) === before ? undefined
    : await writeSettingsFile(file, `${JSON.stringify(config, null, 2)}\n`, "preserve");
  return { settingsPath: resolved, command, ...(backupPath ? { backupPath } : {}) };
}

export async function uninstallSnowCliHook(path?: string) {
  const resolved = settingsPath(path);
  const { file, config } = await load(resolved);
  const removed = removeOwned(config);
  const backupPath = removed ? await writeSettingsFile(file, `${JSON.stringify(config, null, 2)}\n`, "preserve") : undefined;
  return { settingsPath: resolved, removed, ...(backupPath ? { backupPath } : {}) };
}

export async function doctorSnowCliHook(path?: string, options: TokenjuiceHookCommandOptions = {}) {
  const resolved = settingsPath(path);
  const expectedCommand = await buildTokenjuiceHookCommand(SUBCOMMAND, "Snow CLI", options);
  let config: Settings;
  try {
    config = (await load(resolved)).config;
  } catch (error) {
    return { settingsPath: resolved, status: "broken" as const,
      issues: [error instanceof Error ? error.message : String(error)],
      advisories: [ADVISORY], fixCommand: FIX_COMMAND, expectedCommand,
      checkedPaths: [resolved], missingPaths: [] as string[],
    };
  }
  const entries = groups(config).flatMap((group) => isRecord(group) && Array.isArray(group.hooks)
    ? group.hooks.filter(owned).map((hook) => ({ group, hook })) : []);
  const fields = await buildHookCommandDoctorFields({
    expectedCommand, detectedCommand: entries[0]?.hook.command,
    disabledIssue: "tokenjuice Snow CLI hook is not installed",
    hostLabel: "Snow CLI", advisory: ADVISORY, fixCommand: FIX_COMMAND,
  });
  const issues = [...fields.issues];
  if (entries.length > 1) issues.push("multiple tokenjuice Snow CLI hooks are configured in this file");
  for (const { group, hook } of entries) {
    if (group.matcher !== "terminal-execute" || hook.enabled !== true || hook.timeout !== 10000) {
      issues.push("Snow CLI hook must be enabled, match terminal-execute and use a 10000ms timeout");
    }
  }
  return { settingsPath: resolved, ...fields, issues,
    status: issues.length && entries.length ? "broken" as const : fields.status };
}

export { runSnowCliAfterToolCallHook } from "./hook.js";
