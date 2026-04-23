/**
 * Helpers shared by PreToolUse "wrap" hosts (cursor, codebuddy).
 *
 * These hosts intercept a host-level Bash/Shell tool call, wrap its command
 * line with `tokenjuice wrap -- <host-shell> -lc '<original>'`, and return a
 * host-shaped response so the agent's tool output flows through tokenjuice's
 * compaction path.
 *
 * The wire-format response (`updated_input` vs. `hookSpecificOutput`) is
 * host-specific and stays in the per-host module. Everything else — resolving
 * the installed tokenjuice launcher, picking a host shell, quoting the
 * wrapped command, detecting already-wrapped commands — is host-agnostic and
 * lives here.
 */

import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";

import { stripLeadingCdPrefix, tokenizeCommand } from "../../core/command.js";

import { isNodeExecutablePath, isTokenjuiceExecutablePath, shellQuote } from "./hook-command.js";

export type WrapLauncherOptions = {
  /** When true, bypass the `PATH` lookup for an installed tokenjuice binary and route through the caller's build. */
  local?: boolean;
  /** Override the binary/entrypoint path. Defaults to `process.argv[1]`. */
  binaryPath?: string;
  /** Override the node executable used when dispatching a `.js` entrypoint. Defaults to `process.execPath`. */
  nodePath?: string;
};

export type BuildWrapLauncherHookCommandOptions = WrapLauncherOptions & {
  /** Host-specific CLI subcommand name, e.g. `"cursor-pre-tool-use"` or `"codebuddy-pre-tool-use"`. */
  subcommand: string;
  /** Error context used when `binaryPath` cannot be resolved. */
  hostName: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function isExecutableFile(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk `PATH` and return the first executable `tokenjuice` (or Windows
 * variant) found. Empty segments and missing entries are skipped.
 */
export async function resolveInstalledTokenjuicePath(): Promise<string | undefined> {
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

/**
 * Resolve a single shell candidate string to an executable path. Accepts
 * either an absolute path (checked directly) or a bare name (walked against
 * `PATH`). Returns `undefined` when the candidate is unusable.
 */
export async function resolveShellPath(shell: string): Promise<string | undefined> {
  const trimmed = shell.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return await isExecutableFile(trimmed) ? trimmed : undefined;
  }

  const pathValue = process.env.PATH;
  if (!pathValue) {
    return undefined;
  }
  for (const segment of pathValue.split(delimiter)) {
    if (!segment) {
      continue;
    }
    const candidatePath = join(segment, trimmed);
    if (await isExecutableFile(candidatePath)) {
      return candidatePath;
    }
  }
  return undefined;
}

/**
 * Try each candidate in order and return the first one that resolves. Callers
 * pass the host-specific ordering (e.g. for codebuddy:
 * `[tool_input.shell, TOKENJUICE_CODEBUDDY_SHELL, SHELL, "bash", "sh"]`).
 *
 * `undefined` / empty / whitespace-only candidates are skipped silently so
 * callers can pass the raw env-var values without filtering first.
 */
export async function resolveHostShell(candidates: (string | undefined)[]): Promise<string | undefined> {
  const usable = candidates.filter(
    (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
  );
  for (const candidate of usable) {
    const resolved = await resolveShellPath(candidate);
    if (resolved) {
      return resolved;
    }
  }
  return undefined;
}

/**
 * Build the command stored in a PreToolUse hook entry, shaped like:
 *
 *     <launcher-command> <subcommand> --wrap-launcher <launcher>
 *
 * Where `<launcher-command>` is either the launcher executable itself or
 * `<node-path> <launcher-js-path>` when the launcher points at a `.js`
 * entrypoint (so cursor/codebuddy can invoke a repo-local build without
 * chmod'ing the script).
 */
export async function buildWrapLauncherHookCommand(
  options: BuildWrapLauncherHookCommandOptions,
): Promise<string> {
  const rawBinaryPath = options.binaryPath ?? process.argv[1];
  const binaryPath = rawBinaryPath && !isAbsolute(rawBinaryPath) ? resolve(rawBinaryPath) : rawBinaryPath;
  const nodePath = options.nodePath ?? process.execPath;
  if (!binaryPath) {
    throw new Error(`unable to resolve tokenjuice binary path for ${options.hostName} install`);
  }

  let launcher = binaryPath;
  if (!options.local) {
    const installedBinaryPath = await resolveInstalledTokenjuicePath();
    launcher = installedBinaryPath ?? binaryPath;
  }
  const launcherCommand = launcher.endsWith(".js")
    ? `${shellQuote(nodePath)} ${shellQuote(launcher)}`
    : shellQuote(launcher);

  return `${launcherCommand} ${options.subcommand} --wrap-launcher ${shellQuote(launcher)}`;
}

/**
 * Build the command the host should ask the agent to run — the original
 * command routed through `tokenjuice wrap` and the selected host shell:
 *
 *     <launcher-command> wrap -- <shell-path> -lc '<original>'
 *
 * `wrapLauncher` comes from the PreToolUse hook's `--wrap-launcher` argv so
 * the dispatched binary matches the one the host installed.
 */
export function buildWrappedCommand(params: {
  wrapLauncher: string;
  shellPath: string;
  command: string;
  nodePath?: string;
}): string {
  const nodePath = params.nodePath ?? process.execPath;
  const launcherCommand = params.wrapLauncher.endsWith(".js")
    ? `${shellQuote(nodePath)} ${shellQuote(params.wrapLauncher)}`
    : shellQuote(params.wrapLauncher);
  return `${launcherCommand} wrap -- ${shellQuote(params.shellPath)} -lc ${shellQuote(params.command)}`;
}

/**
 * Detect whether a command has already been wrapped by tokenjuice. Matches
 * three shapes:
 *
 *   `tokenjuice wrap ...`                     — bare executable on PATH
 *   `/abs/path/to/tokenjuice wrap ...`        — absolute launcher (pnpm link,
 *                                               homebrew, etc.)
 *   `node /some/dist/cli/main.js ... wrap`    — node-dispatched local build
 *
 * Avoids double-wrapping when a tool call is already routed through tokenjuice
 * (e.g. the user invoked `tokenjuice wrap --raw -- <cmd>` explicitly).
 */
export function commandAlreadyWrapped(command: string): boolean {
  const argv = tokenizeCommand(stripLeadingCdPrefix(command));
  if (argv.length < 2) {
    return false;
  }

  const first = argv[0];
  const second = argv[1];

  if (typeof first === "string" && isTokenjuiceExecutablePath(first) && second === "wrap") {
    return true;
  }

  if (
    typeof first === "string"
    && isNodeExecutablePath(first)
    && typeof second === "string"
    && second.endsWith(".js")
    && argv.slice(2).includes("wrap")
  ) {
    return true;
  }
  return false;
}
