import { readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { stripLeadingCdPrefix, stripLeadingEnvAssignments } from "../../core/command.js";
import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import { extractHookCommandPaths, isNodeExecutablePath, isTokenjuiceExecutablePath, parseShellWords, shellQuote } from "../shared/hook-command.js";
import {
  buildTokenjuiceHookCommand,
  isExecutableFile,
  pathExists,
  type TokenjuiceHookCommandOptions,
} from "../shared/host-command.js";
import {
  ensureHooksDir,
  isRecord,
  loadCopilotHooksConfigWithBackup,
  readCopilotHooksConfig,
  writeCopilotHooksConfigAtomic,
} from "../shared/hooks-json-file.js";
import type { CopilotHooksConfig } from "../shared/hooks-json-file.js";

export type CopilotAgentHookCommandOptions = TokenjuiceHookCommandOptions & {
  projectDir?: string;
};

export type InstallCopilotAgentHookResult = {
  hooksPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallCopilotAgentHookResult = {
  hooksPath: string;
  removed: number;
  deletedFile: boolean;
};

export type CopilotAgentDoctorReport = {
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

type CopilotAgentPostToolUsePayload = {
  hook_event_name?: unknown;
  hookEventName?: unknown;
  tool_name?: unknown;
  toolName?: unknown;
  tool_input?: unknown;
  toolInput?: unknown;
  toolArgs?: unknown;
  tool_result?: unknown;
  toolResult?: unknown;
  cwd?: unknown;
};

type StrayCopilotAgentHook = {
  path: string;
  command: string;
};

const TOKENJUICE_COPILOT_AGENT_SUBCOMMAND = "copilot-agent-post-tool-use";
const TOKENJUICE_COPILOT_AGENT_FIX_COMMAND = "tokenjuice install copilot-agent";
const TOKENJUICE_COPILOT_AGENT_FILENAME = "tokenjuice-agent.json";
const TOKENJUICE_COPILOT_AGENT_TIMEOUT_SECONDS = 10;
const TOKENJUICE_COPILOT_AGENT_ADVISORY =
  "Copilot coding agent support is beta; cloud agent jobs must have tokenjuice available in PATH before the repo hook runs.";
const TOKENJUICE_COPILOT_AGENT_DISABLED_ADVISORY =
  "Copilot coding agent support is beta; install writes a repo-level .github/hooks hook for bash PostToolUse events.";

const GENERIC_FALLBACK_MIN_SAVED_CHARS = 120;
const GENERIC_FALLBACK_MAX_RATIO = 0.75;

async function buildCopilotAgentHookCommand(
  options: CopilotAgentHookCommandOptions = {},
): Promise<string> {
  if (!options.local) {
    return `${shellQuote("tokenjuice")} ${TOKENJUICE_COPILOT_AGENT_SUBCOMMAND}`;
  }
  return buildTokenjuiceHookCommand(TOKENJUICE_COPILOT_AGENT_SUBCOMMAND, "copilot-agent", options);
}

function getExplicitProjectDir(options: CopilotAgentHookCommandOptions = {}): string | undefined {
  return options.projectDir || process.env.COPILOT_AGENT_PROJECT_DIR;
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function findGitRoot(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    if (await hasGitMetadata(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function resolveProjectDir(
  options: CopilotAgentHookCommandOptions = {},
  requireRepositoryRoot = false,
): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  const gitRoot = await findGitRoot(process.cwd());
  if (gitRoot) {
    return gitRoot;
  }
  if (requireRepositoryRoot) {
    throw new Error("copilot-agent install must run inside a git repository or receive an explicit projectDir");
  }
  return process.cwd();
}

async function getDefaultHooksPath(
  options: CopilotAgentHookCommandOptions = {},
  requireRepositoryRoot = false,
): Promise<string> {
  return join(await resolveProjectDir(options, requireRepositoryRoot), ".github", "hooks", TOKENJUICE_COPILOT_AGENT_FILENAME);
}

function getCopilotAgentFixCommand(local = false): string {
  return local
    ? `${TOKENJUICE_COPILOT_AGENT_FIX_COMMAND} --local`
    : TOKENJUICE_COPILOT_AGENT_FIX_COMMAND;
}

function readHookCommand(entry: unknown): string | undefined {
  if (!isRecord(entry)) {
    return undefined;
  }
  for (const key of ["bash", "command", "powershell"]) {
    const value = entry[key];
    if (typeof value === "string" && value.includes(TOKENJUICE_COPILOT_AGENT_SUBCOMMAND)) {
      return value;
    }
  }
  return undefined;
}

function isTokenjuiceCopilotAgentHook(entry: unknown): boolean {
  return readHookCommand(entry) !== undefined;
}

function getPostToolUseHooks(config: CopilotHooksConfig): unknown[] {
  const postToolUse = config.hooks.postToolUse;
  return Array.isArray(postToolUse) ? postToolUse : [];
}

function removeTokenjuiceCopilotAgentHooks(config: CopilotHooksConfig): number {
  let removed = 0;
  for (const [eventName, entries] of Object.entries(config.hooks)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    const retained = entries.filter((entry) => !isTokenjuiceCopilotAgentHook(entry));
    removed += entries.length - retained.length;
    if (retained.length === 0) {
      delete config.hooks[eventName];
    } else {
      config.hooks[eventName] = retained;
    }
  }
  return removed;
}

function isEffectivelyEmptyHooksConfig(config: CopilotHooksConfig): boolean {
  return Object.keys(config.hooks).length === 0
    && Object.keys(config).filter((key) => key !== "hooks" && key !== "version").length === 0;
}

async function writeOrDeleteHooksConfig(hooksPath: string, config: CopilotHooksConfig): Promise<boolean> {
  if (isEffectivelyEmptyHooksConfig(config)) {
    await rm(hooksPath, { force: true });
    return true;
  }

  await writeCopilotHooksConfigAtomic(hooksPath, config);
  return false;
}

function findTokenjuiceCopilotAgentHook(config: CopilotHooksConfig): Record<string, unknown> | undefined {
  for (const entry of getPostToolUseHooks(config)) {
    if (isTokenjuiceCopilotAgentHook(entry) && isRecord(entry)) {
      return entry;
    }
  }
  return undefined;
}

function findTokenjuiceCopilotAgentHookCommand(config: CopilotHooksConfig): string | undefined {
  return readHookCommand(findTokenjuiceCopilotAgentHook(config));
}

function findAnyTokenjuiceCopilotAgentHookCommand(config: CopilotHooksConfig): string | undefined {
  for (const entries of Object.values(config.hooks)) {
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      const command = readHookCommand(entry);
      if (command) {
        return command;
      }
    }
  }
  return undefined;
}

function findMisplacedTokenjuiceCopilotAgentHookEvents(config: CopilotHooksConfig): string[] {
  const events: string[] = [];
  for (const [eventName, entries] of Object.entries(config.hooks)) {
    if (eventName === "postToolUse" || !Array.isArray(entries)) {
      continue;
    }
    if (entries.some((entry) => isTokenjuiceCopilotAgentHook(entry))) {
      events.push(eventName);
    }
  }
  return events;
}

function createTokenjuiceCopilotAgentHook(command: string): Record<string, unknown> {
  return {
    type: "command",
    bash: command,
    command,
    timeoutSec: TOKENJUICE_COPILOT_AGENT_TIMEOUT_SECONDS,
  };
}

function collectTokenjuiceHookTimeoutWarnings(config: CopilotHooksConfig, fixCommand: string): string[] {
  const hook = findTokenjuiceCopilotAgentHook(config);
  if (!hook || hook.timeoutSec === TOKENJUICE_COPILOT_AGENT_TIMEOUT_SECONDS) {
    return [];
  }
  return [
    `configured copilot-agent tokenjuice hook timeout is missing or stale; run ${fixCommand} to add the ${TOKENJUICE_COPILOT_AGENT_TIMEOUT_SECONDS}s safety cap`,
  ];
}

async function findStrayCopilotAgentHooks(
  hooksDir: string,
  canonicalPath: string,
): Promise<StrayCopilotAgentHook[]> {
  let entries: string[];
  try {
    entries = await readdir(hooksDir);
  } catch {
    return [];
  }

  const hooks: StrayCopilotAgentHook[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    const candidate = join(hooksDir, entry);
    if (candidate === canonicalPath) {
      continue;
    }

    try {
      const { config } = await readCopilotHooksConfig(candidate, "copilot-agent");
      const command = findAnyTokenjuiceCopilotAgentHookCommand(config);
      if (command) {
        hooks.push({ path: candidate, command });
      }
    } catch {
      // Ignore unreadable or invalid sibling hook files in doctor output.
    }
  }
  return hooks;
}

async function uninstallStrayCopilotAgentHookFiles(
  hooksDir: string,
  canonicalPath: string,
): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(hooksDir);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    const candidate = join(hooksDir, entry);
    if (candidate === canonicalPath) {
      continue;
    }

    try {
      const { config } = await readCopilotHooksConfig(candidate, "copilot-agent");
      const removedFromFile = removeTokenjuiceCopilotAgentHooks(config);
      if (removedFromFile === 0) {
        continue;
      }
      await writeOrDeleteHooksConfig(candidate, config);
      removed += removedFromFile;
    } catch {
      // Leave unreadable or invalid sibling hook files untouched.
    }
  }

  return removed;
}

export async function installCopilotAgentHook(
  hooksPath?: string,
  options: CopilotAgentHookCommandOptions = {},
): Promise<InstallCopilotAgentHookResult> {
  const resolvedHooksPath = hooksPath ?? await getDefaultHooksPath(options, true);
  const { config, backupPath } = await loadCopilotHooksConfigWithBackup(resolvedHooksPath, "copilot-agent");
  const command = await buildCopilotAgentHookCommand(options);
  removeTokenjuiceCopilotAgentHooks(config);
  const retained = getPostToolUseHooks(config);
  config.hooks.postToolUse = [...retained, createTokenjuiceCopilotAgentHook(command)];
  if (config.disableAllHooks === true) {
    config.disableAllHooks = false;
  }
  if (typeof config.version !== "number") {
    config.version = 1;
  }

  await ensureHooksDir(dirname(resolvedHooksPath));
  await writeCopilotHooksConfigAtomic(resolvedHooksPath, config);
  await uninstallStrayCopilotAgentHookFiles(dirname(resolvedHooksPath), resolvedHooksPath);

  return {
    hooksPath: resolvedHooksPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallCopilotAgentHook(
  hooksPath?: string,
  options: CopilotAgentHookCommandOptions = {},
): Promise<UninstallCopilotAgentHookResult> {
  const resolvedHooksPath = hooksPath ?? await getDefaultHooksPath(options, true);
  const hooksDir = dirname(resolvedHooksPath);
  const { config, exists } = await readCopilotHooksConfig(resolvedHooksPath, "copilot-agent");
  let removed = 0;
  let deletedFile = false;

  if (exists) {
    const removedFromCanonical = removeTokenjuiceCopilotAgentHooks(config);
    if (removedFromCanonical > 0) {
      deletedFile = await writeOrDeleteHooksConfig(resolvedHooksPath, config);
      removed += removedFromCanonical;
    }
  }

  removed += await uninstallStrayCopilotAgentHookFiles(hooksDir, resolvedHooksPath);

  return { hooksPath: resolvedHooksPath, removed, deletedFile };
}

export async function doctorCopilotAgentHook(
  hooksPath?: string,
  options: CopilotAgentHookCommandOptions = {},
): Promise<CopilotAgentDoctorReport> {
  const resolvedHooksPath = hooksPath ?? await getDefaultHooksPath(options);
  const expectedCommand = await buildCopilotAgentHookCommand(options);
  const fixCommand = getCopilotAgentFixCommand(options.local);
  const { config, exists } = await readCopilotHooksConfig(resolvedHooksPath, "copilot-agent");
  const strayHooks = await findStrayCopilotAgentHooks(dirname(resolvedHooksPath), resolvedHooksPath);
  const strayIssues = strayHooks.map((stray) => `stray tokenjuice entry in sibling hook file: ${stray.path}`);
  const strayDetectedCommand = strayHooks[0]?.command;
  const advisories = [exists ? TOKENJUICE_COPILOT_AGENT_ADVISORY : TOKENJUICE_COPILOT_AGENT_DISABLED_ADVISORY];

  if (!exists) {
    return {
      hooksPath: resolvedHooksPath,
      status: strayIssues.length > 0 ? "warn" : "disabled",
      issues: strayIssues,
      advisories,
      fixCommand,
      expectedCommand,
      ...(strayDetectedCommand ? { detectedCommand: strayDetectedCommand } : {}),
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const detectedCommand = findTokenjuiceCopilotAgentHookCommand(config);
  const canonicalDetectedCommand = detectedCommand ?? findAnyTokenjuiceCopilotAgentHookCommand(config);
  const misplacedEvents = findMisplacedTokenjuiceCopilotAgentHookEvents(config);
  const misplacedIssues = misplacedEvents.map(
    (eventName) => `tokenjuice copilot-agent hook is configured outside postToolUse in ${eventName}; run ${fixCommand} to repair`,
  );
  if (!detectedCommand) {
    const detectedInstallCommand = canonicalDetectedCommand ?? strayDetectedCommand;
    return {
      hooksPath: resolvedHooksPath,
      status: canonicalDetectedCommand || strayIssues.length > 0 ? "warn" : "disabled",
      issues: [...misplacedIssues, ...strayIssues],
      advisories,
      fixCommand,
      expectedCommand,
      ...(detectedInstallCommand ? { detectedCommand: detectedInstallCommand } : {}),
      checkedPaths: [],
      missingPaths: [],
    };
  }

  if (config.disableAllHooks === true) {
    return {
      hooksPath: resolvedHooksPath,
      status: "broken",
      issues: [
        "copilot-agent hook file sets disableAllHooks: true; configured hooks will not run",
        ...misplacedIssues,
        ...strayIssues,
      ],
      advisories,
      fixCommand,
      expectedCommand,
      detectedCommand,
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
  issues.push(...collectTokenjuiceHookTimeoutWarnings(config, fixCommand));
  issues.push(...misplacedIssues);
  if (detectedCommand !== expectedCommand) {
    issues.push("configured copilot-agent hook command does not match the current recommended command");
  }
  if (missingPaths.length > 0) {
    issues.push(`configured copilot-agent hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
  }
  issues.push(...strayIssues);

  return {
    hooksPath: resolvedHooksPath,
    status: missingPaths.length > 0 ? "broken" : issues.length > 0 ? "warn" : "ok",
    issues,
    advisories,
    fixCommand,
    expectedCommand,
    detectedCommand,
    checkedPaths,
    missingPaths,
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function commandRequestsTokenjuiceRawBypass(command: string): boolean {
  let argv: string[];
  try {
    argv = stripLeadingEnvAssignments(parseShellWords(stripLeadingCdPrefix(command)));
  } catch {
    return false;
  }
  if (argv.length < 3) {
    return false;
  }

  let wrapIndex = -1;
  const first = argv[0];
  const second = argv[1];
  if (typeof first === "string" && isTokenjuiceExecutablePath(first)) {
    wrapIndex = 1;
  } else if (
    typeof first === "string"
    && isNodeExecutablePath(first)
    && typeof second === "string"
    && second.endsWith(".js")
  ) {
    wrapIndex = 2;
  }

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
  const value = process.env.TOKENJUICE_COPILOT_AGENT_STORE;
  return value === "1" || value === "true" || value === "TRUE" || value === "yes" || value === "YES";
}

export async function runCopilotAgentPostToolUseHook(rawText: string): Promise<number> {
  let payload: CopilotAgentPostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as CopilotAgentPostToolUsePayload;
  } catch {
    process.stdout.write("{}\n");
    return 0;
  }

  const toolName = typeof payload.toolName === "string"
    ? payload.toolName
    : typeof payload.tool_name === "string"
    ? payload.tool_name
    : undefined;
  if (toolName !== "bash") {
    process.stdout.write("{}\n");
    return 0;
  }

  const toolInput = parseJsonObject(payload.toolArgs)
    ?? parseJsonObject(payload.toolInput)
    ?? parseJsonObject(payload.tool_input);
  const command = typeof toolInput?.command === "string" ? toolInput.command : undefined;
  if (!command || !command.trim() || commandRequestsTokenjuiceRawBypass(command)) {
    process.stdout.write("{}\n");
    return 0;
  }

  const toolResult = parseJsonObject(payload.toolResult) ?? parseJsonObject(payload.tool_result);
  if (!toolResult) {
    process.stdout.write("{}\n");
    return 0;
  }

  const resultType = typeof toolResult.resultType === "string"
    ? toolResult.resultType
    : typeof toolResult.result_type === "string"
    ? toolResult.result_type
    : undefined;
  if (resultType && resultType !== "success") {
    process.stdout.write("{}\n");
    return 0;
  }

  const visibleText = typeof toolResult.textResultForLlm === "string"
    ? toolResult.textResultForLlm
    : typeof toolResult.text_result_for_llm === "string"
    ? toolResult.text_result_for_llm
    : "";
  if (!visibleText.trim()) {
    process.stdout.write("{}\n");
    return 0;
  }

  const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_COPILOT_AGENT_MAX_INLINE_CHARS");

  try {
    const outcome = await compactBashResult({
      source: "copilot-agent",
      command,
      visibleText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      inspectionPolicy: "allow-safe-inventory",
      storeRaw: shouldStoreFromEnv(),
      metadata: { source: "copilot-agent-post-tool-use" },
      genericFallbackMinSavedChars: GENERIC_FALLBACK_MIN_SAVED_CHARS,
      genericFallbackMaxRatio: GENERIC_FALLBACK_MAX_RATIO,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.action === "keep") {
      process.stdout.write("{}\n");
      return 0;
    }

    process.stdout.write(`${JSON.stringify({
      modifiedResult: {
        ...toolResult,
        resultType: "success",
        result_type: "success",
        textResultForLlm: outcome.result.inlineText,
        text_result_for_llm: outcome.result.inlineText,
      },
    })}\n`);
    return 0;
  } catch {
    process.stdout.write("{}\n");
    return 0;
  }
}
