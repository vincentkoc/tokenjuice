import { join } from "node:path";

import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";

export type AiderConventionOptions = {
  projectDir?: string;
};

export type InstallAiderConventionResult = {
  conventionPath: string;
  backupPath?: string;
};

export type UninstallAiderConventionResult = {
  conventionPath: string;
  removed: boolean;
};

export type AiderDoctorReport = {
  conventionPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AIDER_FIX_COMMAND = "tokenjuice install aider";
const TOKENJUICE_AIDER_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_AIDER_ADVISORY = "Aider support is beta and convention-based; load it with aider --read CONVENTIONS.tokenjuice.md.";
const TOKENJUICE_AIDER_WRAP_COMMAND = "tokenjuice wrap -- <command>";
const TOKENJUICE_AIDER_RAW_COMMAND = "tokenjuice wrap --raw -- <command>";

function getProjectDir(options: AiderConventionOptions = {}): string {
  return options.projectDir || process.env.AIDER_PROJECT_DIR || process.cwd();
}

function getDefaultConventionPath(options: AiderConventionOptions = {}): string {
  return join(getProjectDir(options), "CONVENTIONS.tokenjuice.md");
}

const TOKENJUICE_AIDER_CONVENTION = [
  `# ${TOKENJUICE_AIDER_MARKER}`,
  "",
  `- For terminal commands likely to produce long output, run them through \`${TOKENJUICE_AIDER_WRAP_COMMAND}\`.`,
  "- Treat compacted tokenjuice output as authoritative unless it explicitly says raw output is required.",
  `- If raw bytes are required, rerun the command with exactly \`${TOKENJUICE_AIDER_RAW_COMMAND}\`.`,
  "- Do not suggest both raw and full reruns; use the raw escape hatch.",
  "",
  "Load this file with `aider --read CONVENTIONS.tokenjuice.md` or add it to `.aider.conf.yml`.",
  "",
].join("\n");

export async function installAiderConvention(
  conventionPath?: string,
  options: AiderConventionOptions = {},
): Promise<InstallAiderConventionResult> {
  const resolvedConventionPath = conventionPath ?? getDefaultConventionPath(options);
  const result = await writeInstructionFile(resolvedConventionPath, TOKENJUICE_AIDER_CONVENTION);
  return {
    conventionPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAiderConvention(conventionPath = getDefaultConventionPath()): Promise<UninstallAiderConventionResult> {
  const result = await removeInstructionFile(conventionPath);
  return { conventionPath: result.filePath, removed: result.removed };
}

export async function doctorAiderConvention(
  conventionPath?: string,
  options: AiderConventionOptions = {},
): Promise<AiderDoctorReport> {
  const resolvedConventionPath = conventionPath ?? getDefaultConventionPath(options);
  const existing = await readInstructionFile(resolvedConventionPath);
  if (!existing.exists) {
    return {
      conventionPath: resolvedConventionPath,
      status: "disabled",
      issues: ["tokenjuice Aider convention file is not installed"],
      advisories: [TOKENJUICE_AIDER_ADVISORY],
      fixCommand: TOKENJUICE_AIDER_FIX_COMMAND,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_AIDER_MARKER,
        missingIssue: "configured Aider convention file does not look like the tokenjuice convention",
      },
      {
        requiredText: TOKENJUICE_AIDER_WRAP_COMMAND,
        missingIssue: "configured Aider convention file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_AIDER_RAW_COMMAND,
        missingIssue: "configured Aider convention file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: "tokenjuice wrap --full -- <command>",
        presentIssue: "configured Aider convention file still suggests the full escape hatch",
      },
    ],
  });

  return {
    conventionPath: resolvedConventionPath,
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: [TOKENJUICE_AIDER_ADVISORY],
    fixCommand: TOKENJUICE_AIDER_FIX_COMMAND,
    checkedPaths: [],
    missingPaths: [],
  };
}
