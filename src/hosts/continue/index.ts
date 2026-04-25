import { join } from "node:path";

import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";

export type ContinueRuleOptions = {
  projectDir?: string;
};

export type InstallContinueRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallContinueRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type ContinueDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_CONTINUE_FIX_COMMAND = "tokenjuice install continue";
const TOKENJUICE_CONTINUE_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_CONTINUE_ADVISORY = "Continue support is beta and rule-based; it guides command usage but does not intercept tool output.";
const TOKENJUICE_CONTINUE_WRAP_COMMAND = "tokenjuice wrap -- <command>";
const TOKENJUICE_CONTINUE_RAW_COMMAND = "tokenjuice wrap --raw -- <command>";

function getProjectDir(options: ContinueRuleOptions = {}): string {
  return options.projectDir || process.env.CONTINUE_PROJECT_DIR || process.cwd();
}

function getDefaultRulePath(options: ContinueRuleOptions = {}): string {
  return join(getProjectDir(options), ".continue", "rules", "tokenjuice.md");
}

const TOKENJUICE_CONTINUE_RULE = [
  "---",
  `name: ${TOKENJUICE_CONTINUE_RULE_MARKER}`,
  "---",
  "",
  `- When running terminal commands through Continue, prefer \`${TOKENJUICE_CONTINUE_WRAP_COMMAND}\` for commands likely to produce long output.`,
  "- Treat compacted tokenjuice output as authoritative unless it explicitly says raw output is required.",
  `- If raw bytes are required, rerun the command with exactly \`${TOKENJUICE_CONTINUE_RAW_COMMAND}\`.`,
  "- Do not suggest both raw and full reruns; use the raw escape hatch.",
  "",
].join("\n");

export async function installContinueRule(
  rulePath?: string,
  options: ContinueRuleOptions = {},
): Promise<InstallContinueRuleResult> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const result = await writeInstructionFile(resolvedRulePath, TOKENJUICE_CONTINUE_RULE);
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallContinueRule(rulePath = getDefaultRulePath()): Promise<UninstallContinueRuleResult> {
  const result = await removeInstructionFile(rulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorContinueRule(
  rulePath?: string,
  options: ContinueRuleOptions = {},
): Promise<ContinueDoctorReport> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      status: "disabled",
      issues: ["tokenjuice Continue rule is not installed"],
      advisories: [TOKENJUICE_CONTINUE_ADVISORY],
      fixCommand: TOKENJUICE_CONTINUE_FIX_COMMAND,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_CONTINUE_RULE_MARKER,
        missingIssue: "configured Continue rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_CONTINUE_WRAP_COMMAND,
        missingIssue: "configured Continue rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_CONTINUE_RAW_COMMAND,
        missingIssue: "configured Continue rule file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: "tokenjuice wrap --full -- <command>",
        presentIssue: "configured Continue rule file still suggests the full escape hatch",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: [TOKENJUICE_CONTINUE_ADVISORY],
    fixCommand: TOKENJUICE_CONTINUE_FIX_COMMAND,
    checkedPaths: [],
    missingPaths: [],
  };
}
