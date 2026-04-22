import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

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

type CursorHooksConfig = Record<string, unknown> & {
  version?: number;
  hooks: Record<string, unknown>;
};

type CursorHookCommandOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
};

type CursorPreToolUsePayload = {
  tool_name?: unknown;
  tool_input?: unknown;
};

type CursorToolInput = {
  command?: unknown;
  shell?: unknown;
} & Record<string, unknown>;

export type InstallCursorHookResult = {
  hooksPath: string;
  backupPath?: string;
  command: string;
};

export type CursorDoctorReport = {
  hooksPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_CURSOR_FIX_COMMAND = "tokenjuice install cursor";
const TOKENJUICE_CURSOR_WSL_FIX_COMMAND = "run Cursor in WSL, then run tokenjuice install cursor";
const TOKENJUICE_CURSOR_WINDOWS_ISSUE = "tokenjuice cursor integration does not support native Windows shells yet. run Cursor in WSL instead.";
const TOKENJUICE_CURSOR_WINDOWS_HOOK_ISSUE = "configured Cursor hook cannot run on native Windows; use Cursor in WSL instead.";
const TOKENJUICE_CURSOR_HOOK_SUBCOMMAND = "cursor-pre-tool-use";

function getCursorHome(): string {
  return process.env.CURSOR_HOME || join(homedir(), ".cursor");
}

function getDefaultHooksPath(): string {
  return join(getCursorHome(), "hooks.json");
}

function isNativeWindowsCursorUnsupported(): boolean {
  return process.platform === "win32";
}

async function buildCursorHookCommand(options: CursorHookCommandOptions = {}): Promise<string> {
  return buildWrapLauncherHookCommand({
    ...options,
    subcommand: TOKENJUICE_CURSOR_HOOK_SUBCOMMAND,
    hostName: "cursor",
  });
}

function getCursorFixCommand(local = false): string {
  return local ? "tokenjuice install cursor --local" : TOKENJUICE_CURSOR_FIX_COMMAND;
}

function isTokenjuiceCursorHook(rawHook: unknown): boolean {
  if (!isRecord(rawHook) || typeof rawHook.command !== "string") {
    return false;
  }
  return rawHook.command.includes(TOKENJUICE_CURSOR_HOOK_SUBCOMMAND);
}

function createTokenjuiceCursorHook(command: string): Record<string, unknown> {
  return {
    type: "command",
    matcher: "Shell",
    command,
  };
}

function sanitizeCursorHooksConfig(raw: unknown): CursorHooksConfig {
  if (!isRecord(raw)) {
    return { version: 1, hooks: {} };
  }

  return {
    ...raw,
    version: typeof raw.version === "number" ? raw.version : 1,
    hooks: isRecord(raw.hooks) ? { ...raw.hooks } : {},
  };
}

async function loadCursorHooksConfig(hooksPath: string): Promise<{ config: CursorHooksConfig; backupPath?: string }> {
  try {
    const rawText = await readFile(hooksPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    const config = sanitizeCursorHooksConfig(parsed);
    const backupPath = `${hooksPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config, backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { version: 1, hooks: {} } };
    }
    throw new Error(`failed to load cursor hooks from ${hooksPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readCursorHooksConfig(hooksPath: string): Promise<{ config: CursorHooksConfig; exists: boolean }> {
  try {
    const rawText = await readFile(hooksPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    return {
      config: sanitizeCursorHooksConfig(parsed),
      exists: true,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        config: { version: 1, hooks: {} },
        exists: false,
      };
    }
    throw new Error(`failed to read cursor hooks from ${hooksPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function findTokenjuiceCursorHookCommand(config: CursorHooksConfig): string | undefined {
  const preToolUse = config.hooks.preToolUse;
  if (!Array.isArray(preToolUse)) {
    return undefined;
  }

  for (const hook of preToolUse) {
    if (!isRecord(hook) || typeof hook.command !== "string") {
      continue;
    }
    if (isTokenjuiceCursorHook(hook)) {
      return hook.command;
    }
  }

  return undefined;
}

async function resolveCursorHostShell(toolInput: CursorToolInput): Promise<string | undefined> {
  return resolveHostShell([
    typeof toolInput.shell === "string" ? toolInput.shell : undefined,
    process.env.TOKENJUICE_CURSOR_SHELL,
    process.env.SHELL,
    "sh",
  ]);
}

export async function installCursorHook(
  hooksPath = getDefaultHooksPath(),
  options: CursorHookCommandOptions = {},
): Promise<InstallCursorHookResult> {
  if (isNativeWindowsCursorUnsupported()) {
    throw new Error(TOKENJUICE_CURSOR_WINDOWS_ISSUE);
  }

  const { config, backupPath } = await loadCursorHooksConfig(hooksPath);
  const command = await buildCursorHookCommand(options);
  const preToolUse = Array.isArray(config.hooks.preToolUse) ? config.hooks.preToolUse : [];
  const retained = preToolUse.filter((hook) => !isTokenjuiceCursorHook(hook));
  retained.push(createTokenjuiceCursorHook(command));
  config.hooks.preToolUse = retained;
  if (typeof config.version !== "number") {
    config.version = 1;
  }

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

export async function doctorCursorHook(
  hooksPath = getDefaultHooksPath(),
  options: CursorHookCommandOptions = {},
): Promise<CursorDoctorReport> {
  if (isNativeWindowsCursorUnsupported()) {
    const { config, exists } = await readCursorHooksConfig(hooksPath);
    const detectedCommand = findTokenjuiceCursorHookCommand(config);
    const checkedPaths = detectedCommand ? extractHookCommandPaths(detectedCommand) : [];
    return {
      hooksPath,
      status: exists && detectedCommand ? "broken" : "disabled",
      issues: [exists && detectedCommand ? TOKENJUICE_CURSOR_WINDOWS_HOOK_ISSUE : TOKENJUICE_CURSOR_WINDOWS_ISSUE],
      fixCommand: TOKENJUICE_CURSOR_WSL_FIX_COMMAND,
      expectedCommand: TOKENJUICE_CURSOR_WSL_FIX_COMMAND,
      ...(detectedCommand ? { detectedCommand } : {}),
      checkedPaths,
      missingPaths: [],
    };
  }

  const expectedCommand = await buildCursorHookCommand(options);
  const { config, exists } = await readCursorHooksConfig(hooksPath);
  const detectedCommand = findTokenjuiceCursorHookCommand(config);

  if (!exists || !detectedCommand) {
    return {
      hooksPath,
      status: "disabled",
      issues: [],
      fixCommand: getCursorFixCommand(options.local),
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
      issues.push("configured Cursor hook is pinned to a versioned Homebrew Cellar path");
    } else {
      issues.push("configured Cursor hook command does not match the current recommended command");
    }
  }
  if (missingPaths.length > 0) {
    issues.push(`configured Cursor hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
  }

  return {
    hooksPath,
    status: missingPaths.length > 0 ? "broken" : issues.length > 0 ? "warn" : "ok",
    issues,
    fixCommand: getCursorFixCommand(options.local),
    expectedCommand,
    detectedCommand,
    checkedPaths,
    missingPaths,
  };
}

export async function runCursorPreToolUseHook(rawText: string, wrapLauncher = "tokenjuice"): Promise<number> {
  let payload: CursorPreToolUsePayload;
  try {
    payload = JSON.parse(rawText) as CursorPreToolUsePayload;
  } catch {
    return 0;
  }

  if (payload.tool_name !== "Shell" || !isRecord(payload.tool_input)) {
    return 0;
  }

  const toolInput = payload.tool_input as CursorToolInput;
  const command = typeof toolInput.command === "string" ? toolInput.command : undefined;
  if (!command || !command.trim()) {
    return 0;
  }
  if (commandAlreadyWrapped(command)) {
    return 0;
  }
  if (process.platform === "win32") {
    const response = {
      permission: "deny",
      user_message: "tokenjuice cursor integration does not support native Windows shells yet. run Cursor in WSL instead.",
      agent_message: "Shell command blocked by tokenjuice: native Windows shell interception is not supported yet. Use Cursor in WSL and retry.",
    };
    process.stdout.write(`${JSON.stringify(response)}\n`);
    return 0;
  }
  const shellPath = await resolveCursorHostShell(toolInput);
  if (!shellPath) {
    return 0;
  }

  const wrappedCommand = buildWrappedCommand({ wrapLauncher, shellPath, command });
  const response = {
    permission: "allow",
    updated_input: {
      ...toolInput,
      command: wrappedCommand,
    },
  };
  process.stdout.write(`${JSON.stringify(response)}\n`);
  return 0;
}
