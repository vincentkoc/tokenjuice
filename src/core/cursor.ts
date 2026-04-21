import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { homedir } from "node:os";

import { tokenizeCommand } from "./command.js";

type CursorHooksConfig = Record<string, unknown> & {
  version?: number;
  hooks: Record<string, unknown>;
};

type CursorHookCommandOptions = {
  binaryPath?: string;
  nodePath?: string;
};

type CursorPreToolUsePayload = {
  tool_name?: unknown;
  tool_input?: unknown;
};

type CursorToolInput = {
  command?: unknown;
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

function getCursorHome(): string {
  return process.env.CURSOR_HOME || join(homedir(), ".cursor");
}

function getDefaultHooksPath(): string {
  return join(getCursorHome(), "hooks.json");
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

async function buildCursorHookCommand(options: CursorHookCommandOptions = {}): Promise<string> {
  const rawBinaryPath = options.binaryPath ?? process.argv[1];
  const nodePath = options.nodePath ?? process.execPath;
  if (!rawBinaryPath) {
    throw new Error("unable to resolve tokenjuice binary path for cursor install");
  }

  const installedBinaryPath = await resolveInstalledTokenjuicePath();
  const launcher = installedBinaryPath ?? rawBinaryPath;
  const launcherCommand = launcher.endsWith(".js")
    ? `${shellQuote(nodePath)} ${shellQuote(launcher)}`
    : shellQuote(launcher);

  return `${launcherCommand} cursor-pre-tool-use --wrap-launcher ${shellQuote(launcher)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenjuiceCursorHook(rawHook: unknown): boolean {
  if (!isRecord(rawHook) || typeof rawHook.command !== "string") {
    return false;
  }
  return rawHook.command.includes("cursor-pre-tool-use");
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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

function commandAlreadyWrapped(command: string): boolean {
  const argv = tokenizeCommand(command);
  if (argv.length < 2) {
    return false;
  }

  if (argv[0] === "tokenjuice" && argv[1] === "wrap") {
    return true;
  }
  if (
    typeof argv[0] === "string"
    && (argv[0] === "node" || argv[0] === "node.exe" || argv[0].endsWith("/node") || argv[0].endsWith("\\node.exe"))
    && typeof argv[1] === "string"
    && argv[1].endsWith(".js")
    && argv.slice(2).includes("wrap")
  ) {
    return true;
  }
  return false;
}

export async function installCursorHook(
  hooksPath = getDefaultHooksPath(),
  options: CursorHookCommandOptions = {},
): Promise<InstallCursorHookResult> {
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
  const expectedCommand = await buildCursorHookCommand(options);
  const { config, exists } = await readCursorHooksConfig(hooksPath);
  const detectedCommand = findTokenjuiceCursorHookCommand(config);

  if (!exists || !detectedCommand) {
    return {
      hooksPath,
      status: "disabled",
      issues: [],
      fixCommand: TOKENJUICE_CURSOR_FIX_COMMAND,
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
    fixCommand: TOKENJUICE_CURSOR_FIX_COMMAND,
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

  const launcherCommand = wrapLauncher.endsWith(".js")
    ? `${shellQuote(process.execPath)} ${shellQuote(wrapLauncher)}`
    : shellQuote(wrapLauncher);
  const wrappedCommand = `${launcherCommand} wrap -- bash -lc ${shellQuote(command)}`;
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
