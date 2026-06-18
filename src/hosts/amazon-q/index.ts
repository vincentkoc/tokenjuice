import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
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

export type AmazonQDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AMAZON_Q_FIX_COMMAND = "tokenjuice install amazon-q";
const TOKENJUICE_AMAZON_Q_OWNERSHIP_MARKER = "<!-- tokenjuice:amazon-q-rule -->";
const TOKENJUICE_AMAZON_Q_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_AMAZON_Q_RESOURCE_GLOB = "file://.amazonq/rules/**/*.md";
const TOKENJUICE_AMAZON_Q_REINSTALL_BACKUP_SUFFIX = ".tokenjuice.bak";
const TOKENJUICE_AMAZON_Q_ADVISORY =
  "Amazon Q support is beta and rule-based; Amazon Q CLI has been rebranded to Kiro, but Kiro can continue using Amazon Q rules. Include `file://.amazonq/rules/**/*.md` in the active agent resources so the rule is loaded.";

function getExplicitProjectDir(options: AmazonQRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.AMAZON_Q_PROJECT_DIR;
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function findGitRoot(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    if (await hasGitMetadata(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
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

async function writeAmazonQRuleWithoutBackup(rulePath: string): Promise<void> {
  await mkdir(dirname(rulePath), { recursive: true });
  const tempPath = `${rulePath}.tmp`;
  await writeFile(tempPath, TOKENJUICE_AMAZON_Q_RULE, "utf8");
  await rename(tempPath, rulePath);
}

export async function installAmazonQRule(
  rulePath?: string,
  options: AmazonQRuleOptions = {},
): Promise<InstallAmazonQRuleResult> {
  const resolvedRulePath = rulePath ?? await getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && isTokenjuiceAmazonQRuleText(existing.text)) {
    if (existing.text === TOKENJUICE_AMAZON_Q_RULE) {
      return { rulePath: resolvedRulePath };
    }

    const primaryBackupPath = `${resolvedRulePath}.bak`;
    const primaryBackup = await readInstructionFile(primaryBackupPath);
    const backupPath = primaryBackup.exists && !isTokenjuiceAmazonQRuleText(primaryBackup.text)
      ? `${resolvedRulePath}${TOKENJUICE_AMAZON_Q_REINSTALL_BACKUP_SUFFIX}`
      : primaryBackupPath;
    await writeFile(backupPath, existing.text, "utf8");
    await writeAmazonQRuleWithoutBackup(resolvedRulePath);
    return { rulePath: resolvedRulePath, backupPath };
  }

  const result = await writeInstructionFile(resolvedRulePath, TOKENJUICE_AMAZON_Q_RULE);
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

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_AMAZON_Q_OWNERSHIP_MARKER,
        missingIssue: "configured Amazon Q rule file is missing the tokenjuice ownership marker",
      },
      {
        requiredText: TOKENJUICE_AMAZON_Q_RULE_MARKER,
        missingIssue: "configured Amazon Q rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Amazon Q rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Amazon Q rule file is missing the raw escape hatch",
      },
      {
        requiredText: TOKENJUICE_AMAZON_Q_RESOURCE_GLOB,
        missingIssue: "configured Amazon Q rule file is missing resource-loading guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Amazon Q rule file still suggests the full escape hatch",
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
