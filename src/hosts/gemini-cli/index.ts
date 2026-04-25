import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import {
  buildTokenjuiceHookCommand,
  type TokenjuiceHookCommandOptions,
} from "../shared/host-command.js";
import { buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { buildCompactedOutputContext } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";

export type GeminiCliHookCommandOptions = TokenjuiceHookCommandOptions;

export type InstallGeminiCliHookResult = {
  settingsPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallGeminiCliHookResult = {
  settingsPath: string;
  removed: number;
};

export type GeminiCliDoctorReport = {
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

type GeminiSettings = Record<string, unknown> & {
  hooks: Record<string, unknown>;
};

type GeminiCliAfterToolPayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
  tool_response?: unknown;
  cwd?: unknown;
};

const TOKENJUICE_GEMINI_CLI_SUBCOMMAND = "gemini-cli-after-tool";
const TOKENJUICE_GEMINI_CLI_FIX_COMMAND = "tokenjuice install gemini-cli";
const TOKENJUICE_GEMINI_CLI_DISABLED_ADVISORY = "Gemini CLI support is beta; verify live hook behavior after install.";
const TOKENJUICE_GEMINI_CLI_ADVISORY = "Gemini CLI support is beta; AfterTool replacement depends on current hook semantics.";

function getGeminiCliHome(): string {
  return process.env.GEMINI_HOME || join(homedir(), ".gemini");
}

function getDefaultSettingsPath(): string {
  return join(getGeminiCliHome(), "settings.json");
}

function sanitizeGeminiSettings(raw: unknown): GeminiSettings {
  if (!isRecord(raw)) {
    return { hooks: {} };
  }
  return {
    ...raw,
    hooks: isRecord(raw.hooks) ? { ...raw.hooks } : {},
  };
}

async function readGeminiSettings(settingsPath: string): Promise<{ config: GeminiSettings; exists: boolean }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    return { config: sanitizeGeminiSettings(JSON.parse(rawText) as unknown), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} }, exists: false };
    }
    throw error;
  }
}

