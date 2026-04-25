import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, rm } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";

import { stripLeadingCdPrefix } from "../../core/command.js";
import { extractHookCommandPaths, parseShellWords, shellQuote } from "../shared/hook-command.js";
import {
  ensureHooksDir,
  findStrayTokenjuiceHookFiles,
  isRecord,
  loadCopilotHooksConfigWithBackup,
  readCopilotHooksConfig,
  sanitizeCopilotHooksConfig,
  writeCopilotHooksConfigAtomic,
} from "../shared/hooks-json-file.js";
import type { CopilotHooksConfig } from "../shared/hooks-json-file.js";

type VscodeCopilotHooksConfig = CopilotHooksConfig;

export type VscodeCopilotHookCommandOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
};

export type InstallVscodeCopilotHookResult = {
  hooksPath: string;
  backupPath?: string;
  migratedFromPath?: string;
  command: string;
};

export type UninstallVscodeCopilotHookResult = {
  hooksPath: string;
  removed: number;
  deletedFile: boolean;
};

export type VscodeCopilotDoctorReport = {
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

type VscodeCopilotPreToolUsePayload = {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
};

const TOKENJUICE_VSCODE_COPILOT_FIX_COMMAND = "tokenjuice install vscode-copilot";
const TOKENJUICE_VSCODE_COPILOT_FILENAME = "tokenjuice-vscode.json";
const TOKENJUICE_VSCODE_COPILOT_LEGACY_FILENAME = "tokenjuice.json";
const TOKENJUICE_VSCODE_COPILOT_MATCHER = "run_in_terminal";
const TOKENJUICE_VSCODE_COPILOT_SUBCOMMAND = "vscode-copilot-pre-tool-use";
const TOKENJUICE_VSCODE_COPILOT_ADVISORY =
  "enable `chat.useHooks` in VS Code settings and trust the workspace; both are required for the hook to fire.";
const TOKENJUICE_VSCODE_COPILOT_INSTRUCTIONS_ADVISORY =
  "paste the snippet from `tokenjuice doctor vscode-copilot --print-instructions` into `.github/copilot-instructions.md` or `AGENTS.md` so the agent respects compacted output and knows when to prefix a command with `tokenjuice wrap --raw --`.";

const TOKENJUICE_VSCODE_COPILOT_INSTRUCTIONS_SNIPPET = `<!-- tokenjuice:vscode-copilot BEGIN -->
## Terminal output compaction (tokenjuice)

Terminal commands in this workspace are routed through tokenjuice, which
deterministically compacts noisy output (long file listings, install logs,
build transcripts, etc.) before returning it to you.

- Output ending with a \`[tokenjuice] ...\` footer is the **complete,
  authoritative result** for that command. The omitted content is not
  retrievable by re-running the command, varying flags, or switching tools.
  Proceed with the task using the compacted output.
- If a specific command genuinely requires raw, uncompacted bytes (e.g.,
  reading exact file contents for a diff, inspecting a log line-by-line),
  prefix that single command with \`tokenjuice wrap --raw --\`:

      tokenjuice wrap --raw -- cat path/to/file
      tokenjuice wrap --raw -- git log --oneline -n 50

  Use sparingly; do not use this to route around compaction for routine
  listings or searches.
<!-- tokenjuice:vscode-copilot END -->
`;

export function getVscodeCopilotInstructionsSnippet(): string {
  return TOKENJUICE_VSCODE_COPILOT_INSTRUCTIONS_SNIPPET;
}

// VS Code Copilot Chat resolves the hooks dir via pathService.userHome() and
// does NOT honor COPILOT_HOME. Only HOME matters here; COPILOT_HOME is a
// Copilot-CLI-only concern and is intentionally ignored by this adapter.
function getVscodeCopilotHooksDir(): string {
  return join(homedir(), ".copilot", "hooks");
}

function getDefaultHooksPath(): string {
  return join(getVscodeCopilotHooksDir(), TOKENJUICE_VSCODE_COPILOT_FILENAME);
}


async function isExecutableFile(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
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

async function buildVscodeCopilotHookCommand(
  options: VscodeCopilotHookCommandOptions = {},
): Promise<string> {
  const rawBinaryPath = options.binaryPath ?? process.argv[1];
  const binaryPath = rawBinaryPath && !isAbsolute(rawBinaryPath) ? resolve(rawBinaryPath) : rawBinaryPath;
  const nodePath = options.nodePath ?? process.execPath;
  if (!binaryPath) {
    throw new Error("unable to resolve tokenjuice binary path for vscode-copilot install");
  }

  let launcher = binaryPath;
  if (!options.local) {
    const installedBinaryPath = await resolveInstalledTokenjuicePath();
    launcher = installedBinaryPath ?? binaryPath;
  }

  const launcherCommand = launcher.endsWith(".js")
    ? `${shellQuote(nodePath)} ${shellQuote(launcher)}`
    : shellQuote(launcher);

  return `${launcherCommand} ${TOKENJUICE_VSCODE_COPILOT_SUBCOMMAND} --wrap-launcher ${shellQuote(launcher)}`;
}

function getVscodeCopilotFixCommand(local = false): string {
  return local
    ? `${TOKENJUICE_VSCODE_COPILOT_FIX_COMMAND} --local`
    : TOKENJUICE_VSCODE_COPILOT_FIX_COMMAND;
}

function isTokenjuiceVscodeCopilotHook(rawHook: unknown): boolean {
  if (!isRecord(rawHook) || typeof rawHook.command !== "string") {
    return false;
  }
  return rawHook.command.includes(TOKENJUICE_VSCODE_COPILOT_SUBCOMMAND);
}

function createTokenjuiceVscodeCopilotHook(command: string): Record<string, unknown> {
  return {
    type: "command",
    matcher: TOKENJUICE_VSCODE_COPILOT_MATCHER,
    command,
  };
}

function findTokenjuiceVscodeCopilotHookCommand(config: VscodeCopilotHooksConfig): string | undefined {
  const preToolUse = config.hooks.preToolUse;
  if (!Array.isArray(preToolUse)) {
    return undefined;
  }

  for (const hook of preToolUse) {
    if (isTokenjuiceVscodeCopilotHook(hook) && isRecord(hook) && typeof hook.command === "string") {
      return hook.command;
    }
  }

  return undefined;
}

async function migrateLegacyInstall(hooksDir: string, hooksPath: string): Promise<string | undefined> {
  const legacyPath = join(hooksDir, TOKENJUICE_VSCODE_COPILOT_LEGACY_FILENAME);
  if (legacyPath === hooksPath) {
    return undefined;
  }
  if (!(await pathExists(legacyPath))) {
    return undefined;
  }
  if (await pathExists(hooksPath)) {
    return undefined;
  }

  try {
    const rawText = await readFile(legacyPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    const config = sanitizeCopilotHooksConfig(parsed);
    if (!findTokenjuiceVscodeCopilotHookCommand(config)) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  await mkdir(hooksDir, { recursive: true });
  await rename(legacyPath, hooksPath);
  return legacyPath;
}

export async function installVscodeCopilotHook(
  hooksPath = getDefaultHooksPath(),
  options: VscodeCopilotHookCommandOptions = {},
): Promise<InstallVscodeCopilotHookResult> {
  const hooksDir = dirname(hooksPath);
  const migratedFromPath = await migrateLegacyInstall(hooksDir, hooksPath);

  const { config, backupPath } = await loadCopilotHooksConfigWithBackup(hooksPath, "vscode-copilot");
  const command = await buildVscodeCopilotHookCommand(options);
  const preToolUse = Array.isArray(config.hooks.preToolUse) ? config.hooks.preToolUse : [];
  const retained = preToolUse.filter((hook) => !isTokenjuiceVscodeCopilotHook(hook));
  retained.push(createTokenjuiceVscodeCopilotHook(command));
  config.hooks.preToolUse = retained;
  if (typeof config.version !== "number") {
    config.version = 1;
  }

  await ensureHooksDir(hooksDir);
  await writeCopilotHooksConfigAtomic(hooksPath, config);

  return {
    hooksPath,
    ...(backupPath ? { backupPath } : {}),
    ...(migratedFromPath ? { migratedFromPath } : {}),
    command,
  };
}

export async function uninstallVscodeCopilotHook(
  hooksPath = getDefaultHooksPath(),
): Promise<UninstallVscodeCopilotHookResult> {
  const { config, exists } = await readCopilotHooksConfig(hooksPath, "vscode-copilot");
  if (!exists) {
    return { hooksPath, removed: 0, deletedFile: false };
  }

  const preToolUse = Array.isArray(config.hooks.preToolUse) ? config.hooks.preToolUse : [];
  const retained = preToolUse.filter((hook) => !isTokenjuiceVscodeCopilotHook(hook));
  const removed = preToolUse.length - retained.length;

  if (removed === 0) {
    return { hooksPath, removed: 0, deletedFile: false };
  }

  if (retained.length === 0) {
    delete config.hooks.preToolUse;
  } else {
    config.hooks.preToolUse = retained;
  }

  // If the file has no remaining meaningful content (no hook events, no other
  // top-level keys), remove it entirely rather than leave an empty shell.
  const fileIsEmpty =
    Object.keys(config.hooks).length === 0
    && Object.keys(config).filter((key) => key !== "hooks" && key !== "version").length === 0;

  if (fileIsEmpty) {
    await rm(hooksPath, { force: true });
    return { hooksPath, removed, deletedFile: true };
  }

  await writeCopilotHooksConfigAtomic(hooksPath, config);

  return { hooksPath, removed, deletedFile: false };
}

async function findStrayVscodeCopilotHookFiles(
  hooksDir: string,
  canonicalPath: string,
): Promise<string[]> {
  return findStrayTokenjuiceHookFiles(
    hooksDir,
    canonicalPath,
    (command) => command.includes(TOKENJUICE_VSCODE_COPILOT_SUBCOMMAND),
  );
}

export async function doctorVscodeCopilotHook(
  hooksPath = getDefaultHooksPath(),
  options: VscodeCopilotHookCommandOptions = {},
): Promise<VscodeCopilotDoctorReport> {
  const expectedCommand = await buildVscodeCopilotHookCommand(options);
  const fixCommand = getVscodeCopilotFixCommand(options.local);
  const advisories = [
    TOKENJUICE_VSCODE_COPILOT_ADVISORY,
    TOKENJUICE_VSCODE_COPILOT_INSTRUCTIONS_ADVISORY,
  ];
  const { config, exists } = await readCopilotHooksConfig(hooksPath, "vscode-copilot");

  if (!exists) {
    return {
      hooksPath,
      status: "disabled",
      issues: [],
      advisories,
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  if (config.disableAllHooks === true) {
    const detectedCommand = findTokenjuiceVscodeCopilotHookCommand(config);
    return {
      hooksPath,
      status: "disabled",
      issues: ["vscode-copilot hook file sets disableAllHooks: true"],
      advisories,
      fixCommand,
      expectedCommand,
      ...(detectedCommand ? { detectedCommand } : {}),
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const detectedCommand = findTokenjuiceVscodeCopilotHookCommand(config);
  if (!detectedCommand) {
    return {
      hooksPath,
      status: "disabled",
      issues: [],
      advisories,
      fixCommand,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const strayFiles = await findStrayVscodeCopilotHookFiles(dirname(hooksPath), hooksPath);
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
      issues.push("configured vscode-copilot hook is pinned to a versioned Homebrew Cellar path");
    } else {
      issues.push("configured vscode-copilot hook command does not match the current recommended command");
    }
  }
  if (missingPaths.length > 0) {
    issues.push(
      `configured vscode-copilot hook points at missing path${missingPaths.length === 1 ? "" : "s"}`,
    );
  }
  for (const stray of strayFiles) {
    issues.push(`stray tokenjuice entry in sibling hook file: ${stray}`);
  }

  return {
    hooksPath,
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

function commandRequestsTokenjuiceRawBypass(command: string): boolean {
  const argv = parseShellWords(stripLeadingCdPrefix(command));
  if (argv.length < 2) {
    return false;
  }

  let wrapIndex = -1;
  const first = argv[0];
  const second = argv[1];

  if (first === "tokenjuice") {
    wrapIndex = 1;
  } else if (
    typeof first === "string"
    && /(?:^|[\\/])node(?:\.exe)?$/iu.test(first)
    && typeof second === "string"
    && second.endsWith(".js")
    && argv.slice(2).includes("wrap")
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

function commandAlreadyWrapped(command: string): boolean {
  const argv = parseShellWords(stripLeadingCdPrefix(command));
  if (argv.length < 2) {
    return false;
  }
  if (argv[0] === "tokenjuice" && argv[1] === "wrap") {
    return true;
  }
  const first = argv[0];
  const second = argv[1];
  if (
    typeof first === "string"
    && /(?:^|[\\/])node(?:\.exe)?$/iu.test(first)
    && typeof second === "string"
    && second.endsWith(".js")
    && argv.slice(2).includes("wrap")
  ) {
    return true;
  }
  return false;
}

function resolveWrapperShell(): { path: string; flag: string; platform: "win32" | "posix" } {
  if (process.platform === "win32") {
    return { path: "powershell", flag: "-Command", platform: "win32" };
  }
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL : "sh";
  return { path: shell, flag: "-lc", platform: "posix" };
}

export async function runVscodeCopilotPreToolUseHook(
  rawText: string,
  wrapLauncher = "tokenjuice",
): Promise<number> {
  let payload: VscodeCopilotPreToolUsePayload;
  try {
    payload = JSON.parse(rawText) as VscodeCopilotPreToolUsePayload;
  } catch {
    process.stdout.write("{}\n");
    return 0;
  }

  if (payload.tool_name !== TOKENJUICE_VSCODE_COPILOT_MATCHER || !isRecord(payload.tool_input)) {
    process.stdout.write("{}\n");
    return 0;
  }

  const toolInput = payload.tool_input as Record<string, unknown>;
  const command = typeof toolInput.command === "string" ? toolInput.command : undefined;
  if (!command || !command.trim()) {
    process.stdout.write("{}\n");
    return 0;
  }
  if (commandAlreadyWrapped(command)) {
    process.stdout.write("{}\n");
    return 0;
  }
  if (commandRequestsTokenjuiceRawBypass(command)) {
    process.stdout.write("{}\n");
    return 0;
  }

  const shell = resolveWrapperShell();
  const launcherCommand = wrapLauncher.endsWith(".js")
    ? `${shellQuote(process.execPath)} ${shellQuote(wrapLauncher)}`
    : shellQuote(wrapLauncher);
  const wrappedCommand =
    `${launcherCommand} wrap -- ${shellQuote(shell.path)} ${shell.flag} ${shellQuote(command)}`;

  const updatedInput: Record<string, unknown> = {
    ...toolInput,
    command: wrappedCommand,
  };

  const response = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput,
    },
  };
  process.stdout.write(`${JSON.stringify(response)}\n`);
  return 0;
}
