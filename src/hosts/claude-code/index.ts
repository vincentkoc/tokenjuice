import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";

import { stripLeadingCdPrefix } from "../../core/command.js";
import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import { extractHookCommandPaths, isNodeExecutablePath, parseShellWords, shellQuote } from "../shared/hook-command.js";

type ClaudeCodeHook = Record<string, unknown>;

type ClaudeCodeHookMatcherGroup = Record<string, unknown> & {
  matcher?: string;
  hooks: ClaudeCodeHook[];
};

type ClaudeCodeSettings = Record<string, unknown> & {
  hooks: Record<string, unknown>;
};

type ClaudeCodePostToolUsePayload = {
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

export type InstallClaudeCodeHookResult = {
  settingsPath: string;
  backupPath?: string;
  command: string;
};

export type ClaudeCodeDoctorReport = {
  settingsPath: string;
  status: "ok" | "warn" | "broken";
  issues: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  checkedPaths: string[];
  missingPaths: string[];
};

export type ClaudeCodeHookCommandOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
};

const TOKENJUICE_CLAUDE_CODE_STATUS = "compacting bash output with tokenjuice";
const TOKENJUICE_CLAUDE_CODE_FIX_COMMAND = "tokenjuice install claude-code";

function getClaudeCodeHome(): string {
  // Claude Code resolves its config directory from CLAUDE_CONFIG_DIR, so honor
  // it first to stay aligned with the host. CLAUDE_HOME is kept as a fallback
  // for backwards compatibility with existing tokenjuice installs.
  return process.env.CLAUDE_CONFIG_DIR || process.env.CLAUDE_HOME || join(homedir(), ".claude");
}

function getDefaultSettingsPath(): string {
  return join(getClaudeCodeHome(), "settings.json");
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

async function buildClaudeCodeHookCommand(options: ClaudeCodeHookCommandOptions = {}): Promise<string> {
  const rawBinaryPath = options.binaryPath ?? process.argv[1];
  const binaryPath = rawBinaryPath && !isAbsolute(rawBinaryPath) ? resolve(rawBinaryPath) : rawBinaryPath;
  const nodePath = options.nodePath ?? process.execPath;
  if (!binaryPath) {
    throw new Error("unable to resolve tokenjuice binary path for claude code install");
  }

  if (!options.local) {
    const installedBinaryPath = await resolveInstalledTokenjuicePath();
    if (installedBinaryPath) {
      return `${shellQuote(installedBinaryPath)} claude-code-post-tool-use`;
    }
  }

  if (binaryPath.endsWith(".js")) {
    return `${shellQuote(nodePath)} ${shellQuote(binaryPath)} claude-code-post-tool-use`;
  }

  return `${shellQuote(binaryPath)} claude-code-post-tool-use`;
}

function getClaudeCodeFixCommand(local = false): string {
  return local ? "tokenjuice install claude-code --local" : TOKENJUICE_CLAUDE_CODE_FIX_COMMAND;
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

function createTokenjuiceClaudeCodeHook(command: string): ClaudeCodeHookMatcherGroup {
  return {
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command,
        statusMessage: TOKENJUICE_CLAUDE_CODE_STATUS,
      },
    ],
  };
}

function isTokenjuiceClaudeCodeHook(group: ClaudeCodeHookMatcherGroup): boolean {
  return group.hooks.some((hook) =>
    isRecord(hook) && (
      hook.statusMessage === TOKENJUICE_CLAUDE_CODE_STATUS
      || (typeof hook.command === "string" && hook.command.includes("claude-code-post-tool-use"))
    ),
  );
}

function findTokenjuiceClaudeCodeHookCommand(config: ClaudeCodeSettings): string | undefined {
  const postToolUse = Array.isArray(config.hooks.PostToolUse) ? config.hooks.PostToolUse : [];
  for (const group of postToolUse) {
    if (!(isRecord(group) && Array.isArray(group.hooks) && isTokenjuiceClaudeCodeHook(group as ClaudeCodeHookMatcherGroup))) {
      continue;
    }

    const command = group.hooks.find((hook) =>
      isRecord(hook)
      && (
        hook.statusMessage === TOKENJUICE_CLAUDE_CODE_STATUS
        || (typeof hook.command === "string" && hook.command.includes("claude-code-post-tool-use"))
      ),
    )?.command;
    if (typeof command === "string" && command) {
      return command;
    }
  }

  return undefined;
}

function sanitizeHooksSubtree(raw: unknown): Record<string, unknown> {
  return isRecord(raw) ? { ...raw } : {};
}

function sanitizeClaudeCodeSettings(raw: unknown): ClaudeCodeSettings {
  if (!isRecord(raw)) {
    return { hooks: {} };
  }

  return {
    ...raw,
    hooks: sanitizeHooksSubtree(raw.hooks),
  };
}