async function loadGeminiSettingsWithBackup(settingsPath: string): Promise<{ config: GeminiSettings; backupPath?: string }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const backupPath = `${settingsPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config: sanitizeGeminiSettings(JSON.parse(rawText) as unknown), backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} } };
    }
    throw error;
  }
}

async function writeGeminiSettings(settingsPath: string, config: GeminiSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, settingsPath);
}

function isTokenjuiceGeminiHook(entry: unknown): boolean {
  return isRecord(entry)
    && typeof entry.command === "string"
    && entry.command.includes(TOKENJUICE_GEMINI_CLI_SUBCOMMAND);
}

function getAfterToolHooks(config: GeminiSettings): unknown[] {
  const afterTool = config.hooks.AfterTool;
  return Array.isArray(afterTool) ? afterTool : [];
}

function findTokenjuiceGeminiHookCommand(config: GeminiSettings): string | undefined {
  for (const group of getAfterToolHooks(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }
    for (const hook of group.hooks) {
      if (isTokenjuiceGeminiHook(hook)) {
        return (hook as { command: string }).command;
      }
    }
  }
  return undefined;
}

function removeTokenjuiceGeminiHooks(config: GeminiSettings): number {
  let removed = 0;
  const retainedGroups: unknown[] = [];
  for (const group of getAfterToolHooks(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      retainedGroups.push(group);
      continue;
    }
    const retainedHooks = group.hooks.filter((hook) => {
      const remove = isTokenjuiceGeminiHook(hook);
      if (remove) {
        removed += 1;
      }
      return !remove;
    });
    if (retainedHooks.length > 0) {
      retainedGroups.push({ ...group, hooks: retainedHooks });
    }
  }
  config.hooks.AfterTool = retainedGroups;
  return removed;
}

function createGeminiCliHook(command: string): Record<string, unknown> {
  return {
    matcher: "run_shell_command",
    sequential: true,
    hooks: [
      {
        type: "command",
        name: "tokenjuice",
        command,
        timeout: 60000,
        description: "Compact noisy shell output before it returns to Gemini CLI.",
      },
    ],
  };
}

export async function installGeminiCliHook(
  settingsPath = getDefaultSettingsPath(),
  options: GeminiCliHookCommandOptions = {},
): Promise<InstallGeminiCliHookResult> {
  const { config, backupPath } = await loadGeminiSettingsWithBackup(settingsPath);
  const command = await buildTokenjuiceHookCommand(TOKENJUICE_GEMINI_CLI_SUBCOMMAND, "gemini-cli", options);
  removeTokenjuiceGeminiHooks(config);
  config.hooks.AfterTool = [...getAfterToolHooks(config), createGeminiCliHook(command)];
  await writeGeminiSettings(settingsPath, config);
  return {
    settingsPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallGeminiCliHook(settingsPath = getDefaultSettingsPath()): Promise<UninstallGeminiCliHookResult> {
  const { config } = await readGeminiSettings(settingsPath);
  const removed = removeTokenjuiceGeminiHooks(config);
  if (removed > 0) {
    await writeGeminiSettings(settingsPath, config);
  }
  return { settingsPath, removed };
}

export async function doctorGeminiCliHook(
  settingsPath = getDefaultSettingsPath(),
  options: GeminiCliHookCommandOptions = {},
): Promise<GeminiCliDoctorReport> {
  const expectedCommand = await buildTokenjuiceHookCommand(TOKENJUICE_GEMINI_CLI_SUBCOMMAND, "gemini-cli", options);
  const { config, exists } = await readGeminiSettings(settingsPath);
  const detectedCommand = findTokenjuiceGeminiHookCommand(config);

  return {
    settingsPath,
    ...(await buildHookCommandDoctorFields({
      expectedCommand,
      detectedCommand: exists ? detectedCommand : undefined,
      disabledIssue: "tokenjuice AfterTool hook is not installed for Gemini CLI",
      hostLabel: "Gemini CLI",
      advisory: detectedCommand ? TOKENJUICE_GEMINI_CLI_ADVISORY : TOKENJUICE_GEMINI_CLI_DISABLED_ADVISORY,
      fixCommand: TOKENJUICE_GEMINI_CLI_FIX_COMMAND,
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

function readGeminiOutputText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }
  if (!isRecord(response)) {
    return "";
  }
  const direct = readStringField(response, ["llmContent", "returnDisplay", "text", "content", "output"]);
  if (direct) {
    return direct;
  }
  return "";
}

function readPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function runGeminiCliAfterToolHook(rawText: string): Promise<number> {
  let payload: GeminiCliAfterToolPayload;
  try {
    payload = JSON.parse(rawText) as GeminiCliAfterToolPayload;
  } catch {
    process.stdout.write("{}\n");
    return 0;
  }

  if (payload.hook_event_name !== "AfterTool" || payload.tool_name !== "run_shell_command") {
    process.stdout.write("{}\n");
    return 0;
  }

  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : undefined;
  const command = toolInput ? readStringField(toolInput, ["command", "cmd"]) : undefined;
  const visibleText = readGeminiOutputText(payload.tool_response);
  if (!command || !visibleText.trim()) {
    process.stdout.write("{}\n");
    return 0;
  }

  try {
    const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_GEMINI_CLI_MAX_INLINE_CHARS");
    const outcome = await compactBashResult({
      source: "gemini-cli",
      command,
      visibleText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      inspectionPolicy: "allow-safe-inventory",
      metadata: { source: "gemini-cli-after-tool" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.action === "keep") {
      process.stdout.write("{}\n");
      return 0;
    }

    process.stdout.write(`${JSON.stringify({
      decision: "deny",
      reason: buildCompactedOutputContext(outcome.result.inlineText),
      suppressOutput: true,
    })}\n`);
    return 0;
  } catch {
    process.stdout.write("{}\n");
    return 0;
  }
}
