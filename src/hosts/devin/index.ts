import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { isSetupWrapperSegment, splitTopLevelCommandChain, tokenizeCommand } from "../../core/command.js";
import { extractHookCommandPaths } from "../shared/hook-command.js";
import {
  buildWrapLauncherHookCommand,
  buildWrappedCommand,
  commandAlreadyWrapped,
  isExecutableFile,
  isRecord,
  pathExists,
  resolveHostShell,
} from "../shared/pre-tool-wrap.js";

type DevinHooksConfig = Record<string, unknown>;

type DevinPreToolUsePayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
};

type DevinExecToolInput = {
  command?: unknown;
  shell?: unknown;
} & Record<string, unknown>;

export type DevinHookCommandOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
  projectDir?: string;
};

export type InstallDevinHookResult = {
  hooksPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallDevinHookResult = {
  hooksPath: string;
  removed: number;
  deletedFile: boolean;
};

export type DevinDoctorReport = {
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

const TOKENJUICE_DEVIN_SUBCOMMAND = "devin-pre-tool-use";
const TOKENJUICE_DEVIN_FIX_COMMAND = "tokenjuice install devin";
const TOKENJUICE_DEVIN_MATCHER = "exec";
const TOKENJUICE_DEVIN_HOOK_TIMEOUT_SECONDS = 10;
const TOKENJUICE_DEVIN_ADVISORY = "Devin support uses Claude-compatible PreToolUse exec input rewriting to route shell commands through tokenjuice wrap.";

function getProjectDir(options: DevinHookCommandOptions = {}): string {
  return resolve(options.projectDir || process.env.DEVIN_PROJECT_DIR || process.cwd());
}

function getDefaultHooksPath(options: DevinHookCommandOptions = {}): string {
  return join(getProjectDir(options), ".devin", "hooks.v1.json");
}

async function buildDevinHookCommand(options: DevinHookCommandOptions = {}): Promise<string> {
  return buildWrapLauncherHookCommand({
    ...options,
    subcommand: TOKENJUICE_DEVIN_SUBCOMMAND,
    hostName: "devin",
  });
}

function getDevinFixCommand(local = false): string {
  return local ? `${TOKENJUICE_DEVIN_FIX_COMMAND} --local` : TOKENJUICE_DEVIN_FIX_COMMAND;
}

function sanitizeDevinHooksConfig(raw: unknown): DevinHooksConfig {
  return isRecord(raw) ? { ...raw } : {};
}

async function readDevinHooksConfig(hooksPath: string): Promise<{ config: DevinHooksConfig; exists: boolean }> {
  try {
    const rawText = await readFile(hooksPath, "utf8");
    return { config: sanitizeDevinHooksConfig(JSON.parse(rawText) as unknown), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: {}, exists: false };
    }
    throw new Error(`failed to read Devin hooks from ${hooksPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadDevinHooksConfigWithBackup(hooksPath: string): Promise<{ config: DevinHooksConfig; backupPath?: string }> {
  try {
    const rawText = await readFile(hooksPath, "utf8");
    const backupPath = `${hooksPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config: sanitizeDevinHooksConfig(JSON.parse(rawText) as unknown), backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: {} };
    }
    throw new Error(`failed to load Devin hooks from ${hooksPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeDevinHooksConfig(hooksPath: string, config: DevinHooksConfig): Promise<void> {
  await mkdir(dirname(hooksPath), { recursive: true });
  const tempPath = `${hooksPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, hooksPath);
}

function isTokenjuiceDevinHookEntry(hook: unknown): boolean {
  return isRecord(hook)
    && typeof hook.command === "string"
    && hook.command.includes(TOKENJUICE_DEVIN_SUBCOMMAND);
}

function getPreToolUseGroups(config: DevinHooksConfig): unknown[] {
  const preToolUse = config.PreToolUse;
  return Array.isArray(preToolUse) ? preToolUse : [];
}

function findTokenjuiceDevinHookCommand(config: DevinHooksConfig): string | undefined {
  for (const group of getPreToolUseGroups(config)) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }
    const hook = group.hooks.find(isTokenjuiceDevinHookEntry);
    if (isRecord(hook) && typeof hook.command === "string") {
      return hook.command;
    }
  }
  return undefined;
}

function removeTokenjuiceDevinHooks(config: DevinHooksConfig): number {
  const preToolUse = getPreToolUseGroups(config);
  const retainedGroups: unknown[] = [];
  let removed = 0;

  for (const group of preToolUse) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      retainedGroups.push(group);
      continue;
    }

    const retainedHooks = group.hooks.filter((hook) => !isTokenjuiceDevinHookEntry(hook));
    removed += group.hooks.length - retainedHooks.length;
    if (retainedHooks.length > 0) {
      retainedGroups.push({ ...group, hooks: retainedHooks });
    }
  }

  if (retainedGroups.length === 0) {
    delete config.PreToolUse;
  } else {
    config.PreToolUse = retainedGroups;
  }
  return removed;
}

function createTokenjuiceDevinHook(command: string): Record<string, unknown> {
  return {
    matcher: TOKENJUICE_DEVIN_MATCHER,
    hooks: [
      {
        type: "command",
        command,
        timeout: TOKENJUICE_DEVIN_HOOK_TIMEOUT_SECONDS,
      },
    ],
  };
}

function configIsEmpty(config: DevinHooksConfig): boolean {
  return Object.keys(config).length === 0;
}

