import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import packageJson from "../../package.json" with { type: "json" };

import { getInspectionCommandSkipReason, tokenizeCommand } from "./command.js";
import { compactBashResult } from "./integrations/compact-bash-result.js";
import { classifyOnly } from "./reduce.js";
import { storeArtifactMetadata } from "./artifacts.js";
import { countTextChars, stripAnsi } from "./text.js";

import type { CompactResult, ReduceOptions, ToolExecutionInput } from "../types.js";

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
  exitCode?: unknown;
  exit_code?: unknown;
  tool_input?: {
    command?: unknown;
  };
  tool_response?: unknown;
};

const GENERIC_FALLBACK_MIN_SAVED_CHARS = 120;
const GENERIC_FALLBACK_MAX_RATIO = 0.75;
const HOOK_REWRITE_MIN_SAVED_CHARS = 8;
const CODEX_HOOK_LAST_LOG = "tokenjuice-hook.last.json";
const CODEX_HOOK_HISTORY_LOG = "tokenjuice-hook.history.jsonl";
const CODEX_HOOK_HISTORY_LIMIT = 200;

export type InstallCodexHookResult = {
  hooksPath: string;
  backupPath?: string;
  command: string;
  featureFlag: CodexFeatureFlagStatus;
};

export type CodexFeatureFlagStatus = {
  /** Absolute path we looked at (`~/.codex/config.toml` by default). */
  configPath: string;
  /** Whether the config file exists on disk. */
  configExists: boolean;
  /** Whether a `codex_hooks` key was found anywhere in `[features]`. */
  keyPresent: boolean;
  /** Parsed value when present, otherwise null. */
  value: boolean | null;
  /** Convenience: keyPresent && value === true. */
  enabled: boolean;
  /**
   * One-line remediation the user can copy-paste. Empty when enabled.
   * Currently a `codex exec --enable codex_hooks` hint rather than
   * editing config.toml automatically (tokenjuice avoids silent
   * config rewrites).
   */
  fixHint: string;
};

export type CodexHookCommandOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
  /**
   * Override for the config.toml consulted when reporting the
   * `codex_hooks` feature-flag state. Defaults to `~/.codex/config.toml`.
   * Exposed primarily for tests and tooling that manage a non-default
   * Codex home.
   */
  featureFlagConfigPath?: string;
};

export type CodexDoctorReport = {
  hooksPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  checkedPaths: string[];
  missingPaths: string[];
  featureFlag: CodexFeatureFlagStatus;
};

export type UninstallCodexHookResult = {
  hooksPath: string;
  backupPath?: string;
  removed: number;
};

const TOKENJUICE_CODEX_STATUS = "compacting bash output with tokenjuice";
const TOKENJUICE_CODEX_FIX_COMMAND = "tokenjuice install codex";

function getCodexHome(): string {
  return process.env.CODEX_HOME || join(homedir(), ".codex");
}

function getDefaultHooksPath(): string {
  return join(getCodexHome(), "hooks.json");
}

function getDefaultCodexConfigPath(): string {
  return join(getCodexHome(), "config.toml");
}

const FEATURE_FLAG_NAME = "codex_hooks";
const FEATURE_FLAG_FIX_HINT =
  "Codex requires the `codex_hooks` feature to load hooks.json. " +
  "Enable per-invocation with `codex exec --enable codex_hooks ...`, " +
  "or persistently by adding a `[features]` section with `codex_hooks = true` to ~/.codex/config.toml.";

function buildCodexFeatureFlagStatus(
  configPath: string,
  configExists: boolean,
): CodexFeatureFlagStatus {
  return {
    configPath,
    configExists,
    keyPresent: false,
    value: null,
    enabled: false,
    fixHint: FEATURE_FLAG_FIX_HINT,
  };
}

/**
 * Read-only scan of ~/.codex/config.toml for `codex_hooks = <bool>` under
 * a `[features]` section (top-level or dotted form). Does NOT edit the
 * file — tokenjuice prefers to surface the state and let the user decide.
 *
 * Returns `keyPresent: false` if the file is missing, unreadable, or the
 * key is not declared. Stray comments and inline `# ...` are tolerated.
 */
export async function inspectCodexHooksFeatureFlag(
  configPath: string = getDefaultCodexConfigPath(),
): Promise<CodexFeatureFlagStatus> {
  let source: string;
  try {
    source = await readFile(configPath, "utf8");
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return buildCodexFeatureFlagStatus(configPath, false);
    }
    if (code === "EACCES" || code === "EPERM" || code === "EISDIR") {
      return buildCodexFeatureFlagStatus(configPath, true);
    }
    throw error;
  }

  const parsed = parseCodexFeatureFlag(source, FEATURE_FLAG_NAME);
  const enabled = parsed.keyPresent && parsed.value === true;
  return {
    configPath,
    configExists: true,
    keyPresent: parsed.keyPresent,
    value: parsed.keyPresent ? parsed.value : null,
    enabled,
    fixHint: enabled ? "" : FEATURE_FLAG_FIX_HINT,
  };
}

