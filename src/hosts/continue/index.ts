import { join } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

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
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When running terminal commands through Continue, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
  }),
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
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Continue rule is not installed"],
        advisory: TOKENJUICE_CONTINUE_ADVISORY,
        fixCommand: TOKENJUICE_CONTINUE_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_CONTINUE_RULE_MARKER,
        missingIssue: "configured Continue rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Continue rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Continue rule file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Continue rule file still suggests the full escape hatch",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_CONTINUE_ADVISORY,
      fixCommand: TOKENJUICE_CONTINUE_FIX_COMMAND,
    }),
  };
}
