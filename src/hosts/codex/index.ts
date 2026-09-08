import { execFile } from "node:child_process";
import { mkdir, lstat, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { delimiter, dirname, join } from "node:path";
import { homedir } from "node:os";
import packageJson from "../../../package.json" with { type: "json" };

import { stripLeadingCdPrefix } from "../../core/command.js";
import { getTelemetryCommandFamily, shouldRecordStats, storeArtifact, tryStoreArtifactMetadata } from "../../core/artifacts.js";
import { appendBoundedJsonl } from "../../core/bounded-jsonl.js";
import type { CompactionMetadata } from "../../core/compaction-metadata.js";
import { readNoOmissionFromEnv } from "../../core/env.js";
import { compactBashResult, getOutputAwareInspectionSkipReason } from "../../core/integrations/compact-bash-result.js";
import { classifyOnly } from "../../core/reduce.js";
import { countTextChars, sliceTextChars, stripAnsi } from "../../core/text.js";
import { isNodeExecutablePath, parseShellWords } from "../shared/hook-command.js";
import { buildTokenjuiceHookCommand, isExecutableFile } from "../shared/host-command.js";
import { inspectTokenjuiceHookCommand } from "../shared/hook-command-doctor.js";

import type { ToolExecutionInput } from "../../types.js";
import type {
  HookCommandPackageVersionMismatch,
  HookCommandRuntimeMismatch,
} from "../shared/hook-command-doctor.js";

type CodexHookCommand = Record<string, unknown> & {
  type?: string;
  command?: string;
  statusMessage?: string;
  timeout?: number;
};

type CodexHookMatcherGroup = Record<string, unknown> & {
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
  session_id?: unknown;
  thread_id?: unknown;
  turn_id?: unknown;
  tool_call_id?: unknown;
  tool_use_id?: unknown;
};

const GENERIC_FALLBACK_MIN_SAVED_CHARS = 120;
const GENERIC_FALLBACK_MAX_RATIO = 0.75;
const HOOK_REWRITE_MIN_SAVED_CHARS = 8;
const CODEX_HOOK_MAX_COMPACTION_BYTES = 1 * 1024 * 1024;
const CODEX_HOOK_LAST_LOG = "tokenjuice-hook.last.json";
const CODEX_HOOK_HISTORY_DIRECTORY = "tokenjuice-hook.history-v1";
const CODEX_HOOK_HISTORY_PREFIX = "events";
const LOW_NON_TOKENJUICE_TIMEOUT_SECONDS = 2;
const RECOMMENDED_NON_TOKENJUICE_TIMEOUT_SECONDS = 6;
const TOKENJUICE_CODEX_HOOK_TIMEOUT_SECONDS = 30;
const CODEX_HOOK_INTEGRATION_ID = "tokenjuice.post-tool-use";

export type InstallCodexHookResult = {
  hooksPath: string;
  backupPath?: string;
  command: string;
  featureFlag: CodexFeatureFlagStatus;
  writer: "codex-hooks" | "standalone";
  fragmentId: typeof CODEX_HOOK_INTEGRATION_ID;
};

export type CodexFeatureFlagStatus = {
  /** Absolute path we looked at (`~/.codex/config.toml` by default). */
  configPath: string;
  /** Whether the config file exists on disk. */
  configExists: boolean;
  /** Whether a hooks feature key was found anywhere in `[features]`. */
  keyPresent: boolean;
  /** The feature key that was found. Latest Codex uses `hooks`; `codex_hooks` is a legacy alias. */
  key?: "hooks" | "codex_hooks";
  /** Parsed value when present, otherwise null. */
  value: boolean | null;
  /** Whether hooks are enabled by default when no explicit key is present. */
  defaultEnabled: boolean;
  /** Convenience: true unless the hooks feature is explicitly disabled. */
  enabled: boolean;
  /**
   * One-line remediation the user can copy-paste. Empty when enabled.
   * Currently a `codex exec --enable codex_hooks` hint rather than
   * editing config.toml automatically (tokenjuice avoids silent
   * config rewrites).
   */
  fixHint: string;
};

export type CodexRuntimeConfigStatus = {
  /** Absolute path we scanned (`~/.codex/config.toml` by default). */
  configPath: string;
  /** Whether the config file exists on disk. */
  configExists: boolean;
  approvalPolicy: string | null;
  sandboxMode: string | null;
  approvalsReviewer: string | null;
};

export type CodexHookCommandOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
  noOmit?: boolean;
  /**
   * Override for the config.toml consulted when reporting the
   * `codex_hooks` feature-flag state. Defaults to `~/.codex/config.toml`.
   * Exposed primarily for tests and tooling that manage a non-default
   * Codex home.
   */
  featureFlagConfigPath?: string;
};

function validateCodexOmissionPolicy(options: { noOmit?: boolean; allowOmit?: boolean }): void {
  if (options.noOmit && options.allowOmit) {
    throw new Error("Codex noOmit and allowOmit policies cannot be enabled together");
  }
}

export type CodexHookCommandDiagnostic = {
  location: string;
  command: string;
  checkedPaths: string[];
  missingPaths: string[];
  nonExecutablePaths: string[];
  runtimePath?: string;
  runtimeMismatch?: HookCommandRuntimeMismatch;
  packageVersionMismatch?: HookCommandPackageVersionMismatch;
};