/**
 * Minimal TOML-ish scanner. Looks for `codex_hooks = <bool>` either under
 * a `[features]` header or as a dotted `features.codex_hooks = <bool>`
 * assignment at any indent. Ignores comments and in-line comments.
 * Not a full TOML parser; only the shapes Codex itself documents.
 */
export function parseCodexFeatureFlag(
  source: string,
  key: string,
): { keyPresent: boolean; value: boolean | null } {
  const lines = source.split(/\r?\n/u);
  let currentTablePath: string[] = [];
  const dottedRe = new RegExp(`^\\s*features\\.${key}\\s*=\\s*(true|false)\\b`, "u");
  const scopedRe = new RegExp(`^\\s*${key}\\s*=\\s*(true|false)\\b`, "u");

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/u, "");
    const header = /^\s*\[([^\]]+)\]/u.exec(line);
    if (header) {
      currentTablePath = header[1]!
        .trim()
        .split(".")
        .map((segment) => segment.trim())
        .filter(Boolean);
      continue;
    }
    const dotted = currentTablePath.length === 0 ? dottedRe.exec(line) : null;
    if (dotted) {
      return { keyPresent: true, value: dotted[1] === "true" };
    }
    if (currentTablePath.length === 1 && currentTablePath[0] === "features") {
      const scoped = scopedRe.exec(line);
      if (scoped) {
        return { keyPresent: true, value: scoped[1] === "true" };
      }
    }
  }

  return { keyPresent: false, value: null };
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

async function newestMtimeMs(path: string): Promise<number | undefined> {
  try {
    const details = await stat(path);
    let newest = details.mtimeMs;
    if (details.isDirectory()) {
      for (const entry of await readdir(path)) {
        const childNewest = await newestMtimeMs(join(path, entry));
        if (typeof childNewest === "number" && childNewest > newest) {
          newest = childNewest;
        }
      }
    }
    return newest;
  } catch {
    return undefined;
  }
}

async function detectStaleLocalBuild(commandPaths: string[]): Promise<boolean> {
  const distPath = commandPaths.find((path) => path.endsWith("/dist/cli/main.js") || path.endsWith("\\dist\\cli\\main.js"));
  if (!distPath) {
    return false;
  }

  let distMtimeMs: number;
  try {
    distMtimeMs = (await stat(distPath)).mtimeMs;
  } catch {
    return false;
  }

  const projectRoot = dirname(dirname(dirname(distPath)));
  const latestSourceMtimeMs = Math.max(
    await newestMtimeMs(join(projectRoot, "src")) ?? 0,
    await newestMtimeMs(join(projectRoot, "package.json")) ?? 0,
    await newestMtimeMs(join(projectRoot, "tsconfig.json")) ?? 0,
  );

  return latestSourceMtimeMs > distMtimeMs;
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

function extractHookCommandPaths(command: string): string[] {
  const argv = tokenizeCommand(command);
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
  const argv = tokenizeCommand(command);
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

function parseExitCodeValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/u.test(value.trim())) {
    return Number(value);
  }
  return undefined;
}

function extractCodexExitCode(payload: CodexPostToolUsePayload): number | undefined {
  for (const candidate of [payload.exitCode, payload.exit_code]) {
    const parsed = parseExitCodeValue(candidate);
    if (typeof parsed === "number") {
      return parsed;
    }
  }

  if (isRecord(payload.tool_response)) {
    for (const key of ["exitCode", "exit_code"]) {
      const parsed = parseExitCodeValue(payload.tool_response[key]);
      if (typeof parsed === "number") {
        return parsed;
      }
    }
  }

  return undefined;
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

  const featureFlag = await inspectCodexHooksFeatureFlag(options.featureFlagConfigPath);

  return {
    hooksPath,
    ...(backupPath ? { backupPath } : {}),
    command,
    featureFlag,
  };
}