async function resolveDevinHostShell(toolInput: DevinExecToolInput): Promise<string | undefined> {
  return resolveHostShell([
    typeof toolInput.shell === "string" ? toolInput.shell : undefined,
    process.env.TOKENJUICE_DEVIN_SHELL,
    process.env.SHELL,
    "bash",
    "sh",
  ]);
}

function isDevinStatefulShellSegment(argv: string[], command: string): boolean {
  const commandName = argv[0]?.split(/[\\/]/u).pop();
  if (!commandName) {
    return true;
  }
  if (isSetupWrapperSegment(argv, command)) {
    return true;
  }

  if (commandName === "nvm" && argv[1] === "use") {
    return true;
  }
  if (
    (commandName === "conda" || commandName === "micromamba" || commandName === "mamba")
    && (argv[1] === "activate" || argv[1] === "deactivate")
  ) {
    return true;
  }
  if (
    (commandName === "pyenv" || commandName === "rbenv" || commandName === "asdf")
    && argv[1] === "shell"
  ) {
    return true;
  }
  if (
    commandName === "shopt"
    || commandName === "alias"
    || commandName === "unalias"
    || commandName === "ulimit"
    || commandName === "umask"
  ) {
    return true;
  }

  return false;
}

function commandOnlyMutatesDevinShellState(command: string): boolean {
  const segments = splitTopLevelCommandChain(command);
  return segments.length > 0
    && segments.every((segment) => isDevinStatefulShellSegment(tokenizeCommand(segment), segment));
}

export async function installDevinHook(
  hooksPath?: string,
  options: DevinHookCommandOptions = {},
): Promise<InstallDevinHookResult> {
  const resolvedHooksPath = hooksPath ?? getDefaultHooksPath(options);
  const { config, backupPath } = await loadDevinHooksConfigWithBackup(resolvedHooksPath);
  const command = await buildDevinHookCommand(options);
  removeTokenjuiceDevinHooks(config);
  config.PreToolUse = [...getPreToolUseGroups(config), createTokenjuiceDevinHook(command)];

  await writeDevinHooksConfig(resolvedHooksPath, config);
  return {
    hooksPath: resolvedHooksPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallDevinHook(
  hooksPath?: string,
  options: DevinHookCommandOptions = {},
): Promise<UninstallDevinHookResult> {
  const resolvedHooksPath = hooksPath ?? getDefaultHooksPath(options);
  const { config, exists: configExists } = await readDevinHooksConfig(resolvedHooksPath);
  if (!configExists) {
    return { hooksPath: resolvedHooksPath, removed: 0, deletedFile: false };
  }

  const removed = removeTokenjuiceDevinHooks(config);
  if (removed === 0) {
    return { hooksPath: resolvedHooksPath, removed: 0, deletedFile: false };
  }

  if (configIsEmpty(config)) {
    await rm(resolvedHooksPath, { force: true });
    return { hooksPath: resolvedHooksPath, removed, deletedFile: true };
  }

  await writeDevinHooksConfig(resolvedHooksPath, config);
  return { hooksPath: resolvedHooksPath, removed, deletedFile: false };
}

export async function doctorDevinHook(
  hooksPath?: string,
  options: DevinHookCommandOptions = {},
): Promise<DevinDoctorReport> {
  const resolvedHooksPath = hooksPath ?? getDefaultHooksPath(options);
  const expectedCommand = await buildDevinHookCommand(options);
  const { config, exists: configExists } = await readDevinHooksConfig(resolvedHooksPath);
  const detectedCommand = findTokenjuiceDevinHookCommand(config);
  const fixCommand = getDevinFixCommand(options.local);

  if (!configExists || !detectedCommand) {
    return {
      hooksPath: resolvedHooksPath,
      status: "disabled",
      issues: [],
      advisories: [TOKENJUICE_DEVIN_ADVISORY],
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
      issues.push("configured Devin hook is pinned to a versioned Homebrew Cellar path");
    } else {
      issues.push("configured Devin hook command does not match the current recommended command");
    }
  }
  if (missingPaths.length > 0) {
    issues.push(`configured Devin hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
  }

  return {
    hooksPath: resolvedHooksPath,
    status: missingPaths.length > 0 ? "broken" : issues.length > 0 ? "warn" : "ok",
    issues,
    advisories: [TOKENJUICE_DEVIN_ADVISORY],
    fixCommand,
    expectedCommand,
    detectedCommand,
    checkedPaths,
    missingPaths,
  };
}

export async function runDevinPreToolUseHook(rawText: string, wrapLauncher = "tokenjuice"): Promise<number> {
  let payload: DevinPreToolUsePayload;
  try {
    payload = JSON.parse(rawText) as DevinPreToolUsePayload;
  } catch {
    return 0;
  }

  if (payload.hook_event_name !== "PreToolUse") {
    return 0;
  }
  if (payload.tool_name !== "exec" || !isRecord(payload.tool_input)) {
    return 0;
  }

  const toolInput = payload.tool_input as DevinExecToolInput;
  const command = typeof toolInput.command === "string" ? toolInput.command : undefined;
  if (!command || !command.trim()) {
    return 0;
  }
  if (commandAlreadyWrapped(command)) {
    return 0;
  }
  if (commandOnlyMutatesDevinShellState(command)) {
    return 0;
  }

  const shellPath = await resolveDevinHostShell(toolInput);
  if (!shellPath) {
    return 0;
  }

  const wrappedCommand = buildWrappedCommand({ wrapLauncher, shellPath, command, source: "devin" });
  const response = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: {
        ...toolInput,
        command: wrappedCommand,
      },
    },
  };
  process.stdout.write(`${JSON.stringify(response)}\n`);
  return 0;
}
