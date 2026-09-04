import { constants as fsConstants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";

import {
  extractHookCommandPaths,
  isNodeExecutablePath,
  isTokenjuiceExecutablePath,
  parseShellWords,
  shellQuote,
} from "./hook-command.js";

export type TokenjuiceHookCommandOptions = {
  local?: boolean;
  binaryPath?: string;
  nodePath?: string;
  pinNodeForJavaScriptLauncher?: boolean;
};

export type ParsedTokenjuiceHookCommand = {
  argv: string[];
  checkedPaths: string[];
  runtimePath?: string;
  launcherPath?: string;
  subcommand?: string;
};

export async function isExecutableFile(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) {
      return false;
    }
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

export async function buildTokenjuiceHookCommand(
  subcommand: string,
  hostLabel: string,
  options: TokenjuiceHookCommandOptions = {},
): Promise<string> {
  const rawBinaryPath = options.binaryPath ?? process.argv[1];
  const binaryPath = rawBinaryPath && !isAbsolute(rawBinaryPath) ? resolve(rawBinaryPath) : rawBinaryPath;
  const nodePath = options.nodePath ?? process.execPath;
  if (!binaryPath) {
    throw new Error(`unable to resolve tokenjuice binary path for ${hostLabel} install`);
  }

  let launcher = binaryPath;
  if (!options.local) {
    const installedBinaryPath = await resolveInstalledTokenjuicePath();
    launcher = installedBinaryPath ?? binaryPath;
  }

  if (!options.local && options.pinNodeForJavaScriptLauncher) {
    try {
      if ((await realpath(launcher)).endsWith(".js")) {
        return `${shellQuote(nodePath)} ${shellQuote(launcher)} ${subcommand}`;
      }
    } catch {
      // Preserve package-manager launchers when their final target cannot be inspected.
    }
  }

  if (launcher.endsWith(".js")) {
    return `${shellQuote(nodePath)} ${shellQuote(launcher)} ${subcommand}`;
  }
  return `${shellQuote(launcher)} ${subcommand}`;
}

export function parseTokenjuiceHookCommand(
  command: string,
  platform = process.platform,
): ParsedTokenjuiceHookCommand {
  const argv = parseShellWords(command, platform);
  const first = argv[0];
  const second = argv[1];

  if (first && isNodeExecutablePath(first) && second) {
    return {
      argv,
      checkedPaths: extractHookCommandPaths(command, platform),
      runtimePath: first,
      launcherPath: second,
      ...(argv[2] ? { subcommand: argv[2] } : {}),
    };
  }

  if (first && isTokenjuiceExecutablePath(first)) {
    return {
      argv,
      checkedPaths: extractHookCommandPaths(command, platform),
      launcherPath: first,
      ...(second ? { subcommand: second } : {}),
    };
  }

  return {
    argv,
    checkedPaths: extractHookCommandPaths(command, platform),
  };
}

export async function findMissingHookCommandPaths(
  command: string,
  platform = process.platform,
): Promise<string[]> {
  const paths = extractHookCommandPaths(command, platform);
  const missing: string[] = [];
  for (const path of paths) {
    if (!(await pathExists(path))) {
      missing.push(path);
    }
  }
  return missing;
}