export async function uninstallCodexHook(
  hooksPath = getDefaultHooksPath(),
): Promise<UninstallCodexHookResult> {
  const { config, backupPath } = await loadHooksConfig(hooksPath);
  const postToolUse = config.hooks.PostToolUse ?? [];
  const retained = postToolUse.filter((group) => !isTokenjuiceCodexHook(group));
  const removed = postToolUse.length - retained.length;

  if (retained.length > 0) {
    config.hooks.PostToolUse = retained;
  } else {
    delete config.hooks.PostToolUse;
  }

  await mkdir(dirname(hooksPath), { recursive: true });
  const tempPath = `${hooksPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, hooksPath);

  return {
    hooksPath,
    ...(backupPath ? { backupPath } : {}),
    removed,
  };
}

export async function doctorCodexHook(
  hooksPath = getDefaultHooksPath(),
  options: CodexHookCommandOptions = {},
): Promise<CodexDoctorReport> {
  const expectedCommand = await buildCodexHookCommand(options);
  let fixCommand = getCodexFixCommand(options.local);
  const { config, exists } = await readHooksConfig(hooksPath);
  const detectedCommand = findTokenjuiceCodexHookCommand(config);
  const featureFlag = await inspectCodexHooksFeatureFlag(options.featureFlagConfigPath);

  if (!exists) {
    return {
      hooksPath,
      status: "disabled",
      issues: [],
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
      featureFlag,
    };
  }

  if (!detectedCommand) {
    return {
      hooksPath,
      status: "disabled",
      issues: [],
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
      featureFlag,
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
  if (options.local && await detectStaleLocalBuild(checkedPaths)) {
    issues.push("local Codex hook target is older than the source tree");
    fixCommand = "pnpm build && tokenjuice install codex --local";
  }
  if (!featureFlag.enabled) {
    issues.push(
      "Codex feature flag `codex_hooks` is not enabled — the configured hook will not fire",
    );
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
    featureFlag,
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

async function writeHookDebug(record: Record<string, unknown>): Promise<void> {
  const codexHome = getCodexHome();
  const debugPath = join(codexHome, CODEX_HOOK_LAST_LOG);
  const historyPath = join(codexHome, CODEX_HOOK_HISTORY_LOG);
  const enrichedRecord = {
    timestamp: new Date().toISOString(),
    tokenjuiceVersion: packageJson.version,
    hookCommandPath: process.argv[1],
    ...record,
  };
  await mkdir(dirname(debugPath), { recursive: true });
  await writeFile(debugPath, `${JSON.stringify(enrichedRecord, null, 2)}\n`, "utf8");

  let historyLines: string[] = [];
  try {
    const currentHistory = await readFile(historyPath, "utf8");
    historyLines = currentHistory
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  historyLines.push(JSON.stringify(enrichedRecord));
  if (historyLines.length > CODEX_HOOK_HISTORY_LIMIT) {
    historyLines = historyLines.slice(-CODEX_HOOK_HISTORY_LIMIT);
  }
  await writeFile(historyPath, `${historyLines.join("\n")}\n`, "utf8");
}

function buildImmediateSkipStats(text: string): {
  rawChars: number;
  reducedChars: number;
  savedChars: number;
  ratio: number;
} {
  const rawChars = countTextChars(stripAnsi(text));
  return {
    rawChars,
    reducedChars: rawChars,
    savedChars: 0,
    ratio: 1,
  };
}

async function recordImmediateHookStats(
  input: ToolExecutionInput,
  rawText: string,
  storeRaw: boolean,
): Promise<void> {
  if (storeRaw) {
    return;
  }

  const stats = buildImmediateSkipStats(rawText);
  const classification = await classifyOnly(input);
  await storeArtifactMetadata(
    {
      input,
      rawText,
      classification,
      stats: {
        rawChars: stats.rawChars,
        reducedChars: stats.reducedChars,
        ratio: stats.ratio,
      },
    },
  );
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

  const exitCode = extractCodexExitCode(payload);
  const executionInput: ToolExecutionInput = {
    toolName: "exec",
    command,
    combinedText,
    ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
    ...(typeof exitCode === "number" ? { exitCode } : {}),
    metadata: {
      source: "codex-post-tool-use",
    },
  };
  const storeRaw = shouldStoreFromEnv();

  if (commandRequestsTokenjuiceRawBypass(command)) {
    await recordImmediateHookStats(executionInput, combinedText, storeRaw);
    const stats = buildImmediateSkipStats(combinedText);
    await writeHookDebug({
      ...debug,
      ...stats,
      skipped: "explicit-raw-bypass",
    });
    return 0;
  }

  const inspectionSkipReason = getInspectionCommandSkipReason(command, "allow-safe-inventory");
  if (inspectionSkipReason) {
    await recordImmediateHookStats(executionInput, combinedText, storeRaw);
    const stats = buildImmediateSkipStats(combinedText);
    await writeHookDebug({
      ...debug,
      ...stats,
      skipped: inspectionSkipReason,
    });
    return 0;
  }

  const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_CODEX_MAX_INLINE_CHARS");

  try {
    const outcome = await compactBashResult({
      source: "codex",
      command,
      visibleText: combinedText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof exitCode === "number" ? { exitCode } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      storeRaw,
      metadata: {
        source: "codex-post-tool-use",
      },
      minSavedCharsAny: HOOK_REWRITE_MIN_SAVED_CHARS,
      genericFallbackMinSavedChars: GENERIC_FALLBACK_MIN_SAVED_CHARS,
      genericFallbackMaxRatio: GENERIC_FALLBACK_MAX_RATIO,
      skipGenericFallbackForCompoundCommands: true,
    });

    const result = outcome.action === "rewrite" ? outcome.result : outcome.result;
    if (result) {
      const rawChars = result.stats.rawChars;
      const reducedChars = result.stats.reducedChars;
      const savedChars = rawChars - reducedChars;
      debug.rawChars = rawChars;
      debug.reducedChars = reducedChars;
      debug.savedChars = savedChars;
      debug.ratio = result.stats.ratio;
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
        additionalContext: buildCodexHint(outcome.result.rawRef?.id),
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
