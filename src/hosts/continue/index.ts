import { join } from "node:path";

import {
  collectTokenjuiceGuidanceIssues,
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import { readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  type PathDoctorReport,
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

export type ContinueDoctorReport = PathDoctorReport<"rulePath">;

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

  const issues = collectTokenjuiceGuidanceIssues(existing.text, {
    configuredLabel: "Continue rule file",
    singular: true,
    additionalRequired: [
      {
        requiredText: TOKENJUICE_CONTINUE_RULE_MARKER,
        missingIssue: "configured Continue rule file does not look like the tokenjuice rule",
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
