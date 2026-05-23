import { join } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type WindsurfRuleOptions = {
  projectDir?: string;
};

export type InstallWindsurfRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallWindsurfRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type WindsurfDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_WINDSURF_FIX_COMMAND = "tokenjuice install windsurf";
const TOKENJUICE_WINDSURF_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_WINDSURF_ADVISORY =
  "Windsurf support is beta and rule-based; it guides command usage but does not intercept tool output.";

function getProjectDir(options: WindsurfRuleOptions = {}): string {
  return options.projectDir || process.env.WINDSURF_PROJECT_DIR || process.cwd();
}

function getDefaultRulePath(options: WindsurfRuleOptions = {}): string {
  return join(getProjectDir(options), ".windsurf", "rules", "tokenjuice.md");
}

const TOKENJUICE_WINDSURF_RULE = [
  "---",
  "trigger: always_on",
  "---",
  "",
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When running terminal commands through Windsurf Cascade, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
  }),
  "",
].join("\n");

export async function installWindsurfRule(
  rulePath?: string,
  options: WindsurfRuleOptions = {},
): Promise<InstallWindsurfRuleResult> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const result = await writeInstructionFile(resolvedRulePath, TOKENJUICE_WINDSURF_RULE);
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallWindsurfRule(rulePath = getDefaultRulePath()): Promise<UninstallWindsurfRuleResult> {
  const result = await removeInstructionFile(rulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorWindsurfRule(
  rulePath?: string,
  options: WindsurfRuleOptions = {},
): Promise<WindsurfDoctorReport> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Windsurf rule is not installed"],
        advisory: TOKENJUICE_WINDSURF_ADVISORY,
        fixCommand: TOKENJUICE_WINDSURF_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_WINDSURF_RULE_MARKER,
        missingIssue: "configured Windsurf rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: "trigger: always_on",
        missingIssue: "configured Windsurf rule file is missing always-on activation",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Windsurf rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Windsurf rule file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Windsurf rule file still suggests the full escape hatch",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_WINDSURF_ADVISORY,
      fixCommand: TOKENJUICE_WINDSURF_FIX_COMMAND,
    }),
  };
}
