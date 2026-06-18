import { constants as fsConstants } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import {
  buildTokenjuiceHookCommand,
  type TokenjuiceHookCommandOptions,
} from "../shared/host-command.js";
import { buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { buildCompactedOutputContext } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";

export type KimiHookCommandOptions = TokenjuiceHookCommandOptions & {
  configDir?: string;
};

export type InstallKimiHookResult = {
  configPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallKimiHookResult = {
  configPath: string;
  removed: number;
};

export type KimiDoctorReport = {
  configPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  hasTokenjuiceMarker: boolean;
  checkedPaths: string[];
  missingPaths: string[];
};

type KimiPostToolUsePayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
  tool_output?: unknown;
  cwd?: unknown;
};

const TOKENJUICE_KIMI_SUBCOMMAND = "kimi-post-tool-use";
const TOKENJUICE_KIMI_FIX_COMMAND = "tokenjuice install kimi";
const TOKENJUICE_KIMI_BEGIN = "# tokenjuice:kimi begin";
const TOKENJUICE_KIMI_END = "# tokenjuice:kimi end";
const TOKENJUICE_KIMI_ADVISORY =
  "Kimi support is beta and injects compacted context after Shell tool output without suppressing the original result.";
const TOKENJUICE_KIMI_DISABLED_ADVISORY = "Kimi support is beta; verify live PostToolUse behavior after install.";

function getKimiConfigDir(options: KimiHookCommandOptions = {}): string {
  return options.configDir || process.env.KIMI_SHARE_DIR || process.env.KIMI_HOME || join(homedir(), ".kimi");
}

function getDefaultConfigPath(options: KimiHookCommandOptions = {}): string {
  return join(getKimiConfigDir(options), "config.toml");
}

function getLegacyJsonConfigPath(configPath: string): string {
  return join(dirname(configPath), "config.json");
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function createKimiHookBlock(command: string): string {
  return [
    TOKENJUICE_KIMI_BEGIN,
    "[[hooks]]",
    'event = "PostToolUse"',
    'matcher = "Shell"',
    `command = ${tomlString(command)}`,
    "timeout = 30",
    TOKENJUICE_KIMI_END,
  ].join("\n");
}

async function readConfig(configPath: string): Promise<{ text: string; exists: boolean }> {
  try {
    return { text: await readFile(configPath, "utf8"), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { text: "", exists: false };
    }
    throw error;
  }
}

function hasMalformedMarkerStructure(text: string): boolean {
  let offset = 0;
  let hasOpenBlock = false;
  while (offset < text.length) {
    const beginIndex = text.indexOf(TOKENJUICE_KIMI_BEGIN, offset);
    const endIndex = text.indexOf(TOKENJUICE_KIMI_END, offset);
    if (beginIndex === -1 && endIndex === -1) {
      break;
    }
    if (beginIndex !== -1 && (endIndex === -1 || beginIndex < endIndex)) {
      if (hasOpenBlock) {
        return true;
      }
      hasOpenBlock = true;
      offset = beginIndex + TOKENJUICE_KIMI_BEGIN.length;
    } else {
      if (!hasOpenBlock) {
        return true;
      }
      hasOpenBlock = false;
      offset = endIndex + TOKENJUICE_KIMI_END.length;
    }
  }
  return hasOpenBlock;
}

function removeKimiHookBlock(text: string): { text: string; removed: number } {
  let remaining = text;
  let removed = 0;
  while (true) {
    const beginIndex = remaining.indexOf(TOKENJUICE_KIMI_BEGIN);
    if (beginIndex === -1) {
      break;
    }
    const endIndex = remaining.indexOf(TOKENJUICE_KIMI_END, beginIndex + TOKENJUICE_KIMI_BEGIN.length);
    if (endIndex === -1) {
      break;
    }
    const afterEndIndex = endIndex + TOKENJUICE_KIMI_END.length;
    const nextIndex = remaining[afterEndIndex] === "\n" ? afterEndIndex + 1 : afterEndIndex;
    remaining = `${remaining.slice(0, beginIndex)}${remaining.slice(nextIndex)}`;
    removed += 1;
  }
  return { text: remaining.trimEnd(), removed };
}

function appendKimiHookBlock(text: string, command: string): string {
  const withoutTokenjuice = removeKimiHookBlock(text).text;
  return `${withoutTokenjuice}${withoutTokenjuice ? "\n\n" : ""}${createKimiHookBlock(command)}\n`;
}

async function writeConfig(configPath: string, text: string): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true, mode: fsConstants.S_IRWXU });
  const tempPath = `${configPath}.tmp`;
  await writeFile(tempPath, text, {
    encoding: "utf8",
    mode: fsConstants.S_IRUSR | fsConstants.S_IWUSR,
  });
  await rename(tempPath, configPath);
  await chmod(configPath, fsConstants.S_IRUSR | fsConstants.S_IWUSR);
}

function getKimiHookBlock(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_KIMI_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_KIMI_END, beginIndex + TOKENJUICE_KIMI_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_KIMI_END.length);
}

function findTokenjuiceKimiHookCommand(text: string): string | undefined {
  const block = getKimiHookBlock(text);
  const match = /^\s*command\s*=\s*("(?:\\.|[^"])*")\s*$/mu.exec(block);
  if (!match?.[1]) {
    return undefined;
  }
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return undefined;
  }
}

