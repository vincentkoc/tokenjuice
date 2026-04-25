import { findMissingHookCommandPaths } from "./host-command.js";

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
