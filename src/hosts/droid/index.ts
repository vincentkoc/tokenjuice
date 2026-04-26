import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { stripLeadingCdPrefix } from "../../core/command.js";
import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import {
  buildTokenjuiceHookCommand,
  type TokenjuiceHookCommandOptions,
} from "../shared/host-command.js";
import { buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { isTokenjuiceExecutablePath, parseShellWords } from "../shared/hook-command.js";
import { buildCompactedOutputContext, writeEmptyHookJsonLine, writeHookJsonLine } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";

export type DroidHookCommandOptions = TokenjuiceHookCommandOptions;

export type InstallDroidHookResult = {
  settingsPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallDroidHookResult = {
  settingsPath: string;
  removed: number;
};

export type DroidDoctorReport = {
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

type FactorySettings = Record<string, unknown> & {
  hooks: Record<string, unknown>;
};

type DroidPostToolUsePayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: {
    command?: unknown;
  };
  tool_response?: unknown;
  cwd?: unknown;
};

const TOKENJUICE_DROID_SUBCOMMAND = "droid-post-tool-use";
const TOKENJUICE_DROID_FIX_COMMAND = "tokenjuice install droid";
const TOKENJUICE_DROID_ADVISORY = "Droid PostToolUse hook compacts Execute shell output before it returns to the agent.";
const TOKENJUICE_DROID_DISABLED_ADVISORY = "Droid PostToolUse hook is not installed.";

function getFactoryHome(): string {
  return process.env.FACTORY_HOME || join(homedir(), ".factory");
}

function getDefaultSettingsPath(): string {
  return join(getFactoryHome(), "settings.json");
}

function sanitizeFactorySettings(raw: unknown): FactorySettings {
  if (!isRecord(raw)) {
    return { hooks: {} };
  }
  return {
    ...raw,
    hooks: isRecord(raw.hooks) ? { ...raw.hooks } : {},
  };
}

async function readFactorySettings(settingsPath: string): Promise<{ config: FactorySettings; exists: boolean }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    return { config: sanitizeFactorySettings(JSON.parse(rawText) as unknown), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} }, exists: false };
    }
    throw error;
  }
}

