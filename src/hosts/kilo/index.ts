import { join } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type KiloRuleOptions = {
  projectDir?: string;
};

export type InstallKiloRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallKiloRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type KiloDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_KILO_FIX_COMMAND = "tokenjuice install kilo";
const TOKENJUICE_KILO_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_KILO_ADVISORY = "Kilo Code support is beta and rule-based; it guides command usage but does not intercept tool output.";

function getProjectDir(options: KiloRuleOptions = {}): string {
  return options.projectDir || process.env.KILO_PROJECT_DIR || process.cwd();
}

function getDefaultRulePath(options: KiloRuleOptions = {}): string {
  return join(getProjectDir(options), ".kilo", "rules", "tokenjuice.md");
}

const TOKENJUICE_KILO_RULE = [
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When running terminal commands through Kilo Code, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
  }),
  "",
].join("\n");

export async function installKiloRule(
  rulePath?: string,
  options: KiloRuleOptions = {},
): Promise<InstallKiloRuleResult> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const result = await writeInstructionFile(resolvedRulePath, TOKENJUICE_KILO_RULE);
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallKiloRule(rulePath = getDefaultRulePath()): Promise<UninstallKiloRuleResult> {
  const result = await removeInstructionFile(rulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorKiloRule(
  rulePath?: string,
  options: KiloRuleOptions = {},
): Promise<KiloDoctorReport> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Kilo Code rule is not installed"],
        advisory: TOKENJUICE_KILO_ADVISORY,
        fixCommand: TOKENJUICE_KILO_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_KILO_RULE_MARKER,
        missingIssue: "configured Kilo Code rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Kilo Code rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Kilo Code rule file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Kilo Code rule file still suggests the full escape hatch",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_KILO_ADVISORY,
      fixCommand: TOKENJUICE_KILO_FIX_COMMAND,
    }),
  };
}
