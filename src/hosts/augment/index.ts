import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type AugmentRuleOptions = {
  projectDir?: string;
};

export type InstallAugmentRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallAugmentRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type AugmentDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AUGMENT_FIX_COMMAND = "tokenjuice install augment";
const TOKENJUICE_AUGMENT_OWNERSHIP_MARKER = "<!-- tokenjuice:augment-rule -->";
const TOKENJUICE_AUGMENT_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_AUGMENT_ADVISORY = "Augment support is beta and rule-based; it guides command usage but does not intercept tool output.";
const TOKENJUICE_AUGMENT_REINSTALL_BACKUP_SUFFIX = ".tokenjuice.bak";

function getProjectDir(options: AugmentRuleOptions = {}): string {
  return options.projectDir || process.env.AUGMENT_PROJECT_DIR || "";
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

async function resolveProjectDir(options: AugmentRuleOptions = {}): Promise<string> {
  const projectDir = getProjectDir(options);
  if (projectDir) {
    return resolve(projectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultRulePath(options: AugmentRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".augment", "rules", "tokenjuice.md");
}

const TOKENJUICE_AUGMENT_RULE = [
  "---",
  "type: always_apply",
  "---",
  "",
  TOKENJUICE_AUGMENT_OWNERSHIP_MARKER,
  "",
  `# ${TOKENJUICE_AUGMENT_RULE_MARKER}`,
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When running terminal commands through Augment or Auggie, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
  }),
  "",
].join("\n");

function isTokenjuiceAugmentRuleText(text: string): boolean {
  return text.includes(TOKENJUICE_AUGMENT_OWNERSHIP_MARKER);
}

async function writeAugmentRuleWithoutBackup(rulePath: string): Promise<void> {
  await mkdir(dirname(rulePath), { recursive: true });
  const tempPath = `${rulePath}.tmp`;
  await writeFile(tempPath, TOKENJUICE_AUGMENT_RULE, "utf8");
  await rename(tempPath, rulePath);
}

export async function installAugmentRule(
  rulePath?: string,
  options: AugmentRuleOptions = {},
): Promise<InstallAugmentRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && isTokenjuiceAugmentRuleText(existing.text)) {
    if (existing.text === TOKENJUICE_AUGMENT_RULE) {
      return { rulePath: resolvedRulePath };
    }

    const primaryBackupPath = `${resolvedRulePath}.bak`;
    const primaryBackup = await readInstructionFile(primaryBackupPath);
    const backupPath = primaryBackup.exists && !isTokenjuiceAugmentRuleText(primaryBackup.text)
      ? `${resolvedRulePath}${TOKENJUICE_AUGMENT_REINSTALL_BACKUP_SUFFIX}`
      : primaryBackupPath;
    await writeFile(backupPath, existing.text, "utf8");
    await writeAugmentRuleWithoutBackup(resolvedRulePath);
    return { rulePath: resolvedRulePath, backupPath };
  }

  const result = await writeInstructionFile(resolvedRulePath, TOKENJUICE_AUGMENT_RULE);
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAugmentRule(
  rulePath?: string,
  options: AugmentRuleOptions = {},
): Promise<UninstallAugmentRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && !isTokenjuiceAugmentRuleText(existing.text)) {
    throw new Error(
      `refusing to remove ${resolvedRulePath}; it does not look like the tokenjuice Augment rule. Review and remove it manually, or reinstall tokenjuice augment first.`,
    );
  }

  const backupPath = `${resolvedRulePath}.bak`;
  const backup = await readInstructionFile(backupPath);
  if (existing.exists && backup.exists && !isTokenjuiceAugmentRuleText(backup.text)) {
    await rm(resolvedRulePath, { force: true });
    await rename(backupPath, resolvedRulePath);
    return { rulePath: resolvedRulePath, removed: true };
  }

  const result = await removeInstructionFile(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorAugmentRule(
  rulePath?: string,
  options: AugmentRuleOptions = {},
): Promise<AugmentDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Augment rule is not installed"],
        advisory: TOKENJUICE_AUGMENT_ADVISORY,
        fixCommand: TOKENJUICE_AUGMENT_FIX_COMMAND,
      }),
    };
  }
  if (!isTokenjuiceAugmentRuleText(existing.text)) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Augment rule is not installed; existing rule file is not tokenjuice-managed"],
        advisory: TOKENJUICE_AUGMENT_ADVISORY,
        fixCommand: TOKENJUICE_AUGMENT_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: "type: always_apply",
        missingIssue: "configured Augment rule file is missing always_apply frontmatter",
      },
      {
        requiredText: TOKENJUICE_AUGMENT_OWNERSHIP_MARKER,
        missingIssue: "configured Augment rule file is missing the tokenjuice ownership marker",
      },
      {
        requiredText: TOKENJUICE_AUGMENT_RULE_MARKER,
        missingIssue: "configured Augment rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Augment rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Augment rule file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Augment rule file still suggests the full escape hatch",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_AUGMENT_ADVISORY,
      fixCommand: TOKENJUICE_AUGMENT_FIX_COMMAND,
    }),
  };
}
