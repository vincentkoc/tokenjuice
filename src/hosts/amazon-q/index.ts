import { rename } from "node:fs/promises";
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

export type AmazonQRuleOptions = {
  projectDir?: string;
};

export type InstallAmazonQRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallAmazonQRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type AmazonQDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_AMAZON_Q_FIX_COMMAND = "tokenjuice install amazon-q";
const TOKENJUICE_AMAZON_Q_OWNERSHIP_MARKER = "<!-- tokenjuice:amazon-q-rule -->";
const TOKENJUICE_AMAZON_Q_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_AMAZON_Q_RESOURCE_GLOB = "file://.amazonq/rules/**/*.md";
const TOKENJUICE_AMAZON_Q_ADVISORY =
  "Amazon Q support is beta and rule-based; Amazon Q CLI has been rebranded to Kiro, but Kiro can continue using Amazon Q rules. Include `file://.amazonq/rules/**/*.md` in the active agent resources so the rule is loaded.";

function getExplicitProjectDir(options: AmazonQRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.AMAZON_Q_PROJECT_DIR;
}

async function resolveProjectDir(options: AmazonQRuleOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? resolve(process.cwd());
}

async function getDefaultRulePath(options: AmazonQRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".amazonq", "rules", "tokenjuice.md");
}

const TOKENJUICE_AMAZON_Q_RULE = [
  "# tokenjuice terminal output compaction",
  "",
  TOKENJUICE_AMAZON_Q_OWNERSHIP_MARKER,
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When running terminal commands through Amazon Q Developer CLI, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
  }),
  `- Load this rule from an Amazon Q CLI agent with a resources entry such as \`${TOKENJUICE_AMAZON_Q_RESOURCE_GLOB}\`.`,
  "",
].join("\n");

function isTokenjuiceAmazonQRuleText(text: string): boolean {
  return text.includes(TOKENJUICE_AMAZON_Q_OWNERSHIP_MARKER);
}

export async function installAmazonQRule(
  rulePath?: string,
  options: AmazonQRuleOptions = {},
): Promise<InstallAmazonQRuleResult> {
  const resolvedRulePath = rulePath ?? await getDefaultRulePath(options);
  const result = await installManagedInstructionFile(
    resolvedRulePath,
    TOKENJUICE_AMAZON_Q_RULE,
    isTokenjuiceAmazonQRuleText,
  );
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAmazonQRule(
  rulePath?: string,
  options: AmazonQRuleOptions = {},
): Promise<UninstallAmazonQRuleResult> {
  const resolvedRulePath = rulePath ?? await getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && !isTokenjuiceAmazonQRuleText(existing.text)) {
    throw new Error(
      `refusing to remove ${resolvedRulePath}; it does not look like the tokenjuice Amazon Q rule. Review and remove it manually, or reinstall tokenjuice amazon-q first.`,
    );
  }

  const backupPath = `${resolvedRulePath}.bak`;
  const backup = await readInstructionFile(backupPath);
  if (existing.exists && backup.exists && !isTokenjuiceAmazonQRuleText(backup.text)) {
    await rename(backupPath, resolvedRulePath);
    return { rulePath: resolvedRulePath, removed: true };
  }

  const result = await removeInstructionFile(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorAmazonQRule(
  rulePath?: string,
  options: AmazonQRuleOptions = {},
): Promise<AmazonQDoctorReport> {
  const resolvedRulePath = rulePath ?? await getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Amazon Q rule is not installed"],
        advisory: TOKENJUICE_AMAZON_Q_ADVISORY,
        fixCommand: TOKENJUICE_AMAZON_Q_FIX_COMMAND,
      }),
    };
  }
  if (!isTokenjuiceAmazonQRuleText(existing.text)) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Amazon Q rule is not installed; existing rule file is not tokenjuice-managed"],
        advisory: TOKENJUICE_AMAZON_Q_ADVISORY,
        fixCommand: TOKENJUICE_AMAZON_Q_FIX_COMMAND,
      }),
    };
  }

  const issues = collectTokenjuiceGuidanceIssues(existing.text, {
    configuredLabel: "Amazon Q rule file",
    singular: true,
    additionalRequired: [
      {
        requiredText: TOKENJUICE_AMAZON_Q_OWNERSHIP_MARKER,
        missingIssue: "configured Amazon Q rule file is missing the tokenjuice ownership marker",
      },
      {
        requiredText: TOKENJUICE_AMAZON_Q_RULE_MARKER,
        missingIssue: "configured Amazon Q rule file does not look like the tokenjuice rule",
      },
    ],
    additionalRequiredAfter: [
      {
        requiredText: TOKENJUICE_AMAZON_Q_RESOURCE_GLOB,
        missingIssue: "configured Amazon Q rule file is missing resource-loading guidance",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_AMAZON_Q_ADVISORY,
      fixCommand: TOKENJUICE_AMAZON_Q_FIX_COMMAND,
    }),
  };
}
