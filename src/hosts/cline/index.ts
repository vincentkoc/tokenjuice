import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import {
  buildTokenjuiceHookCommand,
  findMissingHookCommandPaths,
  pathExists,
  type TokenjuiceHookCommandOptions,
} from "../shared/host-command.js";
import { buildCompactedOutputContext } from "../shared/hook-output.js";
import { isRecord } from "../shared/hooks-json-file.js";

export type ClineHookCommandOptions = TokenjuiceHookCommandOptions & {
  hooksDir?: string;
};

export type InstallClineHookResult = {
  hookPath: string;
  command: string;
};

export type UninstallClineHookResult = {
  hookPath: string;
  removed: boolean;
};

export type ClineDoctorReport = {
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

type ClinePostToolUsePayload = {
  hookName?: unknown;
  postToolUse?: unknown;
  workspaceRoots?: unknown;
};

const TOKENJUICE_CLINE_SUBCOMMAND = "cline-post-tool-use";
const TOKENJUICE_CLINE_FIX_COMMAND = "tokenjuice install cline";
const TOKENJUICE_CLINE_HOOK_FILENAME = process.platform === "win32"
  ? "tokenjuice-post-tool-use.ps1"
  : "tokenjuice-post-tool-use";

function getClineHooksDir(options: ClineHookCommandOptions = {}): string {
  return options.hooksDir || process.env.CLINE_HOOKS_DIR || join(homedir(), "Documents", "Cline", "Hooks");
}

function getDefaultHookPath(options: ClineHookCommandOptions = {}): string {
  return join(getClineHooksDir(options), TOKENJUICE_CLINE_HOOK_FILENAME);
}

function buildHookScript(command: string): string {
  if (process.platform === "win32") {
    return [
      "$inputText = [Console]::In.ReadToEnd()",
      `$inputText | & ${command}`,
      "",
    ].join("\n");
  }

  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `exec ${command}`,
    "",
  ].join("\n");
}

function extractConfiguredCommand(script: string): string | undefined {
  const execMatch = /^exec\s+(.+)$/mu.exec(script);
  if (execMatch?.[1]?.includes(TOKENJUICE_CLINE_SUBCOMMAND)) {
    return execMatch[1];
  }
  const powershellMatch = /\|\s*&\s+(.+)$/mu.exec(script);
  if (powershellMatch?.[1]?.includes(TOKENJUICE_CLINE_SUBCOMMAND)) {
    return powershellMatch[1];
  }
  return undefined;
}

async function readConfiguredCommand(hookPath: string): Promise<string | undefined> {
  try {
    return extractConfiguredCommand(await readFile(hookPath, "utf8"));
  } catch {
    return undefined;
  }
}

export async function installClineHook(
  hookPath?: string,
  options: ClineHookCommandOptions = {},
): Promise<InstallClineHookResult> {
  const resolvedHookPath = hookPath ?? getDefaultHookPath(options);
  const command = await buildTokenjuiceHookCommand(TOKENJUICE_CLINE_SUBCOMMAND, "cline", options);
  await mkdir(dirname(resolvedHookPath), { recursive: true });
  await writeFile(resolvedHookPath, buildHookScript(command), "utf8");
  if (process.platform !== "win32") {
    await chmod(resolvedHookPath, 0o755);
  }
  return { hookPath: resolvedHookPath, command };
}

export async function uninstallClineHook(hookPath = getDefaultHookPath()): Promise<UninstallClineHookResult> {
  const exists = await pathExists(hookPath);
  if (exists) {
    await rm(hookPath, { force: true });
  }
  return { hookPath, removed: exists };
}

export async function doctorClineHook(
  hookPath?: string,
  options: ClineHookCommandOptions = {},
): Promise<ClineDoctorReport> {
  const resolvedHookPath = hookPath ?? getDefaultHookPath(options);
  const expectedCommand = await buildTokenjuiceHookCommand(TOKENJUICE_CLINE_SUBCOMMAND, "cline", options);
  const detectedCommand = await readConfiguredCommand(resolvedHookPath);
  if (!detectedCommand) {
    return {
      hookPath: resolvedHookPath,
      status: "disabled",
      issues: ["tokenjuice PostToolUse hook script is not installed for Cline"],
      advisories: ["Cline support is beta; enable the generated PostToolUse hook in Cline's Hooks tab after install."],
      fixCommand: TOKENJUICE_CLINE_FIX_COMMAND,
      expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const missingPaths = await findMissingHookCommandPaths(detectedCommand);
  const issues: string[] = [];
  if (detectedCommand !== expectedCommand) {
    issues.push("configured Cline hook command does not match the current recommended command");
  }
  if (missingPaths.length > 0) {
    issues.push(`configured Cline hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
  }

  return {
    hookPath: resolvedHookPath,
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: ["Cline support is beta and currently injects compacted context without suppressing the original tool result."],
    fixCommand: TOKENJUICE_CLINE_FIX_COMMAND,
    expectedCommand,
    detectedCommand,
    checkedPaths: [],
    missingPaths,
  };
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function readWorkspaceCwd(payload: ClinePostToolUsePayload): string | undefined {
  if (!Array.isArray(payload.workspaceRoots)) {
    return undefined;
  }
  const first = payload.workspaceRoots[0];
  return typeof first === "string" && first.trim() ? first : undefined;
}

function isShellToolName(value: unknown): boolean {
  return value === "execute_command" || value === "executeCommand" || value === "terminal";
}

export async function runClinePostToolUseHook(rawText: string): Promise<number> {
  let payload: ClinePostToolUsePayload;
  try {
    payload = JSON.parse(rawText) as ClinePostToolUsePayload;
  } catch {
    process.stdout.write(JSON.stringify({ cancel: false, contextModification: "", errorMessage: "" }));
    process.stdout.write("\n");
    return 0;
  }

  if (payload.hookName !== "PostToolUse" || !isRecord(payload.postToolUse)) {
    process.stdout.write(JSON.stringify({ cancel: false, contextModification: "", errorMessage: "" }));
    process.stdout.write("\n");
    return 0;
  }

  const tool = payload.postToolUse;
  if (!isShellToolName(tool.toolName) && !isShellToolName(tool.tool)) {
    process.stdout.write(JSON.stringify({ cancel: false, contextModification: "", errorMessage: "" }));
    process.stdout.write("\n");
    return 0;
  }

  const parameters = isRecord(tool.parameters) ? tool.parameters : {};
  const command = readStringField(parameters, ["command", "cmd"]) ?? readStringField(tool, ["command"]);
  const result = readStringField(tool, ["result"]);
  if (!command || !result) {
    process.stdout.write(JSON.stringify({ cancel: false, contextModification: "", errorMessage: "" }));
    process.stdout.write("\n");
    return 0;
  }

  try {
    const cwd = readWorkspaceCwd(payload);
    const outcome = await compactBashResult({
      source: "cline",
      command,
      visibleText: result,
      ...(cwd ? { cwd } : {}),
      inspectionPolicy: "allow-safe-inventory",
      metadata: { source: "cline-post-tool-use" },
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    process.stdout.write(JSON.stringify({
      cancel: false,
      contextModification: outcome.action === "rewrite"
        ? buildCompactedOutputContext(outcome.result.inlineText)
        : "",
      errorMessage: "",
    }));
    process.stdout.write("\n");
    return 0;
  } catch {
    process.stdout.write(JSON.stringify({ cancel: false, contextModification: "", errorMessage: "" }));
    process.stdout.write("\n");
    return 0;
  }
}
