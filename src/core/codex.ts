import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";

import { isCompoundShellCommand } from "./command.js";
import { reduceExecution } from "./reduce.js";

import type { CompactResult, ReduceOptions } from "../types.js";

type CodexHookCommand = {
  type: "command";
  command: string;
  statusMessage?: string;
  timeout?: number;
};

type CodexHookMatcherGroup = {
  matcher?: string;
  hooks: CodexHookCommand[];
};

type CodexHooksConfig = {
  hooks: Record<string, CodexHookMatcherGroup[]>;
};

type CodexPostToolUsePayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  cwd?: unknown;
  tool_input?: {
    command?: unknown;
  };
  tool_response?: unknown;
};

const GENERIC_FALLBACK_MIN_SAVED_CHARS = 120;
const GENERIC_FALLBACK_MAX_RATIO = 0.75;

export type InstallCodexHookResult = {
  hooksPath: string;
  backupPath?: string;
  command: string;
};

export type CodexHookCommandOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
};

export type CodexDoctorReport = {
  hooksPath: string;
  status: "ok" | "warn" | "broken";
  issues: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_CODEX_STATUS = "compacting bash output with tokenjuice";
const TOKENJUICE_CODEX_FIX_COMMAND = "tokenjuice install codex";

function getCodexHome(): string {
  return process.env.CODEX_HOME || join(homedir(), ".codex");
}

function getDefaultHooksPath(): string {
  return join(getCodexHome(), "hooks.json");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/u.test(value)) {
    return value;
  }
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveInstalledTokenjuicePath(): Promise<string | undefined> {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return undefined;
  }

  const candidateNames = process.platform === "win32"
    ? ["tokenjuice.exe", "tokenjuice.cmd", "tokenjuice.bat", "tokenjuice"]
    : ["tokenjuice"];

  for (const segment of pathValue.split(delimiter)) {
    if (!segment) {
      continue;
    }

    for (const candidateName of candidateNames) {
      const candidatePath = join(segment, candidateName);
      if (await isExecutableFile(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return undefined;
}

async function buildCodexHookCommand(options: CodexHookCommandOptions = {}): Promise<string> {
  const rawBinaryPath = options.binaryPath ?? process.argv[1];
  const binaryPath = rawBinaryPath && !isAbsolute(rawBinaryPath) ? resolve(rawBinaryPath) : rawBinaryPath;
  const nodePath = options.nodePath ?? process.execPath;
  if (!binaryPath) {
    throw new Error("unable to resolve tokenjuice binary path for codex install");
  }

  if (!options.local) {
    const installedBinaryPath = await resolveInstalledTokenjuicePath();
    if (installedBinaryPath) {
      return `${shellQuote(installedBinaryPath)} codex-post-tool-use`;
    }
  }

  if (binaryPath.endsWith(".js")) {
    return `${shellQuote(nodePath)} ${shellQuote(binaryPath)} codex-post-tool-use`;
  }

  return `${shellQuote(binaryPath)} codex-post-tool-use`;
}

function getCodexFixCommand(local = false): string {
  return local ? "tokenjuice install codex --local" : TOKENJUICE_CODEX_FIX_COMMAND;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function createTokenjuiceCodexHook(command: string): CodexHookMatcherGroup {
  return {
    matcher: "^Bash$",
    hooks: [
      {
        type: "command",
        command,
        statusMessage: TOKENJUICE_CODEX_STATUS,
      },
    ],
  };
}

function isTokenjuiceCodexHook(group: CodexHookMatcherGroup): boolean {
  return group.hooks.some((hook) =>
    hook.statusMessage === TOKENJUICE_CODEX_STATUS
    || hook.command.includes("codex-post-tool-use")
    || hook.command.includes("post_tool_use_tokenjuice.py"),
  );
}

function findTokenjuiceCodexHookCommand(config: CodexHooksConfig): string | undefined {
  for (const group of config.hooks.PostToolUse ?? []) {
    if (!isTokenjuiceCodexHook(group)) {
      continue;
    }

    const command = group.hooks.find((hook) =>
      hook.statusMessage === TOKENJUICE_CODEX_STATUS
      || hook.command.includes("codex-post-tool-use")
      || hook.command.includes("post_tool_use_tokenjuice.py"),
    )?.command;
    if (command) {
      return command;
    }
  }

  return undefined;
}

function sanitizeHooksConfig(raw: unknown): CodexHooksConfig {
  if (!isRecord(raw) || !isRecord(raw.hooks)) {
    return { hooks: {} };
  }

  const hooks: Record<string, CodexHookMatcherGroup[]> = {};
  for (const [eventName, groups] of Object.entries(raw.hooks)) {
    if (!Array.isArray(groups)) {
      continue;
    }

    const normalizedGroups = groups.flatMap((group): CodexHookMatcherGroup[] => {
      if (!isRecord(group) || !Array.isArray(group.hooks)) {
        return [];
      }

      const commands = group.hooks.flatMap((hook): CodexHookCommand[] => {
        if (!isRecord(hook) || hook.type !== "command" || typeof hook.command !== "string") {
          return [];
        }

        const normalized: CodexHookCommand = {
          type: "command",
          command: hook.command,
        };
        if (typeof hook.statusMessage === "string" && hook.statusMessage) {
          normalized.statusMessage = hook.statusMessage;
        }
        if (typeof hook.timeout === "number" && Number.isFinite(hook.timeout)) {
          normalized.timeout = hook.timeout;
        }
        return [normalized];
      });

      if (commands.length === 0) {
        return [];
      }

      const normalizedGroup: CodexHookMatcherGroup = {
        hooks: commands,
      };
      if (typeof group.matcher === "string" && group.matcher) {
        normalizedGroup.matcher = group.matcher;
      }
      return [normalizedGroup];
    });

    if (normalizedGroups.length > 0) {
      hooks[eventName] = normalizedGroups;
    }
  }

  return { hooks };
}

async function loadHooksConfig(hooksPath: string): Promise<{ config: CodexHooksConfig; backupPath?: string }> {
  try {
    const rawText = await readFile(hooksPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    const config = sanitizeHooksConfig(parsed);
    const backupPath = `${hooksPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config, backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} } };
    }
    throw new Error(`failed to load codex hooks from ${hooksPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readHooksConfig(hooksPath: string): Promise<{ config: CodexHooksConfig; exists: boolean }> {
  try {
    const rawText = await readFile(hooksPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    return {
      config: sanitizeHooksConfig(parsed),
      exists: true,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        config: { hooks: {} },
        exists: false,
      };
    }
    throw new Error(`failed to read codex hooks from ${hooksPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseShellWords(command: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaping = false;

  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    if (/\s/u.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    words.push(current);
  }

  return words;
}

function extractHookCommandPaths(command: string): string[] {
  const argv = parseShellWords(command);
  if (argv.length === 0) {
    return [];
  }

  const paths = new Set<string>();
  const first = argv[0];
  if (first && (first.includes("/") || first.includes("\\"))) {
    paths.add(first);
  }

  const second = argv[1];
  if (first && second && (first.endsWith("/node") || first.endsWith("\\node.exe")) && second.endsWith(".js")) {
    paths.add(second);
  }

  return [...paths];
}

function commandRequestsTokenjuiceRawBypass(command: string): boolean {
  const argv = parseShellWords(command);
  if (argv.length < 3) {
    return false;
  }

  const first = argv[0];
  const second = argv[1];
  let wrapIndex = -1;
  if (first === "tokenjuice") {
    wrapIndex = 1;
  } else if (
    typeof first === "string"
    && first.endsWith("/node")
    && typeof second === "string"
    && second.endsWith(".js")
    && argv.slice(1).some((part) => part.includes("tokenjuice"))
  ) {
    wrapIndex = 2;
  }

  if (wrapIndex === -1 || argv[wrapIndex] !== "wrap") {
    return false;
  }

  const optionEndIndex = argv.indexOf("--", wrapIndex + 1);
  const optionArgs = argv.slice(wrapIndex + 1, optionEndIndex === -1 ? undefined : optionEndIndex);
  return optionArgs.includes("--raw") || optionArgs.includes("--full");
}

function buildCodexHint(rawRefId?: string): string {
  const hints = [
    "if this compaction looks wrong, rerun with `tokenjuice wrap --raw -- <command>` or `tokenjuice wrap --full -- <command>`.",
  ];
  if (rawRefId) {
    hints.unshift(`tokenjuice stored raw bash output as artifact ${rawRefId}. use \`tokenjuice cat ${rawRefId}\` only if the compacted output is insufficient.`);
  }
  return hints.join(" ");
}

export async function installCodexHook(
  hooksPath = getDefaultHooksPath(),
  options: CodexHookCommandOptions = {},
): Promise<InstallCodexHookResult> {
  const { config, backupPath } = await loadHooksConfig(hooksPath);
  const command = await buildCodexHookCommand(options);
  const postToolUse = config.hooks.PostToolUse ?? [];
  const retained = postToolUse.filter((group) => !isTokenjuiceCodexHook(group));
  retained.push(createTokenjuiceCodexHook(command));
  config.hooks.PostToolUse = retained;

  await mkdir(dirname(hooksPath), { recursive: true });
  const tempPath = `${hooksPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, hooksPath);

  return {
    hooksPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function doctorCodexHook(
  hooksPath = getDefaultHooksPath(),
  options: CodexHookCommandOptions = {},
): Promise<CodexDoctorReport> {
  const expectedCommand = await buildCodexHookCommand(options);
  const fixCommand = getCodexFixCommand(options.local);
  const { config, exists } = await readHooksConfig(hooksPath);
  const detectedCommand = findTokenjuiceCodexHookCommand(config);

  if (!exists) {
    return {
      hooksPath,
      status: "warn",
      issues: ["codex hooks.json is missing"],
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  if (!detectedCommand) {
    return {
      hooksPath,
      status: "warn",
      issues: ["tokenjuice PostToolUse hook is not installed for Codex"],
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const checkedPaths = extractHookCommandPaths(detectedCommand);
  const missingPaths: string[] = [];
  for (const path of checkedPaths) {
    if (!(await isExecutableFile(path)) && !(path.endsWith(".js") && await pathExists(path))) {
      missingPaths.push(path);
    }
  }

  const issues: string[] = [];
  if (detectedCommand !== expectedCommand) {
    if (detectedCommand.includes("/Cellar/")) {
      issues.push("configured Codex hook is pinned to a versioned Homebrew Cellar path");
    } else {
      issues.push("configured Codex hook command does not match the current recommended command");
    }
  }
  if (missingPaths.length > 0) {
    issues.push(`configured Codex hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
  }

  return {
    hooksPath,
    status: missingPaths.length > 0 ? "broken" : issues.length > 0 ? "warn" : "ok",
    issues,
    fixCommand,
    expectedCommand,
    detectedCommand,
    checkedPaths,
    missingPaths,
  };
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
  const value = process.env.TOKENJUICE_CODEX_STORE;
  return value === "1" || value === "true" || value === "TRUE" || value === "yes" || value === "YES";
}

function getCodexRewriteSkipReason(command: string, combinedText: string, result: CompactResult): string | null {
  if (commandRequestsTokenjuiceRawBypass(command)) {
    return "explicit-raw-bypass";
  }

  const inlineText = result.inlineText.trim();
  const rawText = combinedText.trim();
  const rawChars = result.stats.rawChars;
  const reducedChars = result.stats.reducedChars;

  if (!inlineText || inlineText === rawText || reducedChars >= rawChars) {
    return "no-compaction";
  }

  if (result.classification.matchedReducer !== "generic/fallback") {
    return null;
  }

  if (isCompoundShellCommand(command)) {
    return "generic-compound-command";
  }

  const savedChars = rawChars - reducedChars;
  const ratio = rawChars === 0 ? 1 : reducedChars / rawChars;
  if (savedChars < GENERIC_FALLBACK_MIN_SAVED_CHARS || ratio > GENERIC_FALLBACK_MAX_RATIO) {
    return "generic-weak-compaction";
  }

  return null;
}

async function writeHookDebug(record: Record<string, unknown>): Promise<void> {
  const debugPath = join(getCodexHome(), "tokenjuice-hook.last.json");
  await mkdir(dirname(debugPath), { recursive: true });
  await writeFile(debugPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function runCodexPostToolUseHook(rawText: string): Promise<number> {
  let payload: CodexPostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as CodexPostToolUsePayload;
  } catch {
    return 0;
  }

  const command = payload.tool_input?.command;
  const debug: Record<string, unknown> = {
    hookEvent: payload.hook_event_name,
    toolName: payload.tool_name,
    command,
    rewrote: false,
  };

  if (payload.hook_event_name !== "PostToolUse") {
    await writeHookDebug({ ...debug, skipped: "non-post-tool-use" });
    return 0;
  }
  if (payload.tool_name !== "Bash") {
    await writeHookDebug({ ...debug, skipped: "non-bash" });
    return 0;
  }
  if (typeof command !== "string" || !command.trim()) {
    await writeHookDebug({ ...debug, skipped: "missing-command" });
    return 0;
  }

  const combinedText = stringifyToolResponse(payload.tool_response);
  if (!combinedText.trim()) {
    await writeHookDebug({ ...debug, skipped: "empty-tool-response" });
    return 0;
  }

  const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_CODEX_MAX_INLINE_CHARS");
  const options: ReduceOptions = {
    ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
    ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
    ...(shouldStoreFromEnv() ? { store: true } : {}),
  };

  try {
    const result = await reduceExecution(
      {
        toolName: "exec",
        command,
        combinedText,
        ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
        metadata: {
          source: "codex-post-tool-use",
        },
      },
      options,
    );

    const rawChars = result.stats.rawChars;
    const reducedChars = result.stats.reducedChars;
    debug.rawChars = rawChars;
    debug.reducedChars = reducedChars;
    debug.matchedReducer = result.classification.matchedReducer;

    const skipReason = getCodexRewriteSkipReason(command, combinedText, result);
    if (skipReason) {
      await writeHookDebug({ ...debug, skipped: skipReason });
      return 0;
    }

    const hookOutput: Record<string, unknown> = {
      decision: "block",
      reason: result.inlineText,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: buildCodexHint(result.rawRef?.id),
      },
    };

    process.stdout.write(`${JSON.stringify(hookOutput)}\n`);
    await writeHookDebug({ ...debug, rewrote: true });
    return 0;
  } catch (error) {
    await writeHookDebug({
      ...debug,
      skipped: "hook-error",
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