export async function installKimiHook(
  configPath?: string,
  options: KimiHookCommandOptions = {},
): Promise<InstallKimiHookResult> {
  const resolvedConfigPath = configPath ?? getDefaultConfigPath(options);
  const existing = await readConfig(resolvedConfigPath);
  if (!existing.exists) {
    const legacyJsonConfigPath = getLegacyJsonConfigPath(resolvedConfigPath);
    const legacyJsonConfig = await readConfig(legacyJsonConfigPath);
    if (legacyJsonConfig.exists) {
      throw new Error(
        `cannot install Kimi hook because ${legacyJsonConfigPath} exists and ${resolvedConfigPath} does not; start Kimi once to migrate config.json to config.toml, then rerun tokenjuice install kimi`,
      );
    }
  }
  if (existing.exists && hasMalformedMarkerStructure(existing.text)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice Kimi markers in ${resolvedConfigPath}; remove the dangling marker manually, then rerun tokenjuice install kimi`,
    );
  }

  const command = await buildTokenjuiceHookCommand(TOKENJUICE_KIMI_SUBCOMMAND, "kimi", options);
  const backupPath = existing.exists ? `${resolvedConfigPath}.bak` : undefined;
  if (backupPath) {
    await writeFile(backupPath, existing.text, {
      encoding: "utf8",
      mode: fsConstants.S_IRUSR | fsConstants.S_IWUSR,
    });
    await chmod(backupPath, fsConstants.S_IRUSR | fsConstants.S_IWUSR);
  }
  await writeConfig(resolvedConfigPath, appendKimiHookBlock(existing.text, command));
  return {
    configPath: resolvedConfigPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallKimiHook(configPath = getDefaultConfigPath()): Promise<UninstallKimiHookResult> {
  const existing = await readConfig(configPath);
  if (!existing.exists) {
    return { configPath, removed: 0 };
  }
  if (hasMalformedMarkerStructure(existing.text)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice Kimi markers in ${configPath}; remove the dangling marker manually, then rerun tokenjuice uninstall kimi`,
    );
  }
  const result = removeKimiHookBlock(existing.text);
  if (result.removed > 0) {
    await writeConfig(configPath, result.text ? `${result.text}\n` : "");
  }
  return { configPath, removed: result.removed };
}

export async function doctorKimiHook(
  configPath?: string,
  options: KimiHookCommandOptions = {},
): Promise<KimiDoctorReport> {
  const resolvedConfigPath = configPath ?? getDefaultConfigPath(options);
  const expectedCommand = await buildTokenjuiceHookCommand(TOKENJUICE_KIMI_SUBCOMMAND, "kimi", options);
  const existing = await readConfig(resolvedConfigPath);
  const hasTokenjuiceMarker = existing.text.includes(TOKENJUICE_KIMI_BEGIN) || existing.text.includes(TOKENJUICE_KIMI_END);
  const detectedCommand = existing.exists ? findTokenjuiceKimiHookCommand(existing.text) : undefined;
  const fields = await buildHookCommandDoctorFields({
    expectedCommand,
    detectedCommand,
    disabledIssue: "tokenjuice PostToolUse hook is not installed for Kimi",
    hostLabel: "Kimi",
    advisory: detectedCommand ? TOKENJUICE_KIMI_ADVISORY : TOKENJUICE_KIMI_DISABLED_ADVISORY,
    fixCommand: hasMalformedMarkerStructure(existing.text)
      ? "remove unmatched tokenjuice Kimi markers from config.toml, then run tokenjuice install kimi"
      : TOKENJUICE_KIMI_FIX_COMMAND,
  });
  if (existing.exists && hasMalformedMarkerStructure(existing.text)) {
    return {
      configPath: resolvedConfigPath,
      ...fields,
      hasTokenjuiceMarker,
      status: "broken",
      issues: ["configured Kimi config has unmatched tokenjuice markers", ...fields.issues],
    };
  }
  return {
    configPath: resolvedConfigPath,
    ...fields,
    hasTokenjuiceMarker,
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

function readKimiOutputText(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  if (Array.isArray(output)) {
    return output.map(readKimiOutputText).filter(Boolean).join("\n");
  }
  if (!isRecord(output)) {
    return "";
  }
  return readStringField(output, ["output", "stdout", "stderr", "text", "content", "result"]) ?? "";
}

function readPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function runKimiPostToolUseHook(rawText: string): Promise<number> {
  let payload: KimiPostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as KimiPostToolUsePayload;
  } catch {
    return 0;
  }

  if (payload.hook_event_name !== "PostToolUse" || payload.tool_name !== "Shell") {
    return 0;
  }

  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : undefined;
  const command = toolInput ? readStringField(toolInput, ["command", "cmd"]) : undefined;
  const visibleText = readKimiOutputText(payload.tool_output);
  if (!command || !visibleText.trim()) {
    return 0;
  }

  try {
    const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_KIMI_MAX_INLINE_CHARS");
    const outcome = await compactBashResult({
      source: "kimi",
      command,
      visibleText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      inspectionPolicy: "allow-safe-inventory",
      metadata: { source: "kimi-post-tool-use" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.action !== "keep") {
      process.stdout.write(`${buildCompactedOutputContext(outcome.result.inlineText)}\n`);
    }
    return 0;
  } catch {
    return 0;
  }
}
