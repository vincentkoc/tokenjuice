import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
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

export type RulerDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_RULER_FIX_COMMAND = "tokenjuice install ruler";
const TOKENJUICE_RULER_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_RULER_ADVISORY = "Ruler support is beta and rule-based; run `ruler apply` after install so Ruler propagates the rule to configured agents.";
const TOKENJUICE_RULER_REINSTALL_BACKUP_SUFFIX = ".tokenjuice.bak";

function getExplicitProjectDir(options: RulerRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.RULER_PROJECT_DIR;
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

async function writeRulerRuleWithoutBackup(rulePath: string): Promise<void> {
  await mkdir(dirname(rulePath), { recursive: true });
  const tempPath = `${rulePath}.tmp`;
  await writeFile(tempPath, TOKENJUICE_RULER_RULE, "utf8");
  await rename(tempPath, rulePath);
}

function isTokenjuiceRulerRuleText(text: string): boolean {
  return text.includes(TOKENJUICE_RULER_RULE_MARKER);
}

export async function installRulerRule(
  rulePath?: string,
  options: RulerRuleOptions = {},
): Promise<InstallRulerRuleResult> {
  const resolvedRulePath = rulePath ?? await getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && isTokenjuiceRulerRuleText(existing.text)) {
    if (existing.text === TOKENJUICE_RULER_RULE) {
      return { rulePath: resolvedRulePath };
    }

    const primaryBackupPath = `${resolvedRulePath}.bak`;
    const primaryBackup = await readInstructionFile(primaryBackupPath);
    const backupPath = primaryBackup.exists && !isTokenjuiceRulerRuleText(primaryBackup.text)
      ? `${resolvedRulePath}${TOKENJUICE_RULER_REINSTALL_BACKUP_SUFFIX}`
      : primaryBackupPath;
    await writeFile(backupPath, existing.text, "utf8");
    await writeRulerRuleWithoutBackup(resolvedRulePath);
    return { rulePath: resolvedRulePath, backupPath };
  }

  const result = await writeInstructionFile(resolvedRulePath, TOKENJUICE_RULER_RULE);
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

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_RULER_RULE_MARKER,
        missingIssue: "configured Ruler rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Ruler rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Ruler rule file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Ruler rule file still suggests the full escape hatch",
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
