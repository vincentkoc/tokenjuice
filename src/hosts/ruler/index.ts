import { rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { findGitRoot } from "../shared/project-root.js";

import {
  collectTokenjuiceGuidanceIssues,
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import {
  readInstructionFile,
  removeInstructionFile,
  installManagedInstructionFile,
} from "../shared/instruction-file.js";
import {
  type PathDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type RulerRuleOptions = {
  projectDir?: string;
};

export type InstallRulerRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallRulerRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type RulerDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_RULER_FIX_COMMAND = "tokenjuice install ruler";
const TOKENJUICE_RULER_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_RULER_ADVISORY = "Ruler support is beta and rule-based; run `ruler apply` after install so Ruler propagates the rule to configured agents.";

function getExplicitProjectDir(options: RulerRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.RULER_PROJECT_DIR;
}

async function resolveProjectDir(options: RulerRuleOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? resolve(process.cwd());
}

async function getDefaultRulePath(options: RulerRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".ruler", "tokenjuice.md");
}

const TOKENJUICE_RULER_RULE = [
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When Ruler propagates this rule to coding agents, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for terminal commands likely to produce long output.`,
  }),
  "- After editing this source rule, run `ruler apply` so configured agents receive the updated guidance.",
  "",
].join("\n");

function isTokenjuiceRulerRuleText(text: string): boolean {
  return text.includes(TOKENJUICE_RULER_RULE_MARKER);
}

export async function installRulerRule(
  rulePath?: string,
  options: RulerRuleOptions = {},
): Promise<InstallRulerRuleResult> {
  const resolvedRulePath = rulePath ?? await getDefaultRulePath(options);
  const result = await installManagedInstructionFile(
    resolvedRulePath,
    TOKENJUICE_RULER_RULE,
    isTokenjuiceRulerRuleText,
  );
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallRulerRule(
  rulePath?: string,
  options: RulerRuleOptions = {},
): Promise<UninstallRulerRuleResult> {
  const resolvedRulePath = rulePath ?? await getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists || !isTokenjuiceRulerRuleText(existing.text)) {
    return { rulePath: resolvedRulePath, removed: false };
  }

  const backupPath = `${resolvedRulePath}.bak`;
  const backup = await readInstructionFile(backupPath);
  if (backup.exists && !isTokenjuiceRulerRuleText(backup.text)) {
    await rm(resolvedRulePath, { force: true });
    await rename(backupPath, resolvedRulePath);
    return { rulePath: resolvedRulePath, removed: true };
  }

  const result = await removeInstructionFile(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorRulerRule(
  rulePath?: string,
  options: RulerRuleOptions = {},
): Promise<RulerDoctorReport> {
  const resolvedRulePath = rulePath ?? await getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Ruler rule is not installed"],
        advisory: TOKENJUICE_RULER_ADVISORY,
        fixCommand: TOKENJUICE_RULER_FIX_COMMAND,
      }),
    };
  }
  if (!isTokenjuiceRulerRuleText(existing.text)) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Ruler rule is not installed"],
        advisory: TOKENJUICE_RULER_ADVISORY,
        fixCommand: TOKENJUICE_RULER_FIX_COMMAND,
      }),
    };
  }

  const issues = collectTokenjuiceGuidanceIssues(existing.text, {
    configuredLabel: "Ruler rule file",
    singular: true,
    additionalRequired: [
      {
        requiredText: TOKENJUICE_RULER_RULE_MARKER,
        missingIssue: "configured Ruler rule file does not look like the tokenjuice rule",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_RULER_ADVISORY,
      fixCommand: TOKENJUICE_RULER_FIX_COMMAND,
    }),
  };
}