export type CodexDoctorReport = {
  hooksPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  detectedCommands: CodexHookCommandDiagnostic[];
  duplicateHookCount: number;
  checkedPaths: string[];
  missingPaths: string[];
  nonExecutablePaths: string[];
  runtimeMismatches: Array<HookCommandRuntimeMismatch & { location: string }>;
  packageVersionMismatches: Array<HookCommandPackageVersionMismatch & { location: string }>;
  featureFlag: CodexFeatureFlagStatus;
  runtimeConfig: CodexRuntimeConfigStatus;
};

export type UninstallCodexHookResult = {
  hooksPath: string;
  backupPath?: string;
  removed: number;
  writer: "codex-hooks" | "standalone";
  fragmentId: typeof CODEX_HOOK_INTEGRATION_ID;
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

const FEATURE_FLAG_NAMES = ["hooks", "codex_hooks"] as const;
const FEATURE_FLAG_FIX_HINT =
  "Codex hooks are disabled. Enable per-invocation with `codex exec --enable hooks ...`, " +
  "or persistently by adding a `[features]` section with `hooks = true` to ~/.codex/config.toml.";

function buildCodexFeatureFlagStatus(
  configPath: string,
  configExists: boolean,
): CodexFeatureFlagStatus {
  return {
    configPath,
    configExists,
    keyPresent: false,
    defaultEnabled: true,
    value: null,
    enabled: true,
    fixHint: "",
  };
}

/**
 * Read-only scan of ~/.codex/config.toml for the modern `hooks = <bool>`
 * feature flag or its legacy `codex_hooks = <bool>` alias under a `[features]`
 * section (top-level or dotted form). Does NOT edit the file — tokenjuice
 * prefers to surface the state and let the user decide.
 *
 * Latest Codex enables hooks by default. Returns `enabled: true` when no key is
 * declared, and `enabled: false` only when the user explicitly disables hooks.
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

  const parsed = parseCodexFeatureFlag(source, FEATURE_FLAG_NAMES);
  const enabled = parsed.keyPresent ? parsed.value === true : true;
  return {
    configPath,
    configExists: true,
    keyPresent: parsed.keyPresent,
    ...(parsed.key ? { key: parsed.key } : {}),
    defaultEnabled: true,
    value: parsed.keyPresent ? parsed.value : null,
    enabled,
    fixHint: enabled ? "" : FEATURE_FLAG_FIX_HINT,
  };
}

/**
 * Minimal TOML-ish scanner. Looks for feature flags either under a `[features]`
 * header or as a dotted `features.<key> = <bool>` assignment at any indent.
 * Ignores comments and in-line comments.
 * Not a full TOML parser; only the shapes Codex itself documents.
 */
export function parseCodexFeatureFlag(
  source: string,
  keys: "hooks" | "codex_hooks" | readonly ("hooks" | "codex_hooks")[],
): { keyPresent: boolean; key?: "hooks" | "codex_hooks"; value: boolean | null } {
  const lines = source.split(/\r?\n/u);
  let currentTablePath: string[] = [];
  const keyList = typeof keys === "string" ? [keys] : keys;
  const escapedKeys = keyList.join("|");
  const dottedRe = new RegExp(`^\\s*features\\.(${escapedKeys})\\s*=\\s*(true|false)\\b`, "u");
  const scopedRe = new RegExp(`^\\s*(${escapedKeys})\\s*=\\s*(true|false)\\b`, "u");

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
      return { keyPresent: true, key: dotted[1] as "hooks" | "codex_hooks", value: dotted[2] === "true" };
    }
    if (currentTablePath.length === 1 && currentTablePath[0] === "features") {
      const scoped = scopedRe.exec(line);
      if (scoped) {
        return { keyPresent: true, key: scoped[1] as "hooks" | "codex_hooks", value: scoped[2] === "true" };
      }
    }
  }

  return { keyPresent: false, value: null };
}

export async function inspectCodexRuntimeConfig(
  configPath: string = getDefaultCodexConfigPath(),
): Promise<CodexRuntimeConfigStatus> {
  let source: string;
  try {
    source = await readFile(configPath, "utf8");
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        configPath,
        configExists: false,
        approvalPolicy: null,
        sandboxMode: null,
        approvalsReviewer: null,
      };
    }
    if (code === "EACCES" || code === "EPERM" || code === "EISDIR") {
      return {
        configPath,
        configExists: true,
        approvalPolicy: null,
        sandboxMode: null,
        approvalsReviewer: null,
      };
    }
    throw error;
  }

  const values = parseCodexRuntimeConfig(source);
  return {
    configPath,
    configExists: true,
    approvalPolicy: values.approvalPolicy,
    sandboxMode: values.sandboxMode,
    approvalsReviewer: values.approvalsReviewer,
  };
}

