import { constants as fsConstants } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { stripLeadingCdPrefix } from "../../core/command.js";
import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import {
  buildTokenjuiceHookCommand,
  type TokenjuiceHookCommandOptions,
} from "../shared/host-command.js";
import { isTokenjuiceExecutablePath, parseShellWords } from "../shared/hook-command.js";
import { buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { buildCompactedOutputContext, writeEmptyHookJsonLine, writeHookJsonLine } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";

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

export type GrokCliDoctorReport = {
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

type GrokCliUserSettings = Record<string, unknown> & {
  hooks: Record<string, unknown>;
};

type GrokCliPostToolUsePayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
  tool_output?: unknown;
  cwd?: unknown;
};

const TOKENJUICE_GROK_CLI_SUBCOMMAND = "grok-cli-post-tool-use";
const TOKENJUICE_GROK_CLI_FIX_COMMAND = "tokenjuice install grok-cli";
const TOKENJUICE_GROK_CLI_ADVISORY = "Grok CLI support is beta and injects compacted context without suppressing the original tool result.";
const TOKENJUICE_GROK_CLI_DISABLED_ADVISORY = "Grok CLI support is beta; verify live PostToolUse behavior after install.";

function getDefaultSettingsPath(): string {
  return join(homedir(), ".grok", "user-settings.json");
}

function sanitizeGrokCliSettings(raw: unknown): GrokCliUserSettings {
  if (!isRecord(raw)) {
    return { hooks: {} };
  }
  return {
    ...raw,
    hooks: isRecord(raw.hooks) ? { ...raw.hooks } : {},
  };
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

async function loadGrokCliSettingsWithBackup(settingsPath: string): Promise<{ config: GrokCliUserSettings; backupPath?: string }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const backupPath = `${settingsPath}.bak`;
    await writeFile(backupPath, rawText, { encoding: "utf8", mode: fsConstants.S_IRUSR | fsConstants.S_IWUSR });
    return { config: sanitizeGrokCliSettings(JSON.parse(rawText) as unknown), backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} } };
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
  return isRecord(entry)
    && typeof entry.command === "string"
    && entry.command.includes(TOKENJUICE_GROK_CLI_SUBCOMMAND);
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

function createGrokCliHook(command: string): Record<string, unknown> {
  return {
    matcher: "bash",
    hooks: [
      {
        type: "command",
        command,
        timeout: 30,
      },
    ],
  };
}

export async function installGrokCliHook(
  settingsPath = getDefaultSettingsPath(),
  options: GrokCliHookCommandOptions = {},
): Promise<InstallGrokCliHookResult> {
  const { config, backupPath } = await loadGrokCliSettingsWithBackup(settingsPath);
  const command = await buildTokenjuiceHookCommand(TOKENJUICE_GROK_CLI_SUBCOMMAND, "grok-cli", options);
  removeTokenjuiceGrokCliHooks(config);
  config.hooks.PostToolUse = [...getPostToolUseHooks(config), createGrokCliHook(command)];
  await writeGrokCliSettings(settingsPath, config);
  return {
    settingsPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
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
  options: GrokCliHookCommandOptions = {},
): Promise<GrokCliDoctorReport> {
  const expectedCommand = await buildTokenjuiceHookCommand(TOKENJUICE_GROK_CLI_SUBCOMMAND, "grok-cli", options);
  const { config, exists } = await readGrokCliSettings(settingsPath);
  const detectedCommand = findTokenjuiceGrokCliHookCommand(config);

  return {
    settingsPath,
    ...(await buildHookCommandDoctorFields({
      expectedCommand,
      detectedCommand: exists ? detectedCommand : undefined,
      disabledIssue: "tokenjuice PostToolUse hook is not installed for Grok CLI",
      hostLabel: "Grok CLI",
      advisory: detectedCommand ? TOKENJUICE_GROK_CLI_ADVISORY : TOKENJUICE_GROK_CLI_DISABLED_ADVISORY,
      fixCommand: TOKENJUICE_GROK_CLI_FIX_COMMAND,
    })),
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

function readGrokCliOutputText(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  if (!isRecord(output)) {
    return "";
  }
  return readStringField(output, ["output", "error", "text", "content", "result", "stdout"]) ?? "";
}

function readPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function commandRequestsTokenjuiceRawBypass(command: string): boolean {
  let argv: string[];
  try {
    argv = parseShellWords(stripLeadingCdPrefix(command));
  } catch {
    return false;
  }
  if (argv.length < 3) {
    return false;
  }

  const first = argv[0];
  const wrapIndex = typeof first === "string" && isTokenjuiceExecutablePath(first) ? 1 : -1;

  if (wrapIndex === -1 || argv[wrapIndex] !== "wrap") {
    return false;
  }

  const optionEndIndex = argv.indexOf("--", wrapIndex + 1);
  if (optionEndIndex === -1) {
    return false;
  }

  const optionArgs = argv.slice(wrapIndex + 1, optionEndIndex);
  return optionArgs.includes("--raw") || optionArgs.includes("--full");
}

export async function runGrokCliPostToolUseHook(rawText: string): Promise<number> {
  let payload: GrokCliPostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as GrokCliPostToolUsePayload;
  } catch {
    writeEmptyHookJsonLine();
    return 0;
  }

  if (
    (payload.hook_event_name !== undefined && payload.hook_event_name !== "PostToolUse")
    || payload.tool_name !== "bash"
  ) {
    writeEmptyHookJsonLine();
    return 0;
  }

  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : undefined;
  const command = toolInput ? readStringField(toolInput, ["command", "cmd"]) : undefined;
  const toolOutput = isRecord(payload.tool_output) ? payload.tool_output : undefined;
  if (toolOutput?.success !== true) {
    writeEmptyHookJsonLine();
    return 0;
  }
  const visibleText = readGrokCliOutputText(payload.tool_output);
  if (!command || !visibleText.trim()) {
    writeEmptyHookJsonLine();
    return 0;
  }

  if (commandRequestsTokenjuiceRawBypass(command)) {
    writeEmptyHookJsonLine();
    return 0;
  }

  try {
    const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_GROK_CLI_MAX_INLINE_CHARS");
    const outcome = await compactBashResult({
      source: "grok-cli",
      command,
      visibleText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      inspectionPolicy: "allow-safe-inventory",
      metadata: { source: "grok-cli-post-tool-use" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.action === "keep") {
      writeEmptyHookJsonLine();
      return 0;
    }

    writeHookJsonLine({
      additionalContext: buildCompactedOutputContext(outcome.result.inlineText),
    });
    return 0;
  } catch {
    writeEmptyHookJsonLine();
    return 0;
  }
}
