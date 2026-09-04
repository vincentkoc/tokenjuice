import { realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";

import {
  findMissingHookCommandPaths,
  isExecutableFile,
  parseTokenjuiceHookCommand,
  pathExists,
} from "./host-command.js";

export type HookCommandRuntimeMismatch = {
  configuredPath: string;
  expectedPath: string;
};

export type HookCommandPackageVersionMismatch = {
  launcherPath: string;
  resolvedPath: string;
  resolvedVersion: string;
  expectedVersion: string;
};

export type HookCommandInspection = {
  checkedPaths: string[];
  missingPaths: string[];
  nonExecutablePaths: string[];
  runtimePath?: string;
  runtimeMismatch?: HookCommandRuntimeMismatch;
  packageVersionMismatch?: HookCommandPackageVersionMismatch;
};

export type HookCommandDoctorStatus = "ok" | "broken" | "disabled";

export type HookCommandDoctorFields = {
  status: HookCommandDoctorStatus;
  issues: string[];
  advisories: string[];
  fixCommand: string;
  expectedCommand: string;
  detectedCommand?: string;
  checkedPaths: string[];
  missingPaths: string[];
};

function extractHomebrewCellarVersion(path: string): string | undefined {
  const normalized = path.replace(/\\/gu, "/");
  return normalized.match(/\/Cellar\/tokenjuice\/([^/]+)\//u)?.[1];
}

async function pathsResolveToSameFile(left: string, right: string): Promise<boolean> {
  if (left === right) {
    return true;
  }
  try {
    return await realpath(left) === await realpath(right);
  } catch {
    return false;
  }
}

async function isNodeInvokedJavaScriptLauncher(
  path: string,
  runtimePath: string | undefined,
  launcherPath: string | undefined,
): Promise<boolean> {
  if (!runtimePath || path !== launcherPath) {
    return false;
  }
  try {
    return (await realpath(path)).endsWith(".js");
  } catch {
    return false;
  }
}

export async function inspectTokenjuiceHookCommand(options: {
  command: string;
  expectedNodePath?: string;
  expectedPackageVersion?: string;
  platform?: NodeJS.Platform;
}): Promise<HookCommandInspection> {
  const parsed = parseTokenjuiceHookCommand(options.command, options.platform);
  const missingPaths = await findMissingHookCommandPaths(options.command, options.platform);
  const nonExecutablePaths: string[] = [];

  for (const path of parsed.checkedPaths) {
    if (
      missingPaths.includes(path)
      || path.endsWith(".js")
      || await isNodeInvokedJavaScriptLauncher(path, parsed.runtimePath, parsed.launcherPath)
    ) {
      continue;
    }
    if (!(await isExecutableFile(path))) {
      nonExecutablePaths.push(path);
    }
  }

  let runtimeMismatch: HookCommandRuntimeMismatch | undefined;
  if (
    parsed.runtimePath
    && options.expectedNodePath
    && isAbsolute(parsed.runtimePath)
    && !(await pathsResolveToSameFile(parsed.runtimePath, options.expectedNodePath))
  ) {
    runtimeMismatch = {
      configuredPath: parsed.runtimePath,
      expectedPath: options.expectedNodePath,
    };
  }

  let packageVersionMismatch: HookCommandPackageVersionMismatch | undefined;
  if (parsed.launcherPath && options.expectedPackageVersion && await pathExists(parsed.launcherPath)) {
    try {
      const resolvedPath = await realpath(parsed.launcherPath);
      const resolvedVersion = extractHomebrewCellarVersion(resolvedPath);
      if (resolvedVersion && resolvedVersion !== options.expectedPackageVersion) {
        packageVersionMismatch = {
          launcherPath: parsed.launcherPath,
          resolvedPath,
          resolvedVersion,
          expectedVersion: options.expectedPackageVersion,
        };
      }
    } catch {
      // Missing and unreadable paths are reported separately.
    }
  }

  return {
    checkedPaths: parsed.checkedPaths,
    missingPaths,
    nonExecutablePaths,
    ...(parsed.runtimePath ? { runtimePath: parsed.runtimePath } : {}),
    ...(runtimeMismatch ? { runtimeMismatch } : {}),
    ...(packageVersionMismatch ? { packageVersionMismatch } : {}),
  };
}

export async function buildHookCommandDoctorFields(options: {
  expectedCommand: string;
  detectedCommand: string | undefined;
  disabledIssue: string;
  hostLabel: string;
  advisory: string;
  fixCommand: string;
}): Promise<HookCommandDoctorFields> {
  if (!options.detectedCommand) {
    return {
      status: "disabled",
      issues: [options.disabledIssue],
      advisories: [options.advisory],
      fixCommand: options.fixCommand,
      expectedCommand: options.expectedCommand,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const missingPaths = await findMissingHookCommandPaths(options.detectedCommand);
  const issues: string[] = [];
  if (options.detectedCommand !== options.expectedCommand) {
    issues.push(`configured ${options.hostLabel} hook command does not match the current recommended command`);
  }
  if (missingPaths.length > 0) {
    issues.push(`configured ${options.hostLabel} hook points at missing path${missingPaths.length === 1 ? "" : "s"}`);
  }

  return {
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: [options.advisory],
    fixCommand: options.fixCommand,
    expectedCommand: options.expectedCommand,
    detectedCommand: options.detectedCommand,
    checkedPaths: [],
    missingPaths,
  };
}