function parseCodexRuntimeConfig(source: string): Omit<CodexRuntimeConfigStatus, "configPath" | "configExists"> {
  const values: Omit<CodexRuntimeConfigStatus, "configPath" | "configExists"> = {
    approvalPolicy: null,
    sandboxMode: null,
    approvalsReviewer: null,
  };
  let currentTablePath: string[] = [];

  for (const rawLine of source.split(/\r?\n/u)) {
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
    if (currentTablePath.length > 0) {
      continue;
    }

    const assignment = /^\s*(approval_policy|sandbox_mode|approvals_reviewer)\s*=\s*("[^"]+"|'[^']+'|\{.*|[A-Za-z0-9_-]+)/u.exec(line);
    if (!assignment) {
      continue;
    }

    const rawValue = assignment[2]!.trim();
    const value = rawValue.startsWith("{") ? "granular" : rawValue.replace(/^["']|["']$/gu, "");
    if (assignment[1] === "approval_policy") {
      values.approvalPolicy = value;
    } else if (assignment[1] === "sandbox_mode") {
      values.sandboxMode = value;
    } else {
      values.approvalsReviewer = value;
    }
  }

  return values;
}

async function buildCodexHookCommand(options: CodexHookCommandOptions = {}): Promise<string> {
  const command = await buildTokenjuiceHookCommand("codex-post-tool-use", "codex", {
    ...options,
    pinNodeForJavaScriptLauncher: true,
  });
  return options.noOmit ? `${command} --no-omit` : command;
}

function getCodexFixCommand(local = false, noOmit = false): string {
  return [
    local ? "tokenjuice install codex --local" : TOKENJUICE_CODEX_FIX_COMMAND,
    ...(noOmit ? ["--no-omit"] : []),
  ].join(" ");
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
    try {
      const parsed = JSON.parse(value) as unknown;
      if (
        isRecord(parsed)
        && ["output", "text", "stdout", "stderr", "combinedText"].some((key) => key in parsed)
      ) {
        return stringifyToolResponse(parsed);
      }
    } catch {
      // Plain output is expected to be much more common than a JSON-string envelope.
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => stringifyToolResponse(entry))
      .filter(Boolean)
      .join("\n");
  }
  if (isRecord(value)) {
    const combinedText = value.combinedText;
    if (typeof combinedText === "string" && combinedText) {
      return combinedText;
    }

    const stdout = typeof value.stdout === "string" ? value.stdout : "";
    const stderr = typeof value.stderr === "string" ? value.stderr : "";
    const output = typeof value.output === "string" ? value.output : "";
    const text = typeof value.text === "string" ? value.text : "";
    const primary = stdout || output || text;
    if (primary && stderr) {
      return [`[stdout]`, primary, `[stderr]`, stderr].join("\n");
    }
    if (primary || stderr) {
      return primary || stderr;
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
        timeout: TOKENJUICE_CODEX_HOOK_TIMEOUT_SECONDS,
      },
    ],
  };
}

function isTokenjuiceCodexHookCommand(hook: CodexHookCommand): boolean {
  const command = typeof hook.command === "string" ? hook.command : "";
  return hook.statusMessage === TOKENJUICE_CODEX_STATUS
    || command.includes("codex-post-tool-use")
    || command.includes("post_tool_use_tokenjuice.py");
}

function splitTokenjuiceCodexHooks(groups: CodexHookMatcherGroup[]): {
  retained: CodexHookMatcherGroup[];
  owned: CodexHookMatcherGroup[];
  removed: number;
  hasMixedGroup: boolean;
} {
  const retained: CodexHookMatcherGroup[] = [];
  const owned: CodexHookMatcherGroup[] = [];
  let removed = 0;
  let hasMixedGroup = false;

  for (const group of groups) {
    const tokenjuiceHooks = group.hooks.filter(isTokenjuiceCodexHookCommand);
    if (tokenjuiceHooks.length === 0) {
      retained.push(group);
      continue;
    }

    const otherHooks = group.hooks.filter((hook) => !isTokenjuiceCodexHookCommand(hook));
    removed += tokenjuiceHooks.length;
    owned.push({ ...group, hooks: tokenjuiceHooks });
    if (otherHooks.length > 0) {
      hasMixedGroup = true;
      retained.push({ ...group, hooks: otherHooks });
    }
  }

  return { retained, owned, removed, hasMixedGroup };
}

function assertRendererCanOwnTokenjuiceGroups(
  hooksPath: string,
  split: ReturnType<typeof splitTokenjuiceCodexHooks>,
): void {
  if (split.hasMixedGroup) {
    throw new Error(
      `cannot safely migrate a mixed Tokenjuice/custom matcher group at ${hooksPath}; separate the commands into distinct groups before retrying with the codex-hooks renderer`,
    );
  }
}

function collectTokenjuiceCodexHookCommands(
  config: CodexHooksConfig,
): Array<{ location: string; hook: CodexHookCommand; command: string }> {
  const commands: Array<{ location: string; hook: CodexHookCommand; command: string }> = [];
  for (const [eventName, groups] of Object.entries(config.hooks)) {
    groups.forEach((group, groupIndex) => {
      group.hooks.forEach((hook, hookIndex) => {
        if (!isTokenjuiceCodexHookCommand(hook) || typeof hook.command !== "string") {
          return;
        }
        commands.push({
          location: `${eventName}[${groupIndex}].hooks[${hookIndex}]`,
          hook,
          command: hook.command,
        });
      });
    });
  }
  return commands;
}

