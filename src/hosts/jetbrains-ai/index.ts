import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { doctorOwnedInstructionFile } from "../shared/owned-instruction-doctor.js";

import { findGitRoot } from "../shared/project-root.js";

import {
  collectTokenjuiceGuidanceIssues,
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import { createRestorableRuleCommands } from "../shared/restorable-rule.js";
import type { PathDoctorReport } from "../shared/instruction-doctor.js";

export type JetBrainsAiRuleOptions = {
  projectDir?: string;
};

export type InstallJetBrainsAiRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallJetBrainsAiRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type JetBrainsAiDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_JETBRAINS_AI_FIX_COMMAND = "tokenjuice install jetbrains-ai";
const TOKENJUICE_JETBRAINS_AI_OWNERSHIP_MARKER = "<!-- tokenjuice:jetbrains-ai-rule -->";
const TOKENJUICE_JETBRAINS_AI_LEGACY_RESTORE_BACKUP_MARKER = "<!-- tokenjuice:jetbrains-ai-restore-backup -->";
const TOKENJUICE_JETBRAINS_AI_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:jetbrains-ai-restore-backup=";
const TOKENJUICE_JETBRAINS_AI_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_JETBRAINS_AI_ADVISORY = "JetBrains AI Assistant support is beta and rule-based; it guides chat behavior but does not intercept tool output.";

function getProjectDir(options: JetBrainsAiRuleOptions = {}): string {
  return options.projectDir || process.env.JETBRAINS_AI_PROJECT_DIR || "";
}

async function resolveProjectDir(options: JetBrainsAiRuleOptions = {}): Promise<string> {
  const projectDir = getProjectDir(options);
  if (projectDir) {
    return resolve(projectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultRulePath(options: JetBrainsAiRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".aiassistant", "rules", "tokenjuice.md");
}

function buildJetBrainsAiRule({ restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {}): string {
  return [
    TOKENJUICE_JETBRAINS_AI_OWNERSHIP_MARKER,
    ...(restoreBackupSuffix ? [`${TOKENJUICE_JETBRAINS_AI_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix} -->`] : []),
    "",
    `# ${TOKENJUICE_JETBRAINS_AI_RULE_MARKER}`,
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet: `- When running terminal commands from JetBrains AI Assistant chat, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
    }),
    "",
  ].join("\n");
}

function isTokenjuiceJetBrainsAiRuleText(text: string): boolean {
  return text.includes(TOKENJUICE_JETBRAINS_AI_OWNERSHIP_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  if (text.includes(TOKENJUICE_JETBRAINS_AI_LEGACY_RESTORE_BACKUP_MARKER)) {
    return ".bak";
  }

  const match = text.match(/<!-- tokenjuice:jetbrains-ai-restore-backup=([^ ]+) -->/u);
  const suffix = match?.[1];
  if (!suffix || !suffix.startsWith(".") || suffix.includes("/") || suffix.includes("\\")) {
    return undefined;
  }
  return suffix;
}

async function writeJetBrainsAiRuleWithoutBackup(
  rulePath: string,
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): Promise<void> {
  await mkdir(dirname(rulePath), { recursive: true });
  const tempPath = `${rulePath}.tmp`;
  await writeFile(tempPath, buildJetBrainsAiRule({ restoreBackupSuffix }), "utf8");
  await rename(tempPath, rulePath);
}

const restorableCommands = createRestorableRuleCommands({
  buildText: buildJetBrainsAiRule,
  isManagedText: isTokenjuiceJetBrainsAiRuleText,
  readRestoreBackupSuffix,
  writeWithoutBackup: writeJetBrainsAiRuleWithoutBackup,
  refusalMessage: (filePath) => `refusing to remove ${filePath}; it does not look like the tokenjuice JetBrains AI Assistant rule. Review and remove it manually, or reinstall tokenjuice jetbrains-ai first.`,
});

export async function installJetBrainsAiRule(
  rulePath?: string,
  options: JetBrainsAiRuleOptions = {},
): Promise<InstallJetBrainsAiRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const result = await restorableCommands.install(resolvedRulePath);
  return { rulePath: result.filePath, ...(result.backupPath ? { backupPath: result.backupPath } : {}) };
}

export async function uninstallJetBrainsAiRule(
  rulePath?: string,
  options: JetBrainsAiRuleOptions = {},
): Promise<UninstallJetBrainsAiRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const result = await restorableCommands.uninstall(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorJetBrainsAiRule(
  rulePath?: string,
  options: JetBrainsAiRuleOptions = {},
): Promise<JetBrainsAiDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  return {
    rulePath: resolvedRulePath,
    ...await doctorOwnedInstructionFile(resolvedRulePath, {
      isManagedText: isTokenjuiceJetBrainsAiRuleText,
      missingIssue: "tokenjuice JetBrains AI Assistant rule is not installed",
      unmanagedIssue: "tokenjuice JetBrains AI Assistant rule is not installed; existing rule file is not tokenjuice-managed",
      advisory: TOKENJUICE_JETBRAINS_AI_ADVISORY,
      fixCommand: TOKENJUICE_JETBRAINS_AI_FIX_COMMAND,
      collectIssues: (text) => collectTokenjuiceGuidanceIssues(text, {
        configuredLabel: "JetBrains AI Assistant rule file",
        singular: true,
        additionalRequired: [
          {
            requiredText: TOKENJUICE_JETBRAINS_AI_OWNERSHIP_MARKER,
            missingIssue: "configured JetBrains AI Assistant rule file is missing the tokenjuice ownership marker",
          },
          {
            requiredText: TOKENJUICE_JETBRAINS_AI_RULE_MARKER,
            missingIssue: "configured JetBrains AI Assistant rule file does not look like the tokenjuice rule",
          },
        ],
      }),
    }),
  };
}
