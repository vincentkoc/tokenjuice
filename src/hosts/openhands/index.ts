import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import {
  buildTokenjuiceHookCommand,
  findMissingHookCommandPaths,
  type TokenjuiceHookCommandOptions,
} from "../shared/host-command.js";
import { buildCompactedOutputContext } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";

export type OpenHandsHookCommandOptions = TokenjuiceHookCommandOptions & {
  projectDir?: string;
};

export type InstallOpenHandsHookResult = {
  hooksPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallOpenHandsHookResult = {
  hooksPath: string;
  removed: number;
};

export type OpenHandsDoctorReport = {
  hooksPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  checkedPaths: string[];
  missingPaths: string[];
};

type OpenHandsHooksConfig = Record<string, unknown> & {
  post_tool_use: unknown[];
};

type OpenHandsPostToolUsePayload = {
  event_type?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
  tool_response?: unknown;
  working_dir?: unknown;
};

const TOKENJUICE_OPENHANDS_SUBCOMMAND = "openhands-post-tool-use";
const TOKENJUICE_OPENHANDS_FIX_COMMAND = "tokenjuice install openhands";

function getProjectDir(options: OpenHandsHookCommandOptions = {}): string {
  return options.projectDir || process.env.OPENHANDS_PROJECT_DIR || process.cwd();
}

function getDefaultHooksPath(options: OpenHandsHookCommandOptions = {}): string {
  return join(getProjectDir(options), ".openhands", "hooks.json");
}

function sanitizeOpenHandsHooksConfig(raw: unknown): OpenHandsHooksConfig {
  if (!isRecord(raw)) {
    return { post_tool_use: [] };
  }
  return {
    ...raw,
    post_tool_use: Array.isArray(raw.post_tool_use) ? [...raw.post_tool_use] : [],
  };
}

async function readOpenHandsHooksConfig(hooksPath: string): Promise<{ config: OpenHandsHooksConfig; exists: boolean }> {
  try {
    const rawText = await readFile(hooksPath, "utf8");
    return { config: sanitizeOpenHandsHooksConfig(JSON.parse(rawText) as unknown), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { post_tool_use: [] }, exists: false };
    }
    throw error;
  }
}

async function loadOpenHandsHooksConfigWithBackup(hooksPath: string): Promise<{ config: OpenHandsHooksConfig; backupPath?: string }> {
  try {
    const rawText = await readFile(hooksPath, "utf8");
    const backupPath = `${hooksPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config: sanitizeOpenHandsHooksConfig(JSON.parse(rawText) as unknown), backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { post_tool_use: [] } };
    }
    throw error;
  }
}

async function writeOpenHandsHooksConfig(hooksPath: string, config: OpenHandsHooksConfig): Promise<void> {
  await mkdir(dirname(hooksPath), { recursive: true });
  const tempPath = `${hooksPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, hooksPath);
}

function isTokenjuiceOpenHandsHook(hook: unknown): boolean {
  return isRecord(hook)
    && typeof hook.command === "string"
    && hook.command.includes(TOKENJUICE_OPENHANDS_SUBCOMMAND);
}

function findTokenjuiceOpenHandsHookCommand(config: OpenHandsHooksConfig): string | undefined {
  for (const group of config.post_tool_use) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }
    for (const hook of group.hooks) {
      if (isTokenjuiceOpenHandsHook(hook)) {
        return (hook as { command: string }).command;
      }
    }
  }
  return undefined;
}

function removeTokenjuiceOpenHandsHooks(config: OpenHandsHooksConfig): number {
  let removed = 0;
  const retainedGroups: unknown[] = [];
  for (const group of config.post_tool_use) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      retainedGroups.push(group);
      continue;
    }
    const retainedHooks = group.hooks.filter((hook) => {
      const remove = isTokenjuiceOpenHandsHook(hook);
      if (remove) {
        removed += 1;
      }
      return !remove;
    });
    if (retainedHooks.length > 0) {
      retainedGroups.push({ ...group, hooks: retainedHooks });
    }
  }
  config.post_tool_use = retainedGroups;
  return removed;
}

function createOpenHandsHook(command: string): Record<string, unknown> {
  return {
    matcher: "terminal",
    hooks: [
      {
        type: "command",
        command,
        timeout: 60,
      },
    ],
  };
}