function truncateHookCommand(command: string, maxLength = 80): string {
  const trimmed = command.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function collectLowTimeoutWarnings(config: CodexHooksConfig): string[] {
  const issues: string[] = [];

  for (const [eventName, groups] of Object.entries(config.hooks)) {
    groups.forEach((group, groupIndex) => {
      group.hooks.forEach((hook, hookIndex) => {
        if (eventName === "PostToolUse" && isTokenjuiceCodexHookCommand(hook)) {
          return;
        }
        if (typeof hook.command !== "string") {
          return;
        }
        if (
          typeof hook.timeout !== "number"
          || !Number.isFinite(hook.timeout)
          || hook.timeout > LOW_NON_TOKENJUICE_TIMEOUT_SECONDS
        ) {
          return;
        }

        const location = `${eventName}[${groupIndex}].hooks[${hookIndex}]`;
        const command = truncateHookCommand(hook.command);
        issues.push(
          `non-tokenjuice Codex hook ${location} uses a low ${hook.timeout}s timeout for "${command}" — consider ${RECOMMENDED_NON_TOKENJUICE_TIMEOUT_SECONDS}s or higher`,
        );
      });
    });
  }

  return issues;
}

function collectTokenjuiceHookTimeoutWarnings(config: CodexHooksConfig, fixCommand: string): string[] {
  const staleCommands = collectTokenjuiceCodexHookCommands(config)
    .filter(({ hook }) => hook.timeout !== TOKENJUICE_CODEX_HOOK_TIMEOUT_SECONDS);
  if (staleCommands.length === 1) {
    return [
      `configured Codex tokenjuice hook timeout is missing or stale; run ${fixCommand} to add the ${TOKENJUICE_CODEX_HOOK_TIMEOUT_SECONDS}s safety cap`,
    ];
  }
  return staleCommands.map(({ location }) =>
    `configured Codex tokenjuice hook ${location} timeout is missing or stale; run ${fixCommand} to add the ${TOKENJUICE_CODEX_HOOK_TIMEOUT_SECONDS}s safety cap`
  );
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
        if (!isRecord(hook)) {
          return [];
        }

        return [{ ...hook } as CodexHookCommand];
      });

      if (commands.length === 0) {
        return [];
      }

      const normalizedGroup: CodexHookMatcherGroup = {
        ...group,
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

async function loadHooksConfig(hooksPath: string): Promise<{
  config: CodexHooksConfig;
  backupPath?: string;
  sourceText?: string;
}> {
  try {
    const rawText = await readFile(hooksPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    const config = sanitizeHooksConfig(parsed);
    const backupPath = `${hooksPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config, backupPath, sourceText: rawText };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { hooks: {} } };
    }
    throw new Error(`failed to load codex hooks from ${hooksPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function resolveCodexHooksRenderer(): Promise<string | undefined> {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return undefined;
  }
  const names = process.platform === "win32"
    ? ["codex-hooks.exe", "codex-hooks.cmd", "codex-hooks.bat", "codex-hooks"]
    : ["codex-hooks"];
  for (const segment of pathValue.split(delimiter)) {
    if (!segment) {
      continue;
    }
    for (const name of names) {
      const candidate = join(segment, name);
      if (await isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

const UNSAFE_WINDOWS_BATCH_ARGUMENT = /["&|<>()^%!\u0000-\u001F\u007F]/u;

function assertSafeWindowsBatchArguments(args: string[]): void {
  if (args.some((arg) => !arg || arg.trim() !== arg || UNSAFE_WINDOWS_BATCH_ARGUMENT.test(arg))) {
    throw new Error("unsafe Windows batch renderer argument");
  }
}

async function runCodexHooksRenderer(
  rendererPath: string,
  action: "register" | "unregister",
  hooksPath: string,
  fragment?: CodexHooksConfig,
  ownedSource?: CodexHooksConfig,
): Promise<void> {
  const nonce = `${process.pid}-${randomUUID()}`;
  const fragmentPath = join(dirname(hooksPath), `.tokenjuice-hooks-fragment-${nonce}.json`);
  const ownedSourcePath = join(dirname(hooksPath), `.tokenjuice-hooks-owned-${nonce}.json`);
  const args = [
    action,
    "--integration-id",
    CODEX_HOOK_INTEGRATION_ID,
    "--target",
    hooksPath,
  ];
  if (action === "register" && fragment) {
    args.push("--fragment", fragmentPath);
  }
  if (ownedSource && Object.keys(ownedSource.hooks).length > 0) {
    args.push("--owned-source", ownedSourcePath);
  }
  const isWindowsBatch = process.platform === "win32" && /\.(?:cmd|bat)$/iu.test(rendererPath);
  const executable = isWindowsBatch ? process.env.ComSpec?.trim() || "cmd.exe" : rendererPath;
  const executableArgs = isWindowsBatch
    ? ["/d", "/s", "/c", "call", rendererPath, ...args]
    : args;
  if (isWindowsBatch) {
    assertSafeWindowsBatchArguments([...executableArgs, fragmentPath, ownedSourcePath]);
  }

  await mkdir(dirname(hooksPath), { recursive: true, mode: 0o700 });
  try {
    if (action === "register" && fragment) {
      await writeFile(fragmentPath, `${JSON.stringify(fragment, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    }
    if (ownedSource && Object.keys(ownedSource.hooks).length > 0) {
      await writeFile(ownedSourcePath, `${JSON.stringify(ownedSource, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    }
    await new Promise<void>((resolvePromise, rejectPromise) => {
      execFile(executable, executableArgs, { encoding: "utf8" }, (error, _stdout, stderr) => {
        if (!error) {
          resolvePromise();
          return;
        }
        const detail = stderr.trim() || error.message;
        rejectPromise(new Error(`codex-hooks renderer failed: ${detail}`));
      });
    });
  } finally {
    await Promise.all([
      rm(fragmentPath, { force: true }),
      rm(ownedSourcePath, { force: true }),
    ]);
  }
}

async function assertStandaloneHooksTarget(hooksPath: string): Promise<void> {
  try {
    if ((await lstat(hooksPath)).isSymbolicLink()) {
      throw new Error(
        `cannot directly replace externally owned hooks symlink at ${hooksPath}; install codex-hooks or update its owner`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function assertHooksSourceUnchanged(hooksPath: string, sourceText: string | undefined): Promise<void> {
  try {
    const current = await readFile(hooksPath, "utf8");
    if (current !== sourceText) {
      throw new Error(`codex hooks changed during update at ${hooksPath}; no replacement`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && sourceText === undefined) {
      return;
    }
    throw error;
  }
}

async function writeStandaloneHooksConfig(
  hooksPath: string,
  config: CodexHooksConfig,
  sourceText: string | undefined,
): Promise<void> {
  await mkdir(dirname(hooksPath), { recursive: true });
  const tempPath = `${hooksPath}.tmp.${process.pid}-${randomUUID()}`;
  try {
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await assertHooksSourceUnchanged(hooksPath, sourceText);
    await rename(tempPath, hooksPath);
  } finally {
    await rm(tempPath, { force: true });
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

function isTokenjuiceExecutableArg(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.replace(/\\/gu, "/");
  return normalized === "tokenjuice"
    || normalized.endsWith("/tokenjuice")
    || normalized.endsWith("/tokenjuice.exe")
    || normalized.endsWith("/tokenjuice.cmd")
    || normalized.endsWith("/tokenjuice.bat");
}

function commandRequestsTokenjuiceRawBypass(command: string): boolean {
  const argv = parseShellWords(stripLeadingCdPrefix(command));
  if (argv.length < 3) {
    return false;
  }

  const first = argv[0];
  const second = argv[1];
  let wrapIndex = -1;
  if (isTokenjuiceExecutableArg(first)) {
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

function buildCodexFeedback(
  inlineText: string,
  rawRefId?: string,
  compaction?: CompactionMetadata,
  exitCode?: number,
  maxChars = 1200,
  noOmit = false,
): { text: string; truncated: boolean } | undefined {
  const recoveryReference = rawRefId
    ? `tokenjuice cat ${rawRefId}`
    : undefined;
  const serialize = (compactedOutput: string, authoritative: boolean): string => [
    "<tokenjuice_compacted_tool_observation>",
    JSON.stringify({
      source: "codex-post-tool-use",
      exitCode: exitCode ?? null,
      authority: authoritative ? "authoritative-omission" : "non-authoritative-rewrite",
      compactedOutput,
      ...(authoritative && recoveryReference ? { recoveryReference } : {}),
    }, null, 2),
    "</tokenjuice_compacted_tool_observation>",
  ].join("\n");

  const feedback = serialize(inlineText, compaction?.authoritative === true);
  if (countTextChars(feedback) <= maxChars) {
    return { text: feedback, truncated: false };
  }
  if (noOmit) {
    return undefined;
  }

  const truncationMarker = "\n... compacted observation truncated ...";
  let low = 0;
  let high = countTextChars(inlineText);
  let best: string | undefined;
  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidate = serialize(`${sliceTextChars(inlineText, 0, midpoint)}${truncationMarker}`, true);
    if (countTextChars(candidate) <= maxChars) {
      best = candidate;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  return best ? { text: best, truncated: true } : undefined;
}

function buildCodexReplacementOutput(
  inlineText: string,
  rawRefId?: string,
  compaction?: CompactionMetadata,
  exitCode?: number,
  maxChars?: number,
  noOmit?: boolean,
): { payload: Record<string, unknown>; truncated: boolean } | undefined {
  const feedback = buildCodexFeedback(inlineText, rawRefId, compaction, exitCode, maxChars, noOmit);
  if (!feedback) {
    return undefined;
  }
  return {
    payload: {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: feedback.text,
      },
    },
    truncated: feedback.truncated,
  };
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

  let response = payload.tool_response;
  if (typeof response === "string") {
    try {
      response = JSON.parse(response) as unknown;
    } catch {
      response = undefined;
    }
  }

  if (isRecord(response)) {
    for (const key of ["exitCode", "exit_code", "status"]) {
      const parsed = parseExitCodeValue(response[key]);
      if (typeof parsed === "number") {
        return parsed;
      }
    }
  }

  return undefined;
}

function isJsonDocument(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function hasStructuredJsonOutput(value: unknown): boolean {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (
        isRecord(parsed)
        && ["output", "text", "stdout", "stderr", "combinedText"].some((key) => key in parsed)
      ) {
        return hasStructuredJsonOutput(parsed);
      }
    } catch {
      return false;
    }
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasStructuredJsonOutput(entry));
  }
  if (!isRecord(value)) {
    return false;
  }
  return ["combinedText", "stdout", "output", "text"].some((key) =>
    typeof value[key] === "string" && isJsonDocument(value[key])
  );
}

function getCriticalCodexEvidenceReason(
  command: string,
  text: string,
  exitCode: number | undefined,
): string | undefined {
  if (typeof exitCode === "number" && exitCode !== 0) {
    return "nonzero-exit-evidence";
  }
  if (isJsonDocument(text)) {
    return "machine-readable-output";
  }
  if (/(?:^|[/\\\s'"])(?:AGENTS|SOUL|SKILL)\.md(?:$|[/\\\s'"])/iu.test(command)) {
    return "instruction-file-output";
  }
  if (
    /(?:^|\s)['"]?(?:\.schema|\\d[+a-z]*)['"]?(?:\s|$)/iu.test(command)
    || /\b(?:schema-only|show\s+create|describe|pragma)\b/iu.test(command)
  ) {
    return "schema-output";
  }
  return undefined;
}

export async function installCodexHook(
  hooksPath = getDefaultHooksPath(),
  options: CodexHookCommandOptions = {},
): Promise<InstallCodexHookResult> {
  const command = await buildCodexHookCommand(options);
  const rendererPath = await resolveCodexHooksRenderer();
  if (rendererPath) {
    const { config } = await readHooksConfig(hooksPath);
    const split = splitTokenjuiceCodexHooks(config.hooks.PostToolUse ?? []);
    assertRendererCanOwnTokenjuiceGroups(hooksPath, split);
    const ownedSource: CodexHooksConfig = {
      hooks: split.owned.length > 0 ? { PostToolUse: split.owned } : {},
    };
    await runCodexHooksRenderer(
      rendererPath,
      "register",
      hooksPath,
      { hooks: { PostToolUse: [createTokenjuiceCodexHook(command)] } },
      ownedSource,
    );
    const featureFlag = await inspectCodexHooksFeatureFlag(options.featureFlagConfigPath);
    return {
      hooksPath,
      command,
      featureFlag,
      writer: "codex-hooks",
      fragmentId: CODEX_HOOK_INTEGRATION_ID,
    };
  }

  await assertStandaloneHooksTarget(hooksPath);
  const { config, backupPath, sourceText } = await loadHooksConfig(hooksPath);
  const postToolUse = config.hooks.PostToolUse ?? [];
  const { retained } = splitTokenjuiceCodexHooks(postToolUse);
  retained.push(createTokenjuiceCodexHook(command));
  config.hooks.PostToolUse = retained;

  await writeStandaloneHooksConfig(hooksPath, config, sourceText);

  const featureFlag = await inspectCodexHooksFeatureFlag(options.featureFlagConfigPath);

  return {
    hooksPath,
    ...(backupPath ? { backupPath } : {}),
    command,
    featureFlag,
    writer: "standalone",
    fragmentId: CODEX_HOOK_INTEGRATION_ID,
  };
}

export async function uninstallCodexHook(
  hooksPath = getDefaultHooksPath(),
): Promise<UninstallCodexHookResult> {
  const rendererPath = await resolveCodexHooksRenderer();
  if (rendererPath) {
    const { config } = await readHooksConfig(hooksPath);
    const split = splitTokenjuiceCodexHooks(config.hooks.PostToolUse ?? []);
    assertRendererCanOwnTokenjuiceGroups(hooksPath, split);
    const ownedSource: CodexHooksConfig = {
      hooks: split.owned.length > 0 ? { PostToolUse: split.owned } : {},
    };
    await runCodexHooksRenderer(rendererPath, "unregister", hooksPath, undefined, ownedSource);
    return {
      hooksPath,
      removed: split.removed,
      writer: "codex-hooks",
      fragmentId: CODEX_HOOK_INTEGRATION_ID,
    };
  }

  await assertStandaloneHooksTarget(hooksPath);
  const { config, backupPath, sourceText } = await loadHooksConfig(hooksPath);
  const postToolUse = config.hooks.PostToolUse ?? [];
  const { retained, removed } = splitTokenjuiceCodexHooks(postToolUse);

  if (retained.length > 0) {
    config.hooks.PostToolUse = retained;
  } else {
    delete config.hooks.PostToolUse;
  }

  await writeStandaloneHooksConfig(hooksPath, config, sourceText);

  return {
    hooksPath,
    ...(backupPath ? { backupPath } : {}),
    removed,
    writer: "standalone",
    fragmentId: CODEX_HOOK_INTEGRATION_ID,
  };
}

export async function doctorCodexHook(
  hooksPath = getDefaultHooksPath(),
  options: CodexHookCommandOptions = {},
): Promise<CodexDoctorReport> {
  const noOmit = options.noOmit === true;
  const expectedCommand = await buildCodexHookCommand(options);
  const expectedNodePath = options.nodePath ?? process.execPath;
  const installFixCommand = getCodexFixCommand(options.local, noOmit);
  let fixCommand = installFixCommand;
  const { config, exists } = await readHooksConfig(hooksPath);
  const locatedCommands = collectTokenjuiceCodexHookCommands(config);
  const detectedCommands = await Promise.all(
    locatedCommands.map(async ({ location, command }): Promise<CodexHookCommandDiagnostic> => ({
      location,
      command,
      ...(await inspectTokenjuiceHookCommand({
        command,
        expectedNodePath,
        expectedPackageVersion: packageJson.version,
      })),
    })),
  );
  const detectedCommand = detectedCommands[0]?.command;
  const duplicateHookCount = Math.max(0, detectedCommands.length - 1);
  const checkedPaths = [...new Set(detectedCommands.flatMap((entry) => entry.checkedPaths))];
  const missingPaths = [...new Set(detectedCommands.flatMap((entry) => entry.missingPaths))];
  const nonExecutablePaths = [...new Set(detectedCommands.flatMap((entry) => entry.nonExecutablePaths))];
  const runtimeMismatches = detectedCommands.flatMap((entry) =>
    entry.runtimeMismatch ? [{ location: entry.location, ...entry.runtimeMismatch }] : []
  );
  const packageVersionMismatches = detectedCommands.flatMap((entry) =>
    entry.packageVersionMismatch
      ? [{ location: entry.location, ...entry.packageVersionMismatch }]
      : []
  );
  const featureFlag = await inspectCodexHooksFeatureFlag(options.featureFlagConfigPath);
  const runtimeConfig = await inspectCodexRuntimeConfig(options.featureFlagConfigPath);

  if (!exists) {
    return {
      hooksPath,
      status: "disabled",
      issues: [],
      fixCommand,
      expectedCommand,
      detectedCommands,
      duplicateHookCount,
      checkedPaths: [],
      missingPaths: [],
      nonExecutablePaths: [],
      runtimeMismatches: [],
      packageVersionMismatches: [],
      featureFlag,
      runtimeConfig,
    };
  }

  if (!detectedCommand) {
    return {
      hooksPath,
      status: "disabled",
      issues: [],
      fixCommand,
      expectedCommand,
      detectedCommands,
      duplicateHookCount,
      checkedPaths: [],
      missingPaths: [],
      nonExecutablePaths: [],
      runtimeMismatches: [],
      packageVersionMismatches: [],
      featureFlag,
      runtimeConfig,
    };
  }

  const issues: string[] = [];
  const commandMismatch = detectedCommands.some((entry) => entry.command !== expectedCommand);
  if (duplicateHookCount > 0) {
    issues.push(
      `configured Codex hooks contain ${detectedCommands.length} tokenjuice commands; expected exactly one managed hook`,
    );
  }
  if (commandMismatch) {
    if (detectedCommands.some((entry) => entry.command.includes("/Cellar/"))) {
      issues.push("configured Codex hook is pinned to a versioned Homebrew Cellar path");
    } else {
      issues.push("configured Codex hook command does not match the current recommended command");
    }
  }
  if (missingPaths.length > 0) {
    issues.push(`configured Codex hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
  }
  if (nonExecutablePaths.length > 0) {
    issues.push(`configured Codex hook points at non-executable path${nonExecutablePaths.length === 1 ? "" : "s"}`);
  }
  for (const mismatch of runtimeMismatches) {
    issues.push(
      `configured Codex hook ${mismatch.location} uses Node runtime ${mismatch.configuredPath}, but this tokenjuice uses ${mismatch.expectedPath}`,
    );
  }
  for (const mismatch of packageVersionMismatches) {
    issues.push(
      `configured Codex hook launcher resolves to Homebrew tokenjuice ${mismatch.resolvedVersion}, but this tokenjuice is ${mismatch.expectedVersion}`,
    );
    fixCommand = commandMismatch
      ? `brew upgrade tokenjuice && ${installFixCommand}`
      : "brew upgrade tokenjuice";
  }
  if (options.local && await detectStaleLocalBuild(checkedPaths)) {
    issues.push("local Codex hook target is older than the source tree");
    fixCommand = `pnpm build && ${getCodexFixCommand(true, noOmit)}`;
  }
  if (!featureFlag.enabled) {
    issues.push(
      "Codex feature flag `hooks` is disabled — the configured hook will not fire",
    );
  }
  issues.push(...collectTokenjuiceHookTimeoutWarnings(config, installFixCommand));
  issues.push(...collectLowTimeoutWarnings(config));

  return {
    hooksPath,
    status: missingPaths.length > 0 || nonExecutablePaths.length > 0
      ? "broken"
      : issues.length > 0
        ? "warn"
        : "ok",
    issues,
    fixCommand,
    expectedCommand,
    detectedCommand,
    detectedCommands,
    duplicateHookCount,
    checkedPaths,
    missingPaths,
    nonExecutablePaths,
    runtimeMismatches,
    packageVersionMismatches,
    featureFlag,
    runtimeConfig,
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
  if (!shouldRecordStats()) {
    return;
  }
  try {
    const codexHome = getCodexHome();
    const debugPath = join(codexHome, CODEX_HOOK_LAST_LOG);
    const enrichedRecord: Record<string, unknown> & { eventId: string } = {
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      tokenjuiceVersion: packageJson.version,
      hookCommandPath: process.argv[1],
      ...record,
    };
    await mkdir(dirname(debugPath), { recursive: true });
    await writeFile(debugPath, `${JSON.stringify(enrichedRecord, null, 2)}\n`, "utf8");
    const historyRecord = { ...enrichedRecord };
    if (typeof historyRecord.command === "string") {
      const command = historyRecord.command;
      delete historyRecord.command;
      const commandFamily = getTelemetryCommandFamily({ command });
      if (commandFamily) {
        historyRecord.commandFamily = commandFamily;
      }
    }
    await appendBoundedJsonl(
      join(codexHome, CODEX_HOOK_HISTORY_DIRECTORY),
      CODEX_HOOK_HISTORY_PREFIX,
      enrichedRecord.eventId,
      historyRecord,
    );
  } catch {
    // A diagnostic side effect must never turn an otherwise optional hook into a failed tool call.
  }
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
  const recordStats = shouldRecordStats();
  if (!storeRaw && !recordStats) {
    return;
  }

  const stats = buildImmediateSkipStats(rawText);
  try {
    const classification = await classifyOnly(input);
    const artifact = {
      input,
      rawText,
      classification,
      stats: {
        rawChars: stats.rawChars,
        reducedChars: stats.reducedChars,
        ratio: stats.ratio,
      },
    };
    if (storeRaw) {
      await storeArtifact({ ...artifact, recordStats });
    } else {
      await tryStoreArtifactMetadata(artifact);
    }
  } catch {
    // Optional retention and telemetry must not fail the host tool call.
  }
}

export async function runCodexPostToolUseHook(
  rawText: string,
  options: { noOmit?: boolean; allowOmit?: boolean } = {},
): Promise<number> {
  const hookStartedAt = Date.now();
  validateCodexOmissionPolicy(options);
  let payload: CodexPostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as CodexPostToolUsePayload;
  } catch {
    return 0;
  }

  const command = payload.tool_input?.command;
  const noOmit = !options.allowOmit && (options.noOmit || readNoOmissionFromEnv());
  const debug: Record<string, unknown> = {
    hookEvent: payload.hook_event_name,
    toolName: payload.tool_name,
    command,
    noOmit,
    rewrote: false,
    ...(typeof payload.session_id === "string" ? { threadId: payload.session_id } : {}),
    ...(typeof payload.thread_id === "string" ? { threadId: payload.thread_id } : {}),
    ...(typeof payload.turn_id === "string" ? { turnId: payload.turn_id } : {}),
    ...(typeof payload.tool_call_id === "string" ? { callId: payload.tool_call_id } : {}),
    ...(typeof payload.tool_use_id === "string" ? { callId: payload.tool_use_id } : {}),
  };
  const writeDebug = async (record: Record<string, unknown>): Promise<void> => {
    await writeHookDebug({
      ...record,
      hookLatencyMs: Date.now() - hookStartedAt,
    });
  };

  if (payload.hook_event_name !== "PostToolUse") {
    await writeDebug({ ...debug, skipped: "non-post-tool-use" });
    return 0;
  }
  if (payload.tool_name !== "Bash") {
    await writeDebug({ ...debug, skipped: "non-bash" });
    return 0;
  }
  if (typeof command !== "string" || !command.trim()) {
    await writeDebug({ ...debug, skipped: "missing-command" });
    return 0;
  }

  const combinedText = stringifyToolResponse(payload.tool_response);
  if (!combinedText.trim()) {
    await writeDebug({ ...debug, skipped: "empty-tool-response" });
    return 0;
  }

  const rawBytes = Buffer.byteLength(combinedText, "utf8");
  if (rawBytes > CODEX_HOOK_MAX_COMPACTION_BYTES) {
    const plainText = stripAnsi(combinedText);
    const rawChars = countTextChars(plainText);
    await writeDebug({
      ...debug,
      rawChars,
      rawBytes,
      reducedChars: rawChars,
      savedChars: 0,
      ratio: 1,
      skipped: "response-too-large",
    });
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
  const criticalEvidenceReason = hasStructuredJsonOutput(payload.tool_response)
    ? "machine-readable-output"
    : getCriticalCodexEvidenceReason(command, combinedText, exitCode);

  if (criticalEvidenceReason) {
    await recordImmediateHookStats(executionInput, combinedText, storeRaw);
    await writeDebug({
      ...debug,
      ...buildImmediateSkipStats(combinedText),
      exitCode,
      deliveryMode: "original-only",
      skipped: criticalEvidenceReason,
    });
    return 0;
  }

  if (commandRequestsTokenjuiceRawBypass(command)) {
    await recordImmediateHookStats(executionInput, combinedText, storeRaw);
    const stats = buildImmediateSkipStats(combinedText);
    await writeDebug({
      ...debug,
      ...stats,
      skipped: "explicit-raw-bypass",
    });
    return 0;
  }

  const inspectionSkipReason = getOutputAwareInspectionSkipReason("allow-safe-inventory", executionInput);
  if (inspectionSkipReason) {
    await recordImmediateHookStats(executionInput, combinedText, storeRaw);
    const stats = buildImmediateSkipStats(combinedText);
    await writeDebug({
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
      ...(options.allowOmit ? { allowOmit: true } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      ...(noOmit ? { noOmit: true } : {}),
      storeRaw,
      recordStats: shouldRecordStats(),
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
      debug.compaction = result.compaction;
    }

    if (outcome.action === "keep") {
      await writeDebug({ ...debug, deliveryMode: "original-only", skipped: outcome.reason });
      return 0;
    }

    const replacement = buildCodexReplacementOutput(
      outcome.result.inlineText,
      outcome.result.rawRef?.id,
      outcome.result.compaction,
      exitCode,
      maxInlineChars,
      noOmit,
    );
    if (!replacement) {
      await writeDebug({ ...debug, deliveryMode: "original-only", skipped: "observation-inline-limit" });
      return 0;
    }

    process.stdout.write(`${JSON.stringify(replacement.payload)}\n`);
    await writeDebug({
      ...debug,
      rewrote: true,
      deliveryMode: "original-plus-additional-context",
      measurement: "pre-delivery-summary-characters",
      feedbackTruncated: replacement.truncated,
    });
    return 0;
  } catch (error) {
    await writeDebug({
      ...debug,
      deliveryMode: "original-only",
      skipped: "hook-error",
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
