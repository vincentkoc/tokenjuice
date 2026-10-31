import { lstat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";

import { rewriteClineInput } from "../../core/integrations/rewrite-cline-input.js";
import { parseTokenjuiceHookCommand, type TokenjuiceHookCommandOptions } from "../shared/host-command.js";
import { type HookCommandDoctorReport, buildHookCommandDoctorFields } from "../shared/hook-command-doctor.js";
import { writeEmptyHookJsonLine, writeHookJsonLine } from "../shared/hook-output.js";
import { buildWrapLauncherHookCommand, buildWrappedCommand, commandAlreadyWrapped, isExecutableFile, resolveHostShell } from "../shared/pre-tool-wrap.js";
import { readSettingsFile, removeSettingsFile, writeSettingsFile, type SettingsFile } from "../shared/settings-file.js";

export type ClineHookCommandOptions = TokenjuiceHookCommandOptions & { hooksDir?: string };
export type InstallClineHookResult = { hookPath: string; command: string };
export type UninstallClineHookResult = { hookPath: string; removed: boolean };
export type ClineDoctorReport = HookCommandDoctorReport<"hookPath">;

const PRE_TOOL = "cline-pre-tool-use";
const POST_TOOL = "cline-post-tool-use";
const ADVISORY = "Cline CLI 3.0.74 uses PreToolUse input rewriting; other versions and desktop sessions need separate acceptance.";

function hooksDir(options: ClineHookCommandOptions): string {
  return options.hooksDir || process.env.CLINE_HOOKS_DIR || join(homedir(), ".cline", "hooks");
}

function defaultHookPath(options: ClineHookCommandOptions): string {
  return join(hooksDir(options), "PreToolUse");
}

function legacyHookPath(options: ClineHookCommandOptions): string {
  const directory = options.hooksDir || process.env.CLINE_HOOKS_DIR || join(homedir(), "Documents", "Cline", "Hooks");
  return join(directory, process.platform === "win32" ? "tokenjuice-post-tool-use.ps1" : "tokenjuice-post-tool-use");
}

function scriptFor(command: string, legacy = false): string {
  return `#!/usr/bin/env bash\n${legacy ? "" : "# tokenjuice:cline pre-tool-use\n"}set -euo pipefail\nexec ${command}\n`;
}

function ownedCommand(file: SettingsFile): string | undefined {
  const script = file.data?.toString("utf8");
  if (!script) return undefined;
  const powershell = /^\$inputText \| & (.+)$/mu.exec(script)?.[1];
  if (powershell && script === `$inputText = [Console]::In.ReadToEnd()\n$inputText | & ${powershell}\n`) {
    try {
      if (parseTokenjuiceHookCommand(powershell, "win32").subcommand === POST_TOOL
        && powershell.trimEnd().endsWith(` ${POST_TOOL}`)) return powershell;
    } catch { /* Preserve custom PowerShell scripts. */ }
  }
  const command = /^exec (.+)$/mu.exec(script)?.[1];
  if (!command) return undefined;
  try {
    const parsed = parseTokenjuiceHookCommand(command);
    if (parsed.subcommand === PRE_TOOL && scriptFor(command) === script) return command;
    if (parsed.subcommand === POST_TOOL && command.trimEnd().endsWith(` ${POST_TOOL}`)
      && scriptFor(command, true) === script) return command;
  } catch { /* Unrecognized scripts belong to the user. */ }
  return undefined;
}

async function assertNoSymlink(path: string): Promise<void> {
  for (const candidate of [dirname(path), path]) {
    try {
      if ((await lstat(candidate)).isSymbolicLink()) throw new Error(`cannot modify Cline hook through symlink: ${candidate}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function removeOwnedHook(path: string): Promise<boolean> {
  await assertNoSymlink(path);
  const file = await readSettingsFile(path);
  if (!ownedCommand(file)) return false;
  await assertNoSymlink(path);
  return removeSettingsFile(file);
}

export async function installClineHook(
  hookPath?: string,
  options: ClineHookCommandOptions = {},
): Promise<InstallClineHookResult> {
  if (process.platform === "win32") throw new Error("Cline input wrapping requires a POSIX shell; use tokenjuice wrap manually on Windows");
  const path = hookPath ?? defaultHookPath(options);
  if (!["PreToolUse", "PreToolUse.sh"].includes(basename(path))) {
    throw new Error("Cline discovers hooks named PreToolUse or PreToolUse.sh; choose that filename");
  }
  await assertNoSymlink(path);
  const file = await readSettingsFile(path);
  if (file.metadata && !ownedCommand(file)) throw new Error(`Cline PreToolUse hook already exists and is not managed by tokenjuice: ${path}`);
  const legacy = legacyHookPath(options);
  if (legacy !== path) await assertNoSymlink(legacy);
  const command = await buildWrapLauncherHookCommand({ ...options, subcommand: PRE_TOOL, hostName: "Cline" });
  await assertNoSymlink(path);
  await writeSettingsFile(file, scriptFor(command), undefined, { mode: 0o755 });
  if (legacy !== path) await removeOwnedHook(legacy);
  return { hookPath: path, command };
}

export async function uninstallClineHook(
  hookPath?: string,
  options: ClineHookCommandOptions = {},
): Promise<UninstallClineHookResult> {
  const path = hookPath ?? defaultHookPath(options);
  let removed = await removeOwnedHook(path);
  if (!hookPath) removed = await removeOwnedHook(legacyHookPath(options)) || removed;
  return { hookPath: path, removed };
}

export async function doctorClineHook(
  hookPath?: string,
  options: ClineHookCommandOptions = {},
): Promise<ClineDoctorReport> {
  const path = hookPath ?? defaultHookPath(options);
  const expectedCommand = await buildWrapLauncherHookCommand({ ...options, subcommand: PRE_TOOL, hostName: "Cline" });
  let pathIssue: string | undefined;
  try {
    await assertNoSymlink(path);
  } catch (error) {
    pathIssue = (error as Error).message;
  }
  const file = pathIssue ? undefined : await readSettingsFile(path);
  const detectedCommand = file ? ownedCommand(file) : undefined;
  const fields = await buildHookCommandDoctorFields({ expectedCommand, detectedCommand,
    disabledIssue: "tokenjuice PreToolUse hook is not installed for Cline", hostLabel: "Cline", advisory: ADVISORY,
    fixCommand: `tokenjuice install cline${options.local ? " --local" : ""}` });
  const issues = [...fields.issues];
  if (pathIssue) issues.push(pathIssue);
  if (file?.metadata && !detectedCommand) issues.push("Cline PreToolUse path contains an unmanaged hook; preserve it and merge wrapping manually");
  if (detectedCommand && !(await isExecutableFile(path))) issues.push("Cline PreToolUse hook is not executable; reinstall tokenjuice");
  if (!detectedCommand && ownedCommand(await readSettingsFile(legacyHookPath(options)))) {
    issues.push("legacy tokenjuice PostToolUse hook is not discovered by current Cline; reinstall tokenjuice");
  }
  if (process.platform === "win32") issues.push("Cline input wrapping requires a POSIX shell; use tokenjuice wrap manually on Windows");
  return { hookPath: path, ...fields, issues, ...(issues.length && (file?.metadata || issues.length > fields.issues.length) ? { status: "broken" as const } : {}) };
}

export async function runClinePreToolUseHook(rawText: string, wrapLauncher = "tokenjuice"): Promise<number> {
  try {
    if (process.platform === "win32") { writeEmptyHookJsonLine(); return 0; }
    const payload: unknown = JSON.parse(rawText);
    const shellPath = await resolveHostShell([process.env.SHELL, "bash"]);
    if (!shellPath) { writeEmptyHookJsonLine(); return 0; }
    const result = rewriteClineInput(payload, command => commandAlreadyWrapped(command) ? command
      : buildWrappedCommand({ wrapLauncher, shellPath, command, source: "cline", keepFailures: true }));
    writeHookJsonLine(result ?? {});
  } catch {
    writeEmptyHookJsonLine();
  }
  return 0;
}

/** Legacy additive hooks must not add a second copy of output. */
export async function runClinePostToolUseHook(_rawText: string): Promise<number> {
  writeHookJsonLine({ cancel: false, contextModification: "", errorMessage: "" });
  return 0;
}
