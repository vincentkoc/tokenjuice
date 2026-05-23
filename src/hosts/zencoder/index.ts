import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type ZencoderRuleOptions = {
  projectDir?: string;
};

export type InstallZencoderRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallZencoderRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type ZencoderDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_ZENCODER_FIX_COMMAND = "tokenjuice install zencoder";
const TOKENJUICE_ZENCODER_OWNERSHIP_MARKER = "<!-- tokenjuice:zencoder-rule -->";
const TOKENJUICE_ZENCODER_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:zencoder-restore-backup=";
const TOKENJUICE_ZENCODER_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_ZENCODER_ADVISORY = "Zencoder support is beta and rule-based; it guides agent behavior but does not intercept tool output.";
const TOKENJUICE_ZENCODER_REINSTALL_BACKUP_SUFFIX = ".tokenjuice.bak";

function getLeadingFrontmatterLines(text: string): string[] {
  const frontmatterStart = text.match(/^---\r?\n/u);
  if (!frontmatterStart) {
    return [];
  }
  const endIndex = text.search(/\r?\n---(?:\r?\n|$)/u);
  if (endIndex === -1) {
    return [];
  }
  const frontmatter = text.slice(frontmatterStart[0].length, endIndex);
  return frontmatter.split(/\r?\n/u);
}

function hasAlwaysApplyFrontmatter(text: string): boolean {
  return getLeadingFrontmatterLines(text).some((line) => line.trim() === "alwaysApply: true");
}

function hasDescriptionFrontmatter(text: string): boolean {
  return getLeadingFrontmatterLines(text).some((line) => /^description:\s*.+$/u.test(line.trim()));
}

