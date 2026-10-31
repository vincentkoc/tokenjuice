import { homedir } from "node:os";
import { join } from "node:path";

import { buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { buildTokenjuiceHookCommand, parseTokenjuiceHookCommand, type TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import { isRecord } from "../shared/hooks-json-file.js";
import { readSettingsFile, writeSettingsFile } from "../shared/settings-file.js";

const SUBCOMMAND = "qoder-post-tool-use";
const FIX_COMMAND = "tokenjuice install qoder-cli";
const ADVISORY = "Qoder CLI native hooks are beta; verify model-visible replacement in a fresh session. User and project hook files are merged, so check other scopes for duplicate installations.";

type Settings = Record<string, unknown> & { hooks: Record<string, unknown> };

function settingsPath(path?: string): string {
  return path ?? join(homedir(), ".qoder", "settings.json");
}

async function load(path: string) {
  const file = await readSettingsFile(path);
  const raw: unknown = file.data ? JSON.parse(file.data.toString("utf8")) : {};
  if (!isRecord(raw) || (raw.hooks !== undefined && !isRecord(raw.hooks))) {
    throw new Error(`invalid Qoder hook settings in ${path}; expected an object with an optional hooks object`);
  }
  const hooks = isRecord(raw.hooks) ? { ...raw.hooks } : {};
  if (hooks.PostToolUse !== undefined && !Array.isArray(hooks.PostToolUse)) {
    throw new Error(`invalid Qoder PostToolUse hooks in ${path}; expected an array`);
  }
  return { file, config: { ...raw, hooks } as Settings };
}

function owned(hook: unknown): hook is Record<string, unknown> & { command: string } {
  return isRecord(hook) && hook.type === "command" && typeof hook.command === "string"
    && parseTokenjuiceHookCommand(hook.command).subcommand === SUBCOMMAND;
}

function groups(config: Settings): unknown[] {
  return Array.isArray(config.hooks.PostToolUse) ? config.hooks.PostToolUse : [];
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
    if (retained.length) config.hooks.PostToolUse = retained;
    else delete config.hooks.PostToolUse;
  }
  return removed;
}

export async function installQoderHook(path?: string, options: TokenjuiceHookCommandOptions = {}) {
  const resolved = settingsPath(path);
  const { file, config } = await load(resolved);
  const before = JSON.stringify(config);
  const command = await buildTokenjuiceHookCommand(SUBCOMMAND, "Qoder CLI", options);
  removeOwned(config);
  config.hooks.PostToolUse = [...groups(config), {
    matcher: "Bash",
    hooks: [{ type: "command", command, timeout: 10, async: false }],
  }];
  const backupPath = JSON.stringify(config) === before ? undefined
    : await writeSettingsFile(file, `${JSON.stringify(config, null, 2)}\n`, "preserve");
  return { settingsPath: resolved, command, ...(backupPath ? { backupPath } : {}) };
}

export async function uninstallQoderHook(path?: string) {
  const resolved = settingsPath(path);
  const { file, config } = await load(resolved);
  const removed = removeOwned(config);
  const backupPath = removed ? await writeSettingsFile(file, `${JSON.stringify(config, null, 2)}\n`, "preserve") : undefined;
  return { settingsPath: resolved, removed, ...(backupPath ? { backupPath } : {}) };
}

export async function doctorQoderHook(path?: string, options: TokenjuiceHookCommandOptions = {}) {
  const resolved = settingsPath(path);
  const expectedCommand = await buildTokenjuiceHookCommand(SUBCOMMAND, "Qoder CLI", options);
  const { config } = await load(resolved);
  const entries = groups(config).flatMap((group) => isRecord(group) && Array.isArray(group.hooks)
    ? group.hooks.filter(owned).map((hook) => ({ group, hook })) : []);
  const fields = await buildHookCommandDoctorFields({
    expectedCommand, detectedCommand: entries[0]?.hook.command,
    disabledIssue: "tokenjuice Qoder CLI hook is not installed",
    hostLabel: "Qoder CLI", advisory: ADVISORY, fixCommand: FIX_COMMAND,
  });
  const issues = [...fields.issues];
  if (entries.length > 1) issues.push("multiple tokenjuice Qoder CLI hooks are configured in this file");
  for (const { group, hook } of entries) {
    if (group.matcher !== "Bash" || (group.async === true && hook.async !== false)
      || hook.async === true || hook.asyncRewake === true || hook.once === true
      || hook.if !== undefined || hook.args !== undefined) {
      issues.push("Qoder CLI hook must run synchronously for every Bash result without filters or exec-form arguments");
    }
  }
  return { settingsPath: resolved, ...fields, issues,
    status: issues.length && entries.length ? "broken" as const : fields.status };
}
