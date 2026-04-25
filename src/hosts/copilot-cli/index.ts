import { constants as fsConstants } from "node:fs";
import { access, rm } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";

import { stripLeadingCdPrefix } from "../../core/command.js";
import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import { extractHookCommandPaths, parseShellWords, shellQuote } from "../shared/hook-command.js";
import {
  ensureHooksDir,
  findStrayTokenjuiceHookFiles,
  isRecord,
  loadCopilotHooksConfigWithBackup,
  readCopilotHooksConfig,
  writeCopilotHooksConfigAtomic,
} from "../shared/hooks-json-file.js";
import type { CopilotHooksConfig } from "../shared/hooks-json-file.js";

type CopilotCliHooksConfig = CopilotHooksConfig;

export type CopilotCliHookCommandOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
};

export type InstallCopilotCliHookResult = {
  hooksPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallCopilotCliHookResult = {
  hooksPath: string;
  removed: number;
  deletedFile: boolean;
};

export type CopilotCliDoctorReport = {
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

// The Copilot CLI PostToolUse stdin payload is delivered in **camelCase**
// (`toolName`, `toolArgs`, `toolResult`, `textResultForLlm`, `resultType`)
// on live 1.0.35. Some historical fixtures and the design brief showed
// snake_case keys, so we accept both and normalize here.
type CopilotCliPostToolUsePayload = {
  hook_event_name?: unknown;
  hookEventName?: unknown;
  tool_name?: unknown;
  toolName?: unknown;
  cwd?: unknown;
  tool_input?: unknown;
  toolInput?: unknown;
  toolArgs?: unknown;
  tool_result?: unknown;
  toolResult?: unknown;
};

const TOKENJUICE_COPILOT_CLI_FIX_COMMAND = "tokenjuice install copilot-cli";
const TOKENJUICE_COPILOT_CLI_FILENAME = "tokenjuice-cli.json";
const TOKENJUICE_COPILOT_CLI_MATCHER = "shell";
const TOKENJUICE_COPILOT_CLI_SUBCOMMAND = "copilot-cli-post-tool-use";
const TOKENJUICE_COPILOT_CLI_INSTRUCTIONS_ADVISORY =
  "paste the snippet from `tokenjuice doctor copilot-cli --print-instructions` into `.github/copilot-instructions.md` or `AGENTS.md` so the agent respects compacted output and knows when to prefix a command with `tokenjuice wrap --raw --`.";

const GENERIC_FALLBACK_MIN_SAVED_CHARS = 120;
const GENERIC_FALLBACK_MAX_RATIO = 0.75;

const TOKENJUICE_COPILOT_CLI_INSTRUCTIONS_SNIPPET = `<!-- tokenjuice:copilot-cli BEGIN -->
## Terminal output compaction (tokenjuice)

Shell commands in this workspace are routed through tokenjuice, which
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
<!-- tokenjuice:copilot-cli END -->
`;

export function getCopilotCliInstructionsSnippet(): string {
  return TOKENJUICE_COPILOT_CLI_INSTRUCTIONS_SNIPPET;
}

// Copilot CLI resolves its install dir from `COPILOT_HOME`, falling back to
// `$HOME/.copilot`. VS Code Copilot Chat ignores `COPILOT_HOME`, so the two
// hosts may write into different dirs when `COPILOT_HOME` is set.
function getCopilotCliHome(): string {
  return process.env.COPILOT_HOME || join(homedir(), ".copilot");
}

function getCopilotCliHooksDir(): string {
  return join(getCopilotCliHome(), "hooks");
}

function getDefaultHooksPath(): string {
  return join(getCopilotCliHooksDir(), TOKENJUICE_COPILOT_CLI_FILENAME);
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

async function buildCopilotCliHookCommand(
  options: CopilotCliHookCommandOptions = {},
): Promise<string> {
  const rawBinaryPath = options.binaryPath ?? process.argv[1];
  const binaryPath = rawBinaryPath && !isAbsolute(rawBinaryPath) ? resolve(rawBinaryPath) : rawBinaryPath;
  const nodePath = options.nodePath ?? process.execPath;
  if (!binaryPath) {
    throw new Error("unable to resolve tokenjuice binary path for copilot-cli install");
  }

  let launcher = binaryPath;
  if (!options.local) {
    const installedBinaryPath = await resolveInstalledTokenjuicePath();
    launcher = installedBinaryPath ?? binaryPath;
  }

  if (launcher.endsWith(".js")) {
    return `${shellQuote(nodePath)} ${shellQuote(launcher)} ${TOKENJUICE_COPILOT_CLI_SUBCOMMAND}`;
  }
  return `${shellQuote(launcher)} ${TOKENJUICE_COPILOT_CLI_SUBCOMMAND}`;
}

function getCopilotCliFixCommand(local = false): string {
  return local
    ? `${TOKENJUICE_COPILOT_CLI_FIX_COMMAND} --local`
    : TOKENJUICE_COPILOT_CLI_FIX_COMMAND;
}

function isTokenjuiceCopilotCliHook(rawHook: unknown): boolean {
  if (!isRecord(rawHook) || typeof rawHook.command !== "string") {
    return false;
  }
  return rawHook.command.includes(TOKENJUICE_COPILOT_CLI_SUBCOMMAND);
}

function createTokenjuiceCopilotCliHook(command: string): Record<string, unknown> {
  return {
    type: "command",
    matcher: TOKENJUICE_COPILOT_CLI_MATCHER,
    command,
  };
}

function findTokenjuiceCopilotCliHookCommand(config: CopilotCliHooksConfig): string | undefined {
  const postToolUse = config.hooks.postToolUse;
  if (!Array.isArray(postToolUse)) {
    return undefined;
  }

  for (const hook of postToolUse) {
    if (isTokenjuiceCopilotCliHook(hook) && isRecord(hook) && typeof hook.command === "string") {
      return hook.command;
    }
  }

  return undefined;
}

export async function installCopilotCliHook(
  hooksPath = getDefaultHooksPath(),
  options: CopilotCliHookCommandOptions = {},
): Promise<InstallCopilotCliHookResult> {
  const hooksDir = dirname(hooksPath);

  const { config, backupPath } = await loadCopilotHooksConfigWithBackup(hooksPath, "copilot-cli");
  const command = await buildCopilotCliHookCommand(options);
  const postToolUse = Array.isArray(config.hooks.postToolUse) ? config.hooks.postToolUse : [];
  const retained = postToolUse.filter((hook) => !isTokenjuiceCopilotCliHook(hook));
  retained.push(createTokenjuiceCopilotCliHook(command));
  config.hooks.postToolUse = retained;
  if (typeof config.version !== "number") {
    config.version = 1;
  }

  await ensureHooksDir(hooksDir);
  await writeCopilotHooksConfigAtomic(hooksPath, config);

  return {
    hooksPath,
    ...(backupPath ? { backupPath } : {}),
    command,
  };
}

export async function uninstallCopilotCliHook(
  hooksPath = getDefaultHooksPath(),
): Promise<UninstallCopilotCliHookResult> {
  const { config, exists } = await readCopilotHooksConfig(hooksPath, "copilot-cli");
  if (!exists) {
    return { hooksPath, removed: 0, deletedFile: false };
  }

  const postToolUse = Array.isArray(config.hooks.postToolUse) ? config.hooks.postToolUse : [];
  const retained = postToolUse.filter((hook) => !isTokenjuiceCopilotCliHook(hook));
  const removed = postToolUse.length - retained.length;

  if (removed === 0) {
    return { hooksPath, removed: 0, deletedFile: false };
  }

  if (retained.length === 0) {
    delete config.hooks.postToolUse;
  } else {
    config.hooks.postToolUse = retained;
  }

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

async function findStrayCopilotCliHookFiles(
  hooksDir: string,
  canonicalPath: string,
): Promise<string[]> {
  return findStrayTokenjuiceHookFiles(
    hooksDir,
    canonicalPath,
    (command) => command.includes(TOKENJUICE_COPILOT_CLI_SUBCOMMAND),
  );
}

export async function doctorCopilotCliHook(
  hooksPath = getDefaultHooksPath(),
  options: CopilotCliHookCommandOptions = {},
): Promise<CopilotCliDoctorReport> {
  const expectedCommand = await buildCopilotCliHookCommand(options);
  const fixCommand = getCopilotCliFixCommand(options.local);
  const advisories = [TOKENJUICE_COPILOT_CLI_INSTRUCTIONS_ADVISORY];
  const { config, exists } = await readCopilotHooksConfig(hooksPath, "copilot-cli");

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
    const detectedCommand = findTokenjuiceCopilotCliHookCommand(config);
    return {
      hooksPath,
      status: "disabled",
      issues: ["copilot-cli hook file sets disableAllHooks: true"],
      advisories,
      fixCommand,
      expectedCommand,
      ...(detectedCommand ? { detectedCommand } : {}),
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const detectedCommand = findTokenjuiceCopilotCliHookCommand(config);
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

  const strayFiles = await findStrayCopilotCliHookFiles(dirname(hooksPath), hooksPath);
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
      issues.push("configured copilot-cli hook is pinned to a versioned Homebrew Cellar path");
    } else {
      issues.push("configured copilot-cli hook command does not match the current recommended command");
    }
  }
  if (missingPaths.length > 0) {
    issues.push(
      `configured copilot-cli hook points at missing path${missingPaths.length === 1 ? "" : "s"}`,
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

function readPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function shouldStoreFromEnv(): boolean {
  const value = process.env.TOKENJUICE_COPILOT_CLI_STORE;
  return value === "1" || value === "true" || value === "TRUE" || value === "yes" || value === "YES";
}

export async function runCopilotCliPostToolUseHook(rawText: string): Promise<number> {
  let payload: CopilotCliPostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as CopilotCliPostToolUsePayload;
  } catch {
    process.stdout.write("{}\n");
    return 0;
  }

  // Only rewrite bash tool results. Matcher "shell" categorizes
  // `toolName: "bash"` on the wire. Skip everything else.
  // Live Copilot CLI 1.0.35 emits camelCase keys (`toolName`,
  // `toolInput`/`toolArgs`, `toolResult`, `textResultForLlm`, `resultType`);
  // the original design brief and captured fixture used snake_case. Accept
  // both shapes.
  const toolName = typeof payload.toolName === "string"
    ? payload.toolName
    : typeof payload.tool_name === "string"
    ? payload.tool_name
    : undefined;
  if (toolName !== "bash") {
    process.stdout.write("{}\n");
    return 0;
  }

  const toolInput = isRecord(payload.toolInput)
    ? payload.toolInput
    : isRecord(payload.toolArgs)
    ? payload.toolArgs
    : isRecord(payload.tool_input)
    ? payload.tool_input
    : undefined;
  const command = toolInput && typeof toolInput.command === "string" ? toolInput.command : undefined;
  if (!command || !command.trim()) {
    process.stdout.write("{}\n");
    return 0;
  }

  const toolResult = isRecord(payload.toolResult)
    ? payload.toolResult
    : isRecord(payload.tool_result)
    ? payload.tool_result
    : undefined;
  if (!toolResult) {
    process.stdout.write("{}\n");
    return 0;
  }

  const resultType = typeof toolResult.resultType === "string"
    ? toolResult.resultType
    : typeof toolResult.result_type === "string"
    ? toolResult.result_type
    : undefined;
  // Only rewrite success output; failure/rejected/denied payloads pass
  // through untouched so the agent still sees error context verbatim.
  if (resultType && resultType !== "success") {
    process.stdout.write("{}\n");
    return 0;
  }

  const combinedText = typeof toolResult.textResultForLlm === "string"
    ? toolResult.textResultForLlm
    : typeof toolResult.text_result_for_llm === "string"
    ? toolResult.text_result_for_llm
    : "";
  if (!combinedText.trim()) {
    process.stdout.write("{}\n");
    return 0;
  }

  if (commandRequestsTokenjuiceRawBypass(command)) {
    process.stdout.write("{}\n");
    return 0;
  }

  const maxInlineChars = readPositiveIntegerEnv("TOKENJUICE_COPILOT_CLI_MAX_INLINE_CHARS");

  try {
    const outcome = await compactBashResult({
      source: "copilot-cli",
      command,
      visibleText: combinedText,
      ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
      ...(typeof maxInlineChars === "number" ? { maxInlineChars } : {}),
      inspectionPolicy: "allow-safe-inventory",
      storeRaw: shouldStoreFromEnv(),
      metadata: { source: "copilot-cli-post-tool-use" },
      genericFallbackMinSavedChars: GENERIC_FALLBACK_MIN_SAVED_CHARS,
      genericFallbackMaxRatio: GENERIC_FALLBACK_MAX_RATIO,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.action === "keep") {
      process.stdout.write("{}\n");
      return 0;
    }

    // Live Copilot CLI 1.0.35 speaks camelCase on the PostToolUse wire
    // (observed via a `tee` trace of real invocations). We emit BOTH
    // camelCase and snake_case keys to stay compatible across CLI versions
    // — the bundle's Zod `.passthrough()` on hook output does not reject
    // extra keys.
    const modifiedResult: Record<string, unknown> = {
      ...toolResult,
      textResultForLlm: outcome.result.inlineText,
      text_result_for_llm: outcome.result.inlineText,
    };
    const response: Record<string, unknown> = { modifiedResult };
    process.stdout.write(`${JSON.stringify(response)}\n`);
    return 0;
  } catch {
    process.stdout.write("{}\n");
    return 0;
  }
}