function getProjectDir(options: ZencoderRuleOptions = {}): string {
  return options.projectDir || process.env.ZENCODER_PROJECT_DIR || "";
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

async function resolveProjectDir(options: ZencoderRuleOptions = {}): Promise<string> {
  const projectDir = getProjectDir(options);
  if (projectDir) {
    return resolve(projectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultRulePath(options: ZencoderRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".zencoder", "rules", "tokenjuice.md");
}

function buildZencoderRule({ restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {}): string {
  return [
    "---",
    'description: "Use tokenjuice for noisy terminal output"',
    "alwaysApply: true",
    "---",
    "",
    TOKENJUICE_ZENCODER_OWNERSHIP_MARKER,
    ...(restoreBackupSuffix ? [`${TOKENJUICE_ZENCODER_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix} -->`] : []),
    "",
    `# ${TOKENJUICE_ZENCODER_RULE_MARKER}`,
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet: `- When running terminal commands through Zencoder, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
    }),
    "",
  ].join("\n");
}

function isTokenjuiceZencoderRuleText(text: string): boolean {
  return text.includes(TOKENJUICE_ZENCODER_OWNERSHIP_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/<!-- tokenjuice:zencoder-restore-backup=([^ ]+) -->/u);
  const suffix = match?.[1];
  if (!suffix || !suffix.startsWith(".") || suffix.includes("/") || suffix.includes("\\")) {
    return undefined;
  }
  return suffix;
}

async function chooseBackupSuffix(rulePath: string): Promise<string> {
  const primaryBackup = await readInstructionFile(`${rulePath}.bak`);
  if (!primaryBackup.exists) {
    return ".bak";
  }

  const secondaryBackup = await readInstructionFile(`${rulePath}${TOKENJUICE_ZENCODER_REINSTALL_BACKUP_SUFFIX}`);
  if (!secondaryBackup.exists) {
    return TOKENJUICE_ZENCODER_REINSTALL_BACKUP_SUFFIX;
  }

  for (let index = 1; ; index += 1) {
    const suffix = `.tokenjuice-${index}.bak`;
    const candidate = await readInstructionFile(`${rulePath}${suffix}`);
    if (!candidate.exists) {
      return suffix;
    }
  }
}

async function writeZencoderRuleWithoutBackup(
  rulePath: string,
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): Promise<void> {
  await mkdir(dirname(rulePath), { recursive: true });
  const tempPath = `${rulePath}.tmp`;
  await writeFile(tempPath, buildZencoderRule({ restoreBackupSuffix }), "utf8");
  await rename(tempPath, rulePath);
}

export async function installZencoderRule(
  rulePath?: string,
  options: ZencoderRuleOptions = {},
): Promise<InstallZencoderRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && isTokenjuiceZencoderRuleText(existing.text)) {
    const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
    const expectedRule = buildZencoderRule({ restoreBackupSuffix });
    if (existing.text === expectedRule) {
      return { rulePath: resolvedRulePath };
    }

    const backupPath = `${resolvedRulePath}${await chooseBackupSuffix(resolvedRulePath)}`;
    await writeFile(backupPath, existing.text, "utf8");
    await writeZencoderRuleWithoutBackup(resolvedRulePath, { restoreBackupSuffix });
    return { rulePath: resolvedRulePath, backupPath };
  }

  if (existing.exists) {
    const backupSuffix = await chooseBackupSuffix(resolvedRulePath);
    const backupPath = `${resolvedRulePath}${backupSuffix}`;
    await writeFile(backupPath, existing.text, "utf8");
    await writeZencoderRuleWithoutBackup(resolvedRulePath, { restoreBackupSuffix: backupSuffix });
    return { rulePath: resolvedRulePath, backupPath };
  }

  await writeZencoderRuleWithoutBackup(resolvedRulePath);
  return { rulePath: resolvedRulePath };
}

export async function uninstallZencoderRule(
  rulePath?: string,
  options: ZencoderRuleOptions = {},
): Promise<UninstallZencoderRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && !isTokenjuiceZencoderRuleText(existing.text)) {
    throw new Error(
      `refusing to remove ${resolvedRulePath}; it does not look like the tokenjuice Zencoder rule. Review and remove it manually, or reinstall tokenjuice zencoder first.`,
    );
  }

  const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
  const backupPath = restoreBackupSuffix ? `${resolvedRulePath}${restoreBackupSuffix}` : "";
  const backup = restoreBackupSuffix ? await readInstructionFile(backupPath) : { exists: false, text: "" };
  if (
    existing.exists
    && restoreBackupSuffix
    && backup.exists
    && !isTokenjuiceZencoderRuleText(backup.text)
  ) {
    await rm(resolvedRulePath, { force: true });
    await rename(backupPath, resolvedRulePath);
    return { rulePath: resolvedRulePath, removed: true };
  }

  const result = await removeInstructionFile(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorZencoderRule(
  rulePath?: string,
  options: ZencoderRuleOptions = {},
): Promise<ZencoderDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Zencoder rule is not installed"],
        advisory: TOKENJUICE_ZENCODER_ADVISORY,
        fixCommand: TOKENJUICE_ZENCODER_FIX_COMMAND,
      }),
    };
  }
  if (!isTokenjuiceZencoderRuleText(existing.text)) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Zencoder rule is not installed; existing rule file is not tokenjuice-managed"],
        advisory: TOKENJUICE_ZENCODER_ADVISORY,
        fixCommand: TOKENJUICE_ZENCODER_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_ZENCODER_OWNERSHIP_MARKER,
        missingIssue: "configured Zencoder rule file is missing the tokenjuice ownership marker",
      },
      {
        requiredText: TOKENJUICE_ZENCODER_RULE_MARKER,
        missingIssue: "configured Zencoder rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Zencoder rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Zencoder rule file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Zencoder rule file still suggests the full escape hatch",
      },
    ],
  });
  if (!hasAlwaysApplyFrontmatter(existing.text)) {
    issues.push("configured Zencoder rule file is missing alwaysApply frontmatter");
  }
  if (!hasDescriptionFrontmatter(existing.text)) {
    issues.push("configured Zencoder rule file is missing description frontmatter");
  }

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_ZENCODER_ADVISORY,
      fixCommand: TOKENJUICE_ZENCODER_FIX_COMMAND,
    }),
  };
}
