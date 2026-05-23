import { chmod, lstat, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import {
  buildTokenjuiceHookCommand,
  isExecutableFile,
  pathExists,
  type TokenjuiceHookCommandOptions,
} from "../shared/host-command.js";
import { buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { buildCompactedOutputContext } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";

export type MuxHookCommandOptions = TokenjuiceHookCommandOptions & {
  projectDir?: string;
};

export type InstallMuxHookResult = {
  hookPath: string;
  backupPath?: string;
  command: string;
};

export type UninstallMuxHookResult = {
  hookPath: string;
  removed: boolean;
};

export type MuxDoctorReport = {
  hookPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_MUX_SUBCOMMAND = "mux-post-tool-use";
const TOKENJUICE_MUX_FIX_COMMAND = "tokenjuice install mux";
const TOKENJUICE_MUX_ADVISORY = "Mux support is beta; .mux/tool_post adds compacted hook output but does not suppress the original tool result.";
const TOKENJUICE_MUX_BLOCK_BEGIN = "# tokenjuice:mux begin";
const TOKENJUICE_MUX_BLOCK_END = "# tokenjuice:mux end";
const TOKENJUICE_MUX_REINSTALL_BACKUP_SUFFIX = ".tokenjuice.bak";
const MAX_MUX_HOOK_JSON_BYTES = 8 * 1024 * 1024;

function getMuxFixCommand(local?: boolean): string {
  return local ? `${TOKENJUICE_MUX_FIX_COMMAND} --local` : TOKENJUICE_MUX_FIX_COMMAND;
}

async function findMuxHookSymlink(hookPath: string): Promise<{ label: string; path: string } | undefined> {
  for (const candidate of [
    { label: "directory", path: dirname(hookPath) },
    { label: "file", path: hookPath },
  ]) {
    try {
      const details = await lstat(candidate.path);
      if (details.isSymbolicLink()) {
        return candidate;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  return undefined;
}

async function assertNoMuxHookSymlink(hookPath: string, operation: string): Promise<void> {
  const symlink = await findMuxHookSymlink(hookPath);
  if (symlink) {
    throw new Error(`cannot safely ${operation} Mux hook through symlinked ${symlink.label} ${symlink.path}; remove the symlink, then rerun tokenjuice ${operation} mux`);
  }
}

async function assertNoMuxBackupSymlink(backupPath: string): Promise<void> {
  try {
    const details = await lstat(backupPath);
    if (details.isSymbolicLink()) {
      throw new Error(`cannot safely install Mux hook through symlinked backup file ${backupPath}; remove the symlink, then rerun tokenjuice install mux`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function backupPathExists(backupPath: string): Promise<boolean> {
  try {
    await lstat(backupPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function chooseMuxBackupPath(hookPath: string): Promise<string> {
  const primaryBackupPath = `${hookPath}.bak`;
  if (!(await backupPathExists(primaryBackupPath))) {
    return primaryBackupPath;
  }

  const secondaryBackupPath = `${hookPath}${TOKENJUICE_MUX_REINSTALL_BACKUP_SUFFIX}`;
  if (!(await backupPathExists(secondaryBackupPath))) {
    return secondaryBackupPath;
  }

  for (let index = 1; ; index += 1) {
    const backupPath = `${hookPath}.tokenjuice-${index}.bak`;
    if (!(await backupPathExists(backupPath))) {
      return backupPath;
    }
  }
}

function getProjectDir(options: MuxHookCommandOptions = {}): string {
  return options.projectDir || process.env.MUX_PROJECT_DIR || "";
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

async function resolveProjectDir(options: MuxHookCommandOptions = {}): Promise<string> {
  const projectDir = getProjectDir(options);
  if (projectDir) {
    return resolve(projectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultHookPath(options: MuxHookCommandOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".mux", "tool_post");
}

function buildHookBlock(command: string): string {
  return [
    TOKENJUICE_MUX_BLOCK_BEGIN,
    "(",
    "  set -euo pipefail",
    `  ${command}`,
    ") || true",
    TOKENJUICE_MUX_BLOCK_END,
  ].join("\n");
}

function hasBashShebang(script: string): boolean {
  const firstLine = script.split(/\r?\n/u)[0]?.trim().toLowerCase() ?? "";
  return /^#!\s*(?:\/\S*\/)?bash(?:\s|$)/u.test(firstLine)
    || /^#!\s*\/usr\/bin\/env\s+(?:-\S+\s+)*bash(?:\s|$)/u.test(firstLine);
}

function hasUnsupportedExistingHook(script: string): boolean {
  return Boolean(script.trim()) && !hasBashShebang(script);
}

function executableModeForExistingHook(mode: number): number {
  const permissions = mode & 0o777;
  return permissions | ((permissions & 0o444) >> 2) | 0o100;
}

function backupModeForExistingHook(mode: number): number {
  return (mode & 0o666) || 0o600;
}

function extractConfiguredCommand(script: string): string | undefined {
  for (const line of script.split(/\r?\n/u)) {
    const command = line.trim().replace(/^exec\s+/u, "");
    if (command && !command.startsWith("#") && command.includes(TOKENJUICE_MUX_SUBCOMMAND)) {
      return command;
    }
  }
  return undefined;
}

function removeTokenjuiceBlock(script: string): { text: string; removed: boolean } {
  const begin = script.indexOf(TOKENJUICE_MUX_BLOCK_BEGIN);
  const end = script.indexOf(TOKENJUICE_MUX_BLOCK_END);
  if (begin === -1 || end === -1 || end < begin) {
    return { text: script, removed: false };
  }
  const afterEnd = end + TOKENJUICE_MUX_BLOCK_END.length;
  const nextNewline = script.indexOf("\n", afterEnd);
  const blockEnd = nextNewline === -1 ? afterEnd : nextNewline + 1;
  return {
    text: `${script.slice(0, begin)}${script.slice(blockEnd)}`.replace(/\n{3,}/gu, "\n\n").trimEnd(),
    removed: true,
  };
}

function upsertTokenjuiceBlock(existing: string, command: string): string {
  const withoutBlock = removeTokenjuiceBlock(existing).text;
  const block = buildHookBlock(command);
  if (!withoutBlock.trim()) {
    return `#!/usr/bin/env bash\n${block}\n`;
  }

  const lines = withoutBlock.split(/\r?\n/u);
  const hasShebang = lines[0]?.startsWith("#!");
  if (!hasShebang) {
    return `#!/usr/bin/env bash\n${block}\n\n${withoutBlock.trimEnd()}\n`;
  }

  const [shebang, ...rest] = lines;
  const body = rest.join("\n").trimEnd();
  return `${shebang}\n${block}${body ? `\n\n${body}` : ""}\n`;
}

async function readConfiguredCommand(hookPath: string): Promise<string | undefined> {
  try {
    return extractConfiguredCommand(await readFile(hookPath, "utf8"));
  } catch {
    return undefined;
  }
}

async function writeMuxHookFile(hookPath: string, command: string): Promise<{ backupPath?: string }> {
  await assertNoMuxHookSymlink(hookPath, "install");

  let backupPath: string | undefined;
  let existing = "";
  let existingMode: number | undefined;
  let existingExists = false;
  try {
    existingMode = (await stat(hookPath)).mode;
    existing = await readFile(hookPath, "utf8");
    existingExists = true;
    if (hasUnsupportedExistingHook(existing)) {
      throw new Error(`cannot safely install Mux hook over non-bash ${hookPath}; convert it to a bash hook or remove it, then rerun tokenjuice install mux`);
    }
    const nextScript = upsertTokenjuiceBlock(existing, command);
    if (existing === nextScript) {
      await chmod(hookPath, executableModeForExistingHook(existingMode ?? 0o755));
      return {};
    }
    backupPath = await chooseMuxBackupPath(hookPath);
    await assertNoMuxBackupSymlink(backupPath);
    const backupMode = backupModeForExistingHook(existingMode ?? 0o600);
    await writeFile(backupPath, existing, { encoding: "utf8", mode: backupMode });
    await chmod(backupPath, backupMode);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || existingExists) {
      throw error;
    }
  }

  await mkdir(dirname(hookPath), { recursive: true });
  await writeFile(hookPath, upsertTokenjuiceBlock(existing, command), "utf8");
  await chmod(hookPath, existingMode === undefined ? 0o755 : executableModeForExistingHook(existingMode));
  return backupPath ? { backupPath } : {};
}

export async function installMuxHook(
  hookPath?: string,
  options: MuxHookCommandOptions = {},
): Promise<InstallMuxHookResult> {
  const resolvedHookPath = hookPath ?? (await getDefaultHookPath(options));
  const command = await buildTokenjuiceHookCommand(TOKENJUICE_MUX_SUBCOMMAND, "mux", options);
  const result = await writeMuxHookFile(resolvedHookPath, command);
  return {
    hookPath: resolvedHookPath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
    command,
  };
}

export async function uninstallMuxHook(
  hookPath?: string,
  options: MuxHookCommandOptions = {},
): Promise<UninstallMuxHookResult> {
  const resolvedHookPath = hookPath ?? (await getDefaultHookPath(options));
  await assertNoMuxHookSymlink(resolvedHookPath, "uninstall");

  let existing = "";
  let existingMode = 0o755;
  try {
    existingMode = (await stat(resolvedHookPath)).mode & 0o777;
    existing = await readFile(resolvedHookPath, "utf8");
  } catch {
    return { hookPath: resolvedHookPath, removed: false };
  }

  const removed = removeTokenjuiceBlock(existing);
  if (removed.removed) {
    const remainingWithoutShebang = removed.text.replace(/^#![^\n]*\n?/u, "").trim();
    if (remainingWithoutShebang) {
      await writeFile(resolvedHookPath, `${removed.text.trimEnd()}\n`, "utf8");
      await chmod(resolvedHookPath, existingMode);
    } else {
      await rm(resolvedHookPath, { force: true });
    }
    return { hookPath: resolvedHookPath, removed: true };
  }

  return { hookPath: resolvedHookPath, removed: false };
}

export async function doctorMuxHook(
  hookPath?: string,
  options: MuxHookCommandOptions = {},
): Promise<MuxDoctorReport> {
  const resolvedHookPath = hookPath ?? (await getDefaultHookPath(options));
  const expectedCommand = await buildTokenjuiceHookCommand(TOKENJUICE_MUX_SUBCOMMAND, "mux", options);
  const fixCommand = getMuxFixCommand(options.local);
  const symlink = await findMuxHookSymlink(resolvedHookPath);
  if (symlink) {
    return {
      hookPath: resolvedHookPath,
      ...(await buildHookCommandDoctorFields({
        expectedCommand,
        detectedCommand: undefined,
        disabledIssue: "tokenjuice tool_post hook is not installed for Mux",
        hostLabel: "Mux",
        advisory: TOKENJUICE_MUX_ADVISORY,
        fixCommand,
      })),
      status: "broken",
      issues: [
        `configured Mux tool_post hook uses a symlinked ${symlink.label} at ${symlink.path}; remove it before running ${fixCommand}`,
      ],
    };
  }

  const detectedCommand = await readConfiguredCommand(resolvedHookPath);
  const fields = await buildHookCommandDoctorFields({
    expectedCommand,
    detectedCommand,
    disabledIssue: "tokenjuice tool_post hook is not installed for Mux",
    hostLabel: "Mux",
    advisory: TOKENJUICE_MUX_ADVISORY,
    fixCommand,
  });

  if (detectedCommand && !(await isExecutableFile(resolvedHookPath))) {
    return {
      hookPath: resolvedHookPath,
      ...fields,
      status: "broken",
      issues: [
        ...fields.issues,
        `configured Mux tool_post hook is not executable; run ${fixCommand} to repair it`,
      ],
    };
  }

  return {
    hookPath: resolvedHookPath,
    ...fields,
  };
}

async function readJsonFile(path: string | undefined): Promise<unknown> {
  if (!path || !(await pathExists(path))) {
    return undefined;
  }
  try {
    const details = await stat(path);
    if (!details.isFile() || details.size > MAX_MUX_HOOK_JSON_BYTES) {
      return undefined;
    }
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function readStringField(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function readNumberField(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function readCommand(env: NodeJS.ProcessEnv, input: unknown): string | undefined {
  if (typeof env.MUX_TOOL_INPUT_SCRIPT === "string" && env.MUX_TOOL_INPUT_SCRIPT.trim()) {
    return env.MUX_TOOL_INPUT_SCRIPT;
  }
  if (!isRecord(input)) {
    return undefined;
  }
  return readStringField(input, ["script", "command", "cmd"]);
}

function readResultText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (!isRecord(result)) {
    return "";
  }

  const output = readStringField(result, ["output", "text", "content", "result", "llmContent"]);
  const stdout = readStringField(result, ["stdout"]);
  const stderr = readStringField(result, ["stderr"]);
  if (stdout || stderr) {
    return [stdout, stderr].filter(Boolean).join("\n");
  }
  return output ?? "";
}

function readExitCode(env: NodeJS.ProcessEnv, result: unknown): number | undefined {
  if (typeof env.MUX_TOOL_RESULT_EXIT_CODE === "string" && env.MUX_TOOL_RESULT_EXIT_CODE.trim()) {
    const value = Number(env.MUX_TOOL_RESULT_EXIT_CODE);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  if (!isRecord(result)) {
    return undefined;
  }
  return readNumberField(result, ["exitCode", "exit_code", "code"]);
}

export async function runMuxPostToolUseHook(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (env.MUX_TOOL !== "bash") {
    return 0;
  }

  const [input, result] = await Promise.all([
    readJsonFile(env.MUX_TOOL_INPUT_PATH),
    readJsonFile(env.MUX_TOOL_RESULT_PATH),
  ]);
  const command = readCommand(env, input);
  const visibleText = readResultText(result);
  if (!command || !visibleText.trim()) {
    return 0;
  }

  try {
    const exitCode = readExitCode(env, result);
    const outcome = await compactBashResult({
      source: "mux",
      command,
      visibleText,
      ...(env.PWD ? { cwd: env.PWD } : {}),
      ...(exitCode !== undefined ? { exitCode } : {}),
      inspectionPolicy: "allow-safe-inventory",
      metadata: { source: "mux-post-tool-use" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    if (outcome.action === "rewrite") {
      process.stdout.write(`${buildCompactedOutputContext(outcome.result.inlineText)}\n`);
    }
    return 0;
  } catch {
    return 0;
  }
}
