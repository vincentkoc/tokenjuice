import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import {
  buildTokenjuiceHookCommand,
  type TokenjuiceHookCommandOptions,
} from "../shared/host-command.js";
import { buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { buildCompactedOutputContext, writeEmptyHookJsonLine, writeHookJsonLine } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";

export type CommandCodeHookCommandOptions = TokenjuiceHookCommandOptions & {
  homeDir?: string;
  projectDir?: string;
};

export type InstallCommandCodeHookResult = {
  settingsPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallCommandCodeHookResult = {
  settingsPath: string;
  removed: number;
};

export type CommandCodeDoctorReport = {
  settingsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  checkedPaths: string[];
  missingPaths: string[];
};

type CommandCodeSettings = Record<string, unknown> & {
  hooks: Record<string, unknown>;
};

type CommandCodePostToolUsePayload = {
  hook_event_name?: unknown;
  hookEventName?: unknown;
  tool_name?: unknown;
  toolName?: unknown;
  tool_display_name?: unknown;
  toolDisplayName?: unknown;
  tool_input?: unknown;
  toolInput?: unknown;
  tool_response?: unknown;
  toolResponse?: unknown;
  cwd?: unknown;
};

type DetectedCommandCodeHook = {
  command: string;
  issues: string[];
};

const TOKENJUICE_COMMAND_CODE_SUBCOMMAND = "command-code-post-tool-use";
const TOKENJUICE_COMMAND_CODE_FIX_COMMAND = "tokenjuice install command-code";
const TOKENJUICE_COMMAND_CODE_ADVISORY =
  "Command Code support is beta and injects compacted context without suppressing the original tool result.";
const TOKENJUICE_COMMAND_CODE_DISABLED_ADVISORY =
  "Command Code support is beta; verify live PostToolUse behavior after install.";

function getCommandCodeFixCommand(local?: boolean): string {
  return local ? `${TOKENJUICE_COMMAND_CODE_FIX_COMMAND} --local` : TOKENJUICE_COMMAND_CODE_FIX_COMMAND;
}

function getCommandCodeHome(options: CommandCodeHookCommandOptions = {}): string {
  return options.homeDir || process.env.COMMANDCODE_HOME || join(homedir(), ".commandcode");
}

function getDefaultSettingsPath(options: CommandCodeHookCommandOptions = {}): string {
  const projectDir = options.projectDir || process.env.COMMANDCODE_PROJECT_DIR;
  if (projectDir) {
    return join(projectDir, ".commandcode", "settings.json");
  }
  return join(getCommandCodeHome(options), "settings.json");
}

function getCommandCodeProjectDir(options: CommandCodeHookCommandOptions = {}): string | undefined {
  return options.projectDir || process.env.COMMANDCODE_PROJECT_DIR;
}

function getCommandCodeSettingsSymlinkCandidates(
  settingsPath: string,
  options: CommandCodeHookCommandOptions,
  checkDefaultRoot: boolean,
): Array<{ label: string; path: string }> {
  const candidates = [
    ...(checkDefaultRoot && getCommandCodeProjectDir(options)
      ? [{ label: "project directory", path: getCommandCodeProjectDir(options)! }]
      : []),
    { label: "settings directory", path: dirname(settingsPath) },
    { label: "settings file", path: settingsPath },
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.path)) {
      return false;
    }
    seen.add(candidate.path);
    return true;
  });
}

async function findCommandCodeSettingsSymlink(
  settingsPath: string,
  options: CommandCodeHookCommandOptions = {},
  checkDefaultRoot = false,
): Promise<{ label: string; path: string } | undefined> {
  for (const candidate of getCommandCodeSettingsSymlinkCandidates(settingsPath, options, checkDefaultRoot)) {
    try {
      const stats = await lstat(candidate.path);
      if (stats.isSymbolicLink()) {
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

async function assertNoCommandCodeSettingsSymlink(
  settingsPath: string,
  operation: string,
  options: CommandCodeHookCommandOptions = {},
  checkDefaultRoot = false,
): Promise<void> {
  const symlink = await findCommandCodeSettingsSymlink(settingsPath, options, checkDefaultRoot);
  if (symlink) {
    throw new Error(`cannot safely ${operation} Command Code settings through symlinked ${symlink.label} ${symlink.path}; remove the symlink, then rerun tokenjuice ${operation} command-code`);
  }
}

async function assertNoCommandCodeSidecarSymlink(settingsPath: string, suffix: ".bak" | ".tmp", operation: string): Promise<void> {
  const sidecarPath = `${settingsPath}${suffix}`;
  try {
    const stats = await lstat(sidecarPath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot safely ${operation} Command Code settings through symlinked sidecar ${sidecarPath}; remove the symlink, then rerun tokenjuice ${operation} command-code`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function chooseCommandCodeBackupPath(settingsPath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${settingsPath}.bak` : `${settingsPath}.bak.${index}`;
    try {
      const stats = await lstat(candidate);
      if (stats.isSymbolicLink()) {
        throw new Error(`cannot safely install Command Code settings through symlinked sidecar ${candidate}; remove the symlink, then rerun tokenjuice install command-code`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return candidate;
      }
      throw error;
    }
  }
}

function sanitizeCommandCodeSettings(raw: unknown): CommandCodeSettings {
  if (!isRecord(raw)) {
    return { hooks: {} };
  }
  return {
    ...raw,
    hooks: isRecord(raw.hooks) ? { ...raw.hooks } : {},
  };
}

async function readCommandCodeSettings(settingsPath: string): Promise<{ config: CommandCodeSettings; exists: boolean }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    return { config: sanitizeCommandCodeSettings(JSON.parse(rawText) as unknown), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} }, exists: false };
    }
    throw error;
  }
}

async function loadCommandCodeSettingsWithBackup(
  settingsPath: string,
  options: CommandCodeHookCommandOptions,
  checkDefaultRoot: boolean,
): Promise<{ config: CommandCodeSettings; backupPath?: string }> {
  await assertNoCommandCodeSettingsSymlink(settingsPath, "install", options, checkDefaultRoot);
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const backupPath = await chooseCommandCodeBackupPath(settingsPath);
    await writeFile(backupPath, rawText, { encoding: "utf8", flag: "wx" });
    return { config: sanitizeCommandCodeSettings(JSON.parse(rawText) as unknown), backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} } };
    }
    throw error;
  }
}

