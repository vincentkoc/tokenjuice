import { rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { createProjectDirResolver } from "../shared/project-root.js";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, installManagedInstructionFile } from "../shared/instruction-file.js";
import {
  type PathDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type BuilderRuleOptions = {
  projectDir?: string;
};

export type InstallBuilderRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallBuilderRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type BuilderDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_BUILDER_FIX_COMMAND = "tokenjuice install builder";
const TOKENJUICE_BUILDER_OWNERSHIP_MARKER = "<!-- tokenjuice:builder-rule -->";
const TOKENJUICE_BUILDER_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_BUILDER_ADVISORY = "Builder support is beta and rule-based; it guides command usage but does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("BUILDER_PROJECT_DIR");

async function getDefaultRulePath(options: BuilderRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".builder", "rules", "tokenjuice.mdc");
}

const TOKENJUICE_BUILDER_RULE = [
  "---",
  `description: ${TOKENJUICE_BUILDER_RULE_MARKER}`,
  "globs:",
  "alwaysApply: true",
  "---",
  "",
  TOKENJUICE_BUILDER_OWNERSHIP_MARKER,
  "",
  `# ${TOKENJUICE_BUILDER_RULE_MARKER}`,
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When running terminal commands through Builder Projects or Fusion, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
  }),
  "",
].join("\n");

function isTokenjuiceBuilderRuleText(text: string): boolean {
  return text.includes(TOKENJUICE_BUILDER_OWNERSHIP_MARKER);
}

export async function installBuilderRule(
  rulePath?: string,
  options: BuilderRuleOptions = {},
): Promise<InstallBuilderRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const result = await installManagedInstructionFile(
    resolvedRulePath,
    TOKENJUICE_BUILDER_RULE,
    isTokenjuiceBuilderRuleText,
  );
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallBuilderRule(
  rulePath?: string,
  options: BuilderRuleOptions = {},
): Promise<UninstallBuilderRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && !isTokenjuiceBuilderRuleText(existing.text)) {
    throw new Error(
      `refusing to remove ${resolvedRulePath}; it does not look like the tokenjuice Builder rule. Review and remove it manually, or reinstall tokenjuice builder first.`,
    );
  }

  const backupPath = `${resolvedRulePath}.bak`;
  const backup = await readInstructionFile(backupPath);
  if (existing.exists && backup.exists && !isTokenjuiceBuilderRuleText(backup.text)) {
    await rm(resolvedRulePath, { force: true });
    await rename(backupPath, resolvedRulePath);
    return { rulePath: resolvedRulePath, removed: true };
  }

  const result = await removeInstructionFile(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorBuilderRule(
  rulePath?: string,
  options: BuilderRuleOptions = {},
): Promise<BuilderDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Builder rule is not installed"],
        advisory: TOKENJUICE_BUILDER_ADVISORY,
        fixCommand: TOKENJUICE_BUILDER_FIX_COMMAND,
      }),
    };
  }
  if (!isTokenjuiceBuilderRuleText(existing.text)) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Builder rule is not installed; existing rule file is not tokenjuice-managed"],
        advisory: TOKENJUICE_BUILDER_ADVISORY,
        fixCommand: TOKENJUICE_BUILDER_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: "description: tokenjuice terminal output compaction",
        missingIssue: "configured Builder rule file is missing description metadata",
      },
      {
        requiredText: "alwaysApply: true",
        missingIssue: "configured Builder rule file is missing alwaysApply metadata",
      },
      {
        requiredText: TOKENJUICE_BUILDER_OWNERSHIP_MARKER,
        missingIssue: "configured Builder rule file is missing the tokenjuice ownership marker",
      },
      {
        requiredText: TOKENJUICE_BUILDER_RULE_MARKER,
        missingIssue: "configured Builder rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Builder rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Builder rule file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Builder rule file still suggests the full escape hatch",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_BUILDER_ADVISORY,
      fixCommand: TOKENJUICE_BUILDER_FIX_COMMAND,
    }),
  };
}
