import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { findGitRoot } from "../shared/project-root.js";

import {
  collectTokenjuiceGuidanceIssues,
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import { createRestorableRuleCommands } from "../shared/restorable-rule.js";
import type { PathDoctorReport } from "../shared/instruction-doctor.js";
import { doctorOwnedInstructionFile } from "../shared/owned-instruction-doctor.js";

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

export type ZencoderDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_ZENCODER_FIX_COMMAND = "tokenjuice install zencoder";
const TOKENJUICE_ZENCODER_OWNERSHIP_MARKER = "<!-- tokenjuice:zencoder-rule -->";
const TOKENJUICE_ZENCODER_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:zencoder-restore-backup=";
const TOKENJUICE_ZENCODER_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_ZENCODER_ADVISORY = "Zencoder support is beta and rule-based; it guides agent behavior but does not intercept tool output.";

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

async function writeZencoderRuleWithoutBackup(
  rulePath: string,
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): Promise<void> {
  await mkdir(dirname(rulePath), { recursive: true });
  const tempPath = `${rulePath}.tmp`;
  await writeFile(tempPath, buildZencoderRule({ restoreBackupSuffix }), "utf8");
  await rename(tempPath, rulePath);
}

const restorableCommands = createRestorableRuleCommands({
  buildText: buildZencoderRule,
  isManagedText: isTokenjuiceZencoderRuleText,
  readRestoreBackupSuffix,
  writeWithoutBackup: writeZencoderRuleWithoutBackup,
  refusalMessage: (filePath) => `refusing to remove ${filePath}; it does not look like the tokenjuice Zencoder rule. Review and remove it manually, or reinstall tokenjuice zencoder first.`,
});

export async function installZencoderRule(
  rulePath?: string,
  options: ZencoderRuleOptions = {},
): Promise<InstallZencoderRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const result = await restorableCommands.install(resolvedRulePath);
  return { rulePath: result.filePath, ...(result.backupPath ? { backupPath: result.backupPath } : {}) };
}

export async function uninstallZencoderRule(
  rulePath?: string,
  options: ZencoderRuleOptions = {},
): Promise<UninstallZencoderRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const result = await restorableCommands.uninstall(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorZencoderRule(
  rulePath?: string,
  options: ZencoderRuleOptions = {},
): Promise<ZencoderDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  return {
    rulePath: resolvedRulePath,
    ...await doctorOwnedInstructionFile(resolvedRulePath, {
      isManagedText: isTokenjuiceZencoderRuleText,
      missingIssue: "tokenjuice Zencoder rule is not installed",
      unmanagedIssue: "tokenjuice Zencoder rule is not installed; existing rule file is not tokenjuice-managed",
      advisory: TOKENJUICE_ZENCODER_ADVISORY,
      fixCommand: TOKENJUICE_ZENCODER_FIX_COMMAND,
      collectIssues: (text) => {
        const issues = collectTokenjuiceGuidanceIssues(text, {
          configuredLabel: "Zencoder rule file",
          singular: true,
          additionalRequired: [
            {
              requiredText: TOKENJUICE_ZENCODER_OWNERSHIP_MARKER,
              missingIssue: "configured Zencoder rule file is missing the tokenjuice ownership marker",
            },
            {
              requiredText: TOKENJUICE_ZENCODER_RULE_MARKER,
              missingIssue: "configured Zencoder rule file does not look like the tokenjuice rule",
            },
          ],
        });
        if (!hasAlwaysApplyFrontmatter(text)) {
          issues.push("configured Zencoder rule file is missing alwaysApply frontmatter");
        }
        if (!hasDescriptionFrontmatter(text)) {
          issues.push("configured Zencoder rule file is missing description frontmatter");
        }
        return issues;
      },
    }),
  };
}