async function loadClaudeCodeSettings(settingsPath: string): Promise<{ config: ClaudeCodeSettings; backupPath?: string }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    const config = sanitizeClaudeCodeSettings(parsed);
    const backupPath = `${settingsPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config, backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} } };
    }
    throw new Error(`failed to load claude code settings from ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readClaudeCodeSettings(settingsPath: string): Promise<{ config: ClaudeCodeSettings; exists: boolean }> {
  try {
    const rawText = await readFile(settingsPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    return {
      config: sanitizeClaudeCodeSettings(parsed),
      exists: true,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        config: { hooks: {} },
        exists: false,
      };
    }
    throw new Error(`failed to read claude code settings from ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function installClaudeCodeHook(
  settingsPath = getDefaultSettingsPath(),
  options: ClaudeCodeHookCommandOptions = {},
): Promise<InstallClaudeCodeHookResult> {
  const { config, backupPath } = await loadClaudeCodeSettings(settingsPath);
  const command = await buildClaudeCodeHookCommand(options);
  const postToolUse = Array.isArray(config.hooks.PostToolUse) ? config.hooks.PostToolUse : [];
  const retained = postToolUse.filter((group) =>
    !(isRecord(group) && Array.isArray(group.hooks) && isTokenjuiceClaudeCodeHook(group as ClaudeCodeHookMatcherGroup)),
  );
  retained.push(createTokenjuiceClaudeCodeHook(command));
  config.hooks.PostToolUse = retained;

  await mkdir(dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, settingsPath);

  return {
    settingsPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function doctorClaudeCodeHook(
  settingsPath = getDefaultSettingsPath(),
  options: ClaudeCodeHookCommandOptions = {},
): Promise<ClaudeCodeDoctorReport> {
  const expectedCommand = await buildClaudeCodeHookCommand(options);
  const fixCommand = getClaudeCodeFixCommand(options.local);
  const { config, exists } = await readClaudeCodeSettings(settingsPath);
  const detectedCommand = findTokenjuiceClaudeCodeHookCommand(config);

  if (!exists) {
    return {
      settingsPath,
      status: "warn",
      issues: ["claude code settings.json is missing"],
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  if (!detectedCommand) {
    return {
      settingsPath,
      status: "warn",
      issues: ["tokenjuice PostToolUse hook is not installed for Claude Code"],
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
      issues.push("configured Claude Code hook is pinned to a versioned Homebrew Cellar path");
    } else {
      issues.push("configured Claude Code hook command does not match the current recommended command");
    }
  }
  if (missingPaths.length > 0) {
    issues.push(`configured Claude Code hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
  }

  return {
    settingsPath,
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
  const value = process.env.TOKENJUICE_CLAUDE_CODE_STORE;
  return value === "1" || value === "true" || value === "TRUE" || value === "yes" || value === "YES";
}

function commandRequestsTokenjuiceRawBypass(command: string): boolean {
  const argv = parseShellWords(stripLeadingCdPrefix(command));
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
    && isNodeExecutablePath(first)
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

function buildClaudeCodeHint(rawRefId?: string): string {
  const hints = [
    "if this compaction looks wrong, rerun with `tokenjuice wrap --raw -- <command>` or `tokenjuice wrap --full -- <command>`.",
  ];
  if (rawRefId) {
    hints.unshift(`tokenjuice stored raw bash output as artifact ${rawRefId}. use \`tokenjuice cat ${rawRefId}\` only if the compacted output is insufficient.`);
  }
  return hints.join(" ");
}

async function writeHookDebug(record: Record<string, unknown>): Promise<void> {
  const debugPath = join(getClaudeCodeHome(), "tokenjuice-hook.last.json");
  await mkdir(dirname(debugPath), { recursive: true });
  await writeFile(debugPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function runClaudeCodePostToolUseHook(rawText: string): Promise<number> {
  let payload: ClaudeCodePostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as ClaudeCodePostToolUsePayload;
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

  if (commandRequestsTokenjuiceRawBypass(command)) {
    await writeHookDebug({ ...debug, skipped: "explicit-raw-bypass" });
    return 0;
  }

  const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_CLAUDE_CODE_MAX_INLINE_CHARS");

  try {
    const outcome = await compactBashResult({
      source: "claude-code",
      command,
      visibleText: combinedText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      inspectionPolicy: "allow-safe-inventory",
      storeRaw: shouldStoreFromEnv(),
      metadata: {
        source: "claude-code-post-tool-use",
      },
      genericFallbackMinSavedChars: GENERIC_FALLBACK_MIN_SAVED_CHARS,
      genericFallbackMaxRatio: GENERIC_FALLBACK_MAX_RATIO,
      skipGenericFallbackForCompoundCommands: true,
    });

    const result = outcome.action === "rewrite" ? outcome.result : outcome.result;
    if (result) {
      debug.rawChars = result.stats.rawChars;
      debug.reducedChars = result.stats.reducedChars;
      debug.matchedReducer = result.classification.matchedReducer;
    }

    if (outcome.action === "keep") {
      await writeHookDebug({ ...debug, skipped: outcome.reason });
      return 0;
    }

    const hookOutput: Record<string, unknown> = {
      decision: "block",
      reason: outcome.result.inlineText,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: buildClaudeCodeHint(outcome.result.rawRef?.id),
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