export async function installOpenHandsHook(
  hooksPath?: string,
  options: OpenHandsHookCommandOptions = {},
): Promise<InstallOpenHandsHookResult> {
  const resolvedHooksPath = hooksPath ?? getDefaultHooksPath(options);
  const { config, backupPath } = await loadOpenHandsHooksConfigWithBackup(resolvedHooksPath);
  const command = await buildTokenjuiceHookCommand(TOKENJUICE_OPENHANDS_SUBCOMMAND, "openhands", options);
  removeTokenjuiceOpenHandsHooks(config);
  config.post_tool_use = [...config.post_tool_use, createOpenHandsHook(command)];
  await writeOpenHandsHooksConfig(resolvedHooksPath, config);
  return {
    hooksPath: resolvedHooksPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallOpenHandsHook(hooksPath = getDefaultHooksPath()): Promise<UninstallOpenHandsHookResult> {
  const { config } = await readOpenHandsHooksConfig(hooksPath);
  const removed = removeTokenjuiceOpenHandsHooks(config);
  if (removed > 0) {
    await writeOpenHandsHooksConfig(hooksPath, config);
  }
  return { hooksPath, removed };
}

export async function doctorOpenHandsHook(
  hooksPath?: string,
  options: OpenHandsHookCommandOptions = {},
): Promise<OpenHandsDoctorReport> {
  const resolvedHooksPath = hooksPath ?? getDefaultHooksPath(options);
  const expectedCommand = await buildTokenjuiceHookCommand(TOKENJUICE_OPENHANDS_SUBCOMMAND, "openhands", options);
  const { config, exists } = await readOpenHandsHooksConfig(resolvedHooksPath);
  const detectedCommand = findTokenjuiceOpenHandsHookCommand(config);
  if (!exists || !detectedCommand) {
    return {
      hooksPath: resolvedHooksPath,
      status: "disabled",
      issues: ["tokenjuice PostToolUse hook is not installed for OpenHands"],
      advisories: ["OpenHands support is beta and currently injects compacted context without suppressing the original tool result."],
      fixCommand: TOKENJUICE_OPENHANDS_FIX_COMMAND,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const missingPaths = await findMissingHookCommandPaths(detectedCommand);
  const issues: string[] = [];
  if (detectedCommand !== expectedCommand) {
    issues.push("configured OpenHands hook command does not match the current recommended command");
  }
  if (missingPaths.length > 0) {
    issues.push(`configured OpenHands hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
  }

  return {
    hooksPath: resolvedHooksPath,
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: ["OpenHands support is beta and currently injects compacted context without suppressing the original tool result."],
    fixCommand: TOKENJUICE_OPENHANDS_FIX_COMMAND,
    expectedCommand,
    detectedCommand,
    checkedPaths: [],
    missingPaths,
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

function readOpenHandsOutputText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }
  if (!isRecord(response)) {
    return "";
  }
  return readStringField(response, ["output", "text", "content", "result", "llmContent"]) ?? "";
}

export async function runOpenHandsPostToolUseHook(rawText: string): Promise<number> {
  let payload: OpenHandsPostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as OpenHandsPostToolUsePayload;
  } catch {
    process.stdout.write("{}\n");
    return 0;
  }

  if (payload.event_type !== "PostToolUse" || payload.tool_name !== "terminal") {
    process.stdout.write("{}\n");
    return 0;
  }

  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : undefined;
  const command = toolInput ? readStringField(toolInput, ["command", "cmd"]) : undefined;
  const visibleText = readOpenHandsOutputText(payload.tool_response);
  if (!command || !visibleText.trim()) {
    process.stdout.write("{}\n");
    return 0;
  }

  try {
    const outcome = await compactBashResult({
      source: "openhands",
      command,
      visibleText,
      ...(typeof payload.working_dir === "string" && payload.working_dir.trim() ? { cwd: payload.working_dir } : {}),
      inspectionPolicy: "allow-safe-inventory",
      metadata: { source: "openhands-post-tool-use" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.action === "keep") {
      process.stdout.write("{}\n");
      return 0;
    }

    process.stdout.write(`${JSON.stringify({
      additionalContext: buildCompactedOutputContext(outcome.result.inlineText),
    })}\n`);
    return 0;
  } catch {
    process.stdout.write("{}\n");
    return 0;
  }
}
