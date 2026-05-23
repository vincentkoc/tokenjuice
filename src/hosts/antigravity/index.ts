import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type AntigravityRuleOptions = {
  projectDir?: string;
};

export type InstallAntigravityRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallAntigravityRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type AntigravityDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_ANTIGRAVITY_FIX_COMMAND = "tokenjuice install antigravity";
const TOKENJUICE_ANTIGRAVITY_OWNERSHIP_MARKER = "<!-- tokenjuice:antigravity-rule -->";
const TOKENJUICE_ANTIGRAVITY_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_ANTIGRAVITY_ADVISORY = "Antigravity support is beta and rule-based; it guides command usage but does not intercept tool output.";
const TOKENJUICE_ANTIGRAVITY_REINSTALL_BACKUP_SUFFIX = ".tokenjuice.bak";

function getExplicitProjectDir(options: AntigravityRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.ANTIGRAVITY_PROJECT_DIR;
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

async function resolveProjectDir(options: AntigravityRuleOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? resolve(process.cwd());
}

async function getDefaultRulePath(options: AntigravityRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".agents", "rules", "tokenjuice.md");
}

const TOKENJUICE_ANTIGRAVITY_RULE = [
  "---",
  "activation: always_on",
  `description: ${TOKENJUICE_ANTIGRAVITY_RULE_MARKER}`,
  "---",
  "",
  TOKENJUICE_ANTIGRAVITY_OWNERSHIP_MARKER,
  "",
  `# ${TOKENJUICE_ANTIGRAVITY_RULE_MARKER}`,
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When running terminal commands through Google Antigravity IDE or CLI (\`agy\`), prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
  }),
  "",
].join("\n");

function isTokenjuiceAntigravityRuleText(text: string): boolean {
  return text.includes(TOKENJUICE_ANTIGRAVITY_OWNERSHIP_MARKER);
}

async function writeAntigravityRuleWithoutBackup(rulePath: string): Promise<void> {
  await mkdir(dirname(rulePath), { recursive: true });
  const tempPath = `${rulePath}.tmp`;
  await writeFile(tempPath, TOKENJUICE_ANTIGRAVITY_RULE, "utf8");
  await rename(tempPath, rulePath);
}

export async function installAntigravityRule(
  rulePath?: string,
  options: AntigravityRuleOptions = {},
): Promise<InstallAntigravityRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && isTokenjuiceAntigravityRuleText(existing.text)) {
    if (existing.text === TOKENJUICE_ANTIGRAVITY_RULE) {
      return { rulePath: resolvedRulePath };
    }

    const primaryBackupPath = `${resolvedRulePath}.bak`;
    const primaryBackup = await readInstructionFile(primaryBackupPath);
    const backupPath = primaryBackup.exists && !isTokenjuiceAntigravityRuleText(primaryBackup.text)
      ? `${resolvedRulePath}${TOKENJUICE_ANTIGRAVITY_REINSTALL_BACKUP_SUFFIX}`
      : primaryBackupPath;
    await writeFile(backupPath, existing.text, "utf8");
    await writeAntigravityRuleWithoutBackup(resolvedRulePath);
    return { rulePath: resolvedRulePath, backupPath };
  }

  const result = await writeInstructionFile(resolvedRulePath, TOKENJUICE_ANTIGRAVITY_RULE);
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAntigravityRule(
  rulePath?: string,
  options: AntigravityRuleOptions = {},
): Promise<UninstallAntigravityRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && !isTokenjuiceAntigravityRuleText(existing.text)) {
    throw new Error(
      `refusing to remove ${resolvedRulePath}; it does not look like the tokenjuice Antigravity rule. Review and remove it manually, or reinstall tokenjuice antigravity first.`,
    );
  }

  const backupPath = `${resolvedRulePath}.bak`;
  const backup = await readInstructionFile(backupPath);
  if (existing.exists && backup.exists && !isTokenjuiceAntigravityRuleText(backup.text)) {
    await rm(resolvedRulePath, { force: true });
    await rename(backupPath, resolvedRulePath);
    return { rulePath: resolvedRulePath, removed: true };
  }

  const result = await removeInstructionFile(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorAntigravityRule(
  rulePath?: string,
  options: AntigravityRuleOptions = {},
): Promise<AntigravityDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Antigravity rule is not installed"],
        advisory: TOKENJUICE_ANTIGRAVITY_ADVISORY,
        fixCommand: TOKENJUICE_ANTIGRAVITY_FIX_COMMAND,
      }),
    };
  }
  if (!isTokenjuiceAntigravityRuleText(existing.text)) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Antigravity rule is not installed; existing rule file is not tokenjuice-managed"],
        advisory: TOKENJUICE_ANTIGRAVITY_ADVISORY,
        fixCommand: TOKENJUICE_ANTIGRAVITY_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: "activation: always_on",
        missingIssue: "configured Antigravity rule file is missing always-on activation frontmatter",
      },
      {
        requiredText: TOKENJUICE_ANTIGRAVITY_OWNERSHIP_MARKER,
        missingIssue: "configured Antigravity rule file is missing the tokenjuice ownership marker",
      },
      {
        requiredText: TOKENJUICE_ANTIGRAVITY_RULE_MARKER,
        missingIssue: "configured Antigravity rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Antigravity rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Antigravity rule file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Antigravity rule file still suggests the full escape hatch",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_ANTIGRAVITY_ADVISORY,
      fixCommand: TOKENJUICE_ANTIGRAVITY_FIX_COMMAND,
    }),
  };
}