async function writeCommandCodeSettings(
  settingsPath: string,
  config: CommandCodeSettings,
  operation: "install" | "uninstall",
  options: CommandCodeHookCommandOptions,
  checkDefaultRoot: boolean,
): Promise<void> {
  await assertNoCommandCodeSettingsSymlink(settingsPath, operation, options, checkDefaultRoot);
  await assertNoCommandCodeSidecarSymlink(settingsPath, ".tmp", operation);
  await mkdir(dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(tempPath, settingsPath);
}

function isTokenjuiceCommandCodeHook(entry: unknown): entry is Record<string, unknown> & { command: string } {
  return isRecord(entry)
    && typeof entry.command === "string"
    && entry.command.includes(TOKENJUICE_COMMAND_CODE_SUBCOMMAND);
}

function getPostToolUseHooks(config: CommandCodeSettings): unknown[] {
  const postToolUse = config.hooks.PostToolUse;
  return Array.isArray(postToolUse) ? postToolUse : [];
}

function findTokenjuiceCommandCodeHook(config: CommandCodeSettings): DetectedCommandCodeHook | undefined {
  for (const group of getPostToolUseHooks(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }
    for (const hook of group.hooks) {
      if (isTokenjuiceCommandCodeHook(hook)) {
        const issues: string[] = [];
        if (group.matcher !== "shell") {
          issues.push("configured Command Code hook is not scoped to the shell matcher");
        }
        if (hook.type !== "command") {
          issues.push("configured Command Code hook entry is not a command hook");
        }
        return { command: hook.command, issues };
      }
    }
  }
  return undefined;
}

function removeTokenjuiceCommandCodeHooks(config: CommandCodeSettings): number {
  let removed = 0;
  const retainedGroups: unknown[] = [];
  for (const group of getPostToolUseHooks(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      retainedGroups.push(group);
      continue;
    }
    const retainedHooks = group.hooks.filter((hook) => {
      const remove = isTokenjuiceCommandCodeHook(hook);
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

function createCommandCodeHook(command: string): Record<string, unknown> {
  return {
    matcher: "shell",
    hooks: [
      {
        type: "command",
        command,
        timeout: 10,
      },
    ],
  };
}

export async function installCommandCodeHook(
  settingsPath?: string,
  options: CommandCodeHookCommandOptions = {},
): Promise<InstallCommandCodeHookResult> {
  const checkDefaultRoot = settingsPath === undefined;
  const resolvedSettingsPath = settingsPath ?? getDefaultSettingsPath(options);
  const { config, backupPath } = await loadCommandCodeSettingsWithBackup(resolvedSettingsPath, options, checkDefaultRoot);
  const command = await buildTokenjuiceHookCommand(TOKENJUICE_COMMAND_CODE_SUBCOMMAND, "command-code", options);
  removeTokenjuiceCommandCodeHooks(config);
  config.hooks.PostToolUse = [...getPostToolUseHooks(config), createCommandCodeHook(command)];
  await writeCommandCodeSettings(resolvedSettingsPath, config, "install", options, checkDefaultRoot);
  return {
    settingsPath: resolvedSettingsPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallCommandCodeHook(
  settingsPath?: string,
  options: CommandCodeHookCommandOptions = {},
): Promise<UninstallCommandCodeHookResult> {
  const checkDefaultRoot = settingsPath === undefined;
  const resolvedSettingsPath = settingsPath ?? getDefaultSettingsPath(options);
  await assertNoCommandCodeSettingsSymlink(resolvedSettingsPath, "uninstall", options, checkDefaultRoot);
  const { config } = await readCommandCodeSettings(resolvedSettingsPath);
  const removed = removeTokenjuiceCommandCodeHooks(config);
  if (removed > 0) {
    await writeCommandCodeSettings(resolvedSettingsPath, config, "uninstall", options, checkDefaultRoot);
  }
  return { settingsPath: resolvedSettingsPath, removed };
}

export async function doctorCommandCodeHook(
  settingsPath?: string,
  options: CommandCodeHookCommandOptions = {},
): Promise<CommandCodeDoctorReport> {
  const checkDefaultRoot = settingsPath === undefined;
  const resolvedSettingsPath = settingsPath ?? getDefaultSettingsPath(options);
  const expectedCommand = await buildTokenjuiceHookCommand(TOKENJUICE_COMMAND_CODE_SUBCOMMAND, "command-code", options);
  const symlink = await findCommandCodeSettingsSymlink(resolvedSettingsPath, options, checkDefaultRoot);
  if (symlink) {
    return {
      settingsPath: resolvedSettingsPath,
      status: "broken",
      issues: [`cannot safely inspect Command Code settings through symlinked ${symlink.label} ${symlink.path}; remove the symlink, then rerun tokenjuice doctor command-code`],
      advisories: [TOKENJUICE_COMMAND_CODE_DISABLED_ADVISORY],
      fixCommand: getCommandCodeFixCommand(options.local),
      expectedCommand,
      checkedPaths: [resolvedSettingsPath],
      missingPaths: [],
    };
  }
  const { config, exists } = await readCommandCodeSettings(resolvedSettingsPath);
  const detectedHook = findTokenjuiceCommandCodeHook(config);
  const fields = await buildHookCommandDoctorFields({
    expectedCommand,
    detectedCommand: exists ? detectedHook?.command : undefined,
    disabledIssue: "tokenjuice PostToolUse hook is not installed for Command Code",
    hostLabel: "Command Code",
    advisory: detectedHook ? TOKENJUICE_COMMAND_CODE_ADVISORY : TOKENJUICE_COMMAND_CODE_DISABLED_ADVISORY,
    fixCommand: getCommandCodeFixCommand(options.local),
  });
  if (detectedHook && detectedHook.issues.length > 0) {
    fields.issues.push(...detectedHook.issues);
    fields.status = "broken";
  }

  return {
    settingsPath: resolvedSettingsPath,
    ...fields,
  };
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function readCommandCodeOutputText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }
  if (!isRecord(response)) {
    return "";
  }
  return readStringField(response, ["output", "text", "content", "result", "stdout"]) ?? "";
}

function readPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readPayloadField(payload: CommandCodePostToolUsePayload, snakeKey: keyof CommandCodePostToolUsePayload, camelKey: keyof CommandCodePostToolUsePayload): unknown {
  return payload[snakeKey] ?? payload[camelKey];
}

function commandRequestsTokenjuiceRawBypass(command: string): boolean {
  const argv = command.trim().split(/\s+/u);
  const wrapIndex = argv.findIndex((part) => part === "wrap");
  if (wrapIndex === -1) {
    return false;
  }

  const optionEndIndex = argv.indexOf("--", wrapIndex + 1);
  const optionArgs = argv.slice(wrapIndex + 1, optionEndIndex === -1 ? undefined : optionEndIndex);
  return optionArgs.includes("--raw") || optionArgs.includes("--full");
}

export async function runCommandCodePostToolUseHook(rawText: string): Promise<number> {
  let payload: CommandCodePostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as CommandCodePostToolUsePayload;
  } catch {
    writeEmptyHookJsonLine();
    return 0;
  }

  const hookEventName = readPayloadField(payload, "hook_event_name", "hookEventName");
  const toolName = readPayloadField(payload, "tool_name", "toolName");
  const toolDisplayName = readPayloadField(payload, "tool_display_name", "toolDisplayName");
  if (
    (typeof hookEventName === "string" && hookEventName !== "PostToolUse")
    || (toolName !== "shell_command" && toolDisplayName !== "SHELL" && toolDisplayName !== "shell")
  ) {
    writeEmptyHookJsonLine();
    return 0;
  }

  const toolInputValue = readPayloadField(payload, "tool_input", "toolInput");
  const toolInput = isRecord(toolInputValue) ? toolInputValue : undefined;
  const command = toolInput ? readStringField(toolInput, ["command", "cmd"]) : undefined;
  if (!command || commandRequestsTokenjuiceRawBypass(command)) {
    writeEmptyHookJsonLine();
    return 0;
  }

  const visibleText = readCommandCodeOutputText(readPayloadField(payload, "tool_response", "toolResponse"));
  if (!visibleText.trim()) {
    writeEmptyHookJsonLine();
    return 0;
  }

  try {
    const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_COMMAND_CODE_MAX_INLINE_CHARS");
    const outcome = await compactBashResult({
      source: "command-code",
      command,
      visibleText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      inspectionPolicy: "allow-safe-inventory",
      metadata: { source: "command-code-post-tool-use" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.action === "keep") {
      writeEmptyHookJsonLine();
      return 0;
    }

    writeHookJsonLine({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: buildCompactedOutputContext(outcome.result.inlineText),
      },
    });
    return 0;
  } catch {
    writeEmptyHookJsonLine();
    return 0;
  }
}