async function loadFactorySettingsWithBackup(settingsPath: string): Promise<{ config: FactorySettings; backupPath?: string }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const backupPath = `${settingsPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config: sanitizeFactorySettings(JSON.parse(rawText) as unknown), backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} } };
    }
    throw error;
  }
}

async function writeFactorySettings(settingsPath: string, config: FactorySettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, settingsPath);
}

function isTokenjuiceDroidHook(entry: unknown): boolean {
  return isRecord(entry)
    && typeof entry.command === "string"
    && entry.command.includes(TOKENJUICE_DROID_SUBCOMMAND);
}

function getPostToolUseGroups(config: FactorySettings): unknown[] {
  const postToolUse = config.hooks.PostToolUse;
  return Array.isArray(postToolUse) ? postToolUse : [];
}

function findTokenjuiceDroidHookCommand(config: FactorySettings): string | undefined {
  for (const group of getPostToolUseGroups(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }
    for (const hook of group.hooks) {
      if (isTokenjuiceDroidHook(hook)) {
        return (hook as { command: string }).command;
      }
    }
  }
  return undefined;
}

function removeTokenjuiceDroidHooks(config: FactorySettings): number {
  let removed = 0;
  const retainedGroups: unknown[] = [];
  for (const group of getPostToolUseGroups(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      retainedGroups.push(group);
      continue;
    }
    const retainedHooks = group.hooks.filter((hook) => {
      const shouldRemove = isTokenjuiceDroidHook(hook);
      if (shouldRemove) {
        removed += 1;
      }
      return !shouldRemove;
    });
    if (retainedHooks.length > 0) {
      retainedGroups.push({ ...group, hooks: retainedHooks });
    }
  }
  if (retainedGroups.length > 0) {
    config.hooks.PostToolUse = retainedGroups;
  } else {
    delete config.hooks.PostToolUse;
  }
  return removed;
}

function createDroidPostToolUseHook(command: string): Record<string, unknown> {
  return {
    matcher: "Execute",
    hooks: [
      {
        type: "command",
        command,
        timeout: 60,
      },
    ],
  };
}

export async function installDroidHook(
  settingsPath = getDefaultSettingsPath(),
  options: DroidHookCommandOptions = {},
): Promise<InstallDroidHookResult> {
  const { config, backupPath } = await loadFactorySettingsWithBackup(settingsPath);
  const command = await buildTokenjuiceHookCommand(TOKENJUICE_DROID_SUBCOMMAND, "droid", options);
  removeTokenjuiceDroidHooks(config);
  const postToolUse = getPostToolUseGroups(config);
  config.hooks.PostToolUse = [...postToolUse, createDroidPostToolUseHook(command)];
  await writeFactorySettings(settingsPath, config);
  return {
    settingsPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallDroidHook(
  settingsPath = getDefaultSettingsPath(),
): Promise<UninstallDroidHookResult> {
  const { config, exists } = await readFactorySettings(settingsPath);
  if (!exists) {
    return { settingsPath, removed: 0 };
  }
  const removed = removeTokenjuiceDroidHooks(config);
  if (removed > 0) {
    await writeFactorySettings(settingsPath, config);
  }
  return { settingsPath, removed };
}

export async function doctorDroidHook(
  settingsPath = getDefaultSettingsPath(),
  options: DroidHookCommandOptions = {},
): Promise<DroidDoctorReport> {
  const expectedCommand = await buildTokenjuiceHookCommand(TOKENJUICE_DROID_SUBCOMMAND, "droid", options);
  const { config, exists } = await readFactorySettings(settingsPath);
  const detectedCommand = exists ? findTokenjuiceDroidHookCommand(config) : undefined;

  return {
    settingsPath,
    ...(await buildHookCommandDoctorFields({
      expectedCommand,
      detectedCommand,
      disabledIssue: "tokenjuice PostToolUse hook is not installed for Droid",
      hostLabel: "Droid",
      advisory: detectedCommand ? TOKENJUICE_DROID_ADVISORY : TOKENJUICE_DROID_DISABLED_ADVISORY,
      fixCommand: TOKENJUICE_DROID_FIX_COMMAND,
    })),
  };
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

function readPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function shouldStoreFromEnv(): boolean {
  const value = process.env.TOKENJUICE_DROID_STORE;
  return value === "1" || value === "true" || value === "TRUE" || value === "yes" || value === "YES";
}

function stringifyToolResponse(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => stringifyToolResponse(entry))
      .filter(Boolean)
      .join("\n");
  }
  if (isRecord(value)) {
    for (const key of ["output", "text", "stdout", "stderr", "combinedText"]) {
      const text = value[key];
      if (typeof text === "string" && text) {
        return text;
      }
    }
    return JSON.stringify(value);
  }
  return String(value);
}

async function writeHookDebug(record: Record<string, unknown>): Promise<void> {
  const debugPath = join(getFactoryHome(), "tokenjuice-hook.last.json");
  await mkdir(dirname(debugPath), { recursive: true });
  await writeFile(debugPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function runDroidPostToolUseHook(rawText: string): Promise<number> {
  let payload: DroidPostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as DroidPostToolUsePayload;
  } catch {
    writeEmptyHookJsonLine();
    return 0;
  }

  const command = typeof payload.tool_input?.command === "string" ? payload.tool_input.command : undefined;
  const debug: Record<string, unknown> = {
    hookEvent: payload.hook_event_name,
    toolName: payload.tool_name,
    command,
    rewrote: false,
  };

  if (payload.hook_event_name !== "PostToolUse") {
    await writeHookDebug({ ...debug, skipped: "non-post-tool-use" });
    writeEmptyHookJsonLine();
    return 0;
  }
  if (payload.tool_name !== "Execute") {
    await writeHookDebug({ ...debug, skipped: "non-execute" });
    writeEmptyHookJsonLine();
    return 0;
  }
  if (typeof command !== "string" || !command.trim()) {
    await writeHookDebug({ ...debug, skipped: "missing-command" });
    writeEmptyHookJsonLine();
    return 0;
  }

  const visibleText = stringifyToolResponse(payload.tool_response);
  if (!visibleText.trim()) {
    await writeHookDebug({ ...debug, skipped: "empty-tool-response" });
    writeEmptyHookJsonLine();
    return 0;
  }

  const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_DROID_MAX_INLINE_CHARS");

  if (commandRequestsTokenjuiceRawBypass(command)) {
    await writeHookDebug({ ...debug, skipped: "explicit-raw-bypass" });
    writeEmptyHookJsonLine();
    return 0;
  }

  try {
    const outcome = await compactBashResult({
      source: "droid",
      command,
      visibleText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      inspectionPolicy: "allow-safe-inventory",
      storeRaw: shouldStoreFromEnv(),
      metadata: { source: "droid-post-tool-use" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.result) {
      debug.rawChars = outcome.result.stats.rawChars;
      debug.reducedChars = outcome.result.stats.reducedChars;
      debug.matchedReducer = outcome.result.classification.matchedReducer;
    }

    if (outcome.action === "keep") {
      await writeHookDebug({ ...debug, skipped: outcome.reason });
      writeEmptyHookJsonLine();
      return 0;
    }

    writeHookJsonLine({
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: buildCompactedOutputContext(outcome.result.inlineText),
      },
    });
    await writeHookDebug({ ...debug, rewrote: true });
    return 0;
  } catch (error) {
    await writeHookDebug({
      ...debug,
      skipped: "hook-error",
      error: error instanceof Error ? error.message : String(error),
    });
    writeEmptyHookJsonLine();
    return 0;
  }
}
