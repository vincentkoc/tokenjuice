import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

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

export type JetBrainsAiDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_JETBRAINS_AI_FIX_COMMAND = "tokenjuice install jetbrains-ai";
const TOKENJUICE_JETBRAINS_AI_OWNERSHIP_MARKER = "<!-- tokenjuice:jetbrains-ai-rule -->";
const TOKENJUICE_JETBRAINS_AI_LEGACY_RESTORE_BACKUP_MARKER = "<!-- tokenjuice:jetbrains-ai-restore-backup -->";
const TOKENJUICE_JETBRAINS_AI_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:jetbrains-ai-restore-backup=";
const TOKENJUICE_JETBRAINS_AI_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_JETBRAINS_AI_ADVISORY = "JetBrains AI Assistant support is beta and rule-based; it guides chat behavior but does not intercept tool output.";
const TOKENJUICE_JETBRAINS_AI_REINSTALL_BACKUP_SUFFIX = ".tokenjuice.bak";

function getProjectDir(options: JetBrainsAiRuleOptions = {}): string {
  return options.projectDir || process.env.JETBRAINS_AI_PROJECT_DIR || "";
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

async function chooseBackupSuffix(rulePath: string): Promise<string> {
  const primaryBackup = await readInstructionFile(`${rulePath}.bak`);
  if (!primaryBackup.exists) {
    return ".bak";
  }

  const secondaryBackup = await readInstructionFile(`${rulePath}${TOKENJUICE_JETBRAINS_AI_REINSTALL_BACKUP_SUFFIX}`);
  if (!secondaryBackup.exists) {
    return TOKENJUICE_JETBRAINS_AI_REINSTALL_BACKUP_SUFFIX;
  }

  for (let index = 1; ; index += 1) {
    const suffix = `.tokenjuice-${index}.bak`;
    const candidate = await readInstructionFile(`${rulePath}${suffix}`);
    if (!candidate.exists) {
      return suffix;
    }
  }
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

export async function installJetBrainsAiRule(
  rulePath?: string,
  options: JetBrainsAiRuleOptions = {},
): Promise<InstallJetBrainsAiRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && isTokenjuiceJetBrainsAiRuleText(existing.text)) {
    const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
    const expectedRule = buildJetBrainsAiRule({ restoreBackupSuffix });
    if (existing.text === expectedRule) {
      return { rulePath: resolvedRulePath };
    }

    const backupPath = `${resolvedRulePath}${await chooseBackupSuffix(resolvedRulePath)}`;
    await writeFile(backupPath, existing.text, "utf8");
    await writeJetBrainsAiRuleWithoutBackup(resolvedRulePath, { restoreBackupSuffix });
    return { rulePath: resolvedRulePath, backupPath };
  }

  if (existing.exists) {
    const backupSuffix = await chooseBackupSuffix(resolvedRulePath);
    const backupPath = `${resolvedRulePath}${backupSuffix}`;
    await writeFile(backupPath, existing.text, "utf8");
    await writeJetBrainsAiRuleWithoutBackup(resolvedRulePath, { restoreBackupSuffix: backupSuffix });
    return { rulePath: resolvedRulePath, backupPath };
  }

  await writeJetBrainsAiRuleWithoutBackup(resolvedRulePath);
  return { rulePath: resolvedRulePath };
}

export async function uninstallJetBrainsAiRule(
  rulePath?: string,
  options: JetBrainsAiRuleOptions = {},
): Promise<UninstallJetBrainsAiRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && !isTokenjuiceJetBrainsAiRuleText(existing.text)) {
    throw new Error(
      `refusing to remove ${resolvedRulePath}; it does not look like the tokenjuice JetBrains AI Assistant rule. Review and remove it manually, or reinstall tokenjuice jetbrains-ai first.`,
    );
  }

  const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
  const backupPath = restoreBackupSuffix ? `${resolvedRulePath}${restoreBackupSuffix}` : "";
  const backup = restoreBackupSuffix ? await readInstructionFile(backupPath) : { exists: false, text: "" };
  if (
    existing.exists
    && restoreBackupSuffix
    && backup.exists
    && !isTokenjuiceJetBrainsAiRuleText(backup.text)
  ) {
    await rm(resolvedRulePath, { force: true });
    await rename(backupPath, resolvedRulePath);
    return { rulePath: resolvedRulePath, removed: true };
  }

  const result = await removeInstructionFile(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorJetBrainsAiRule(
  rulePath?: string,
  options: JetBrainsAiRuleOptions = {},
): Promise<JetBrainsAiDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice JetBrains AI Assistant rule is not installed"],
        advisory: TOKENJUICE_JETBRAINS_AI_ADVISORY,
        fixCommand: TOKENJUICE_JETBRAINS_AI_FIX_COMMAND,
      }),
    };
  }
  if (!isTokenjuiceJetBrainsAiRuleText(existing.text)) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice JetBrains AI Assistant rule is not installed; existing rule file is not tokenjuice-managed"],
        advisory: TOKENJUICE_JETBRAINS_AI_ADVISORY,
        fixCommand: TOKENJUICE_JETBRAINS_AI_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_JETBRAINS_AI_OWNERSHIP_MARKER,
        missingIssue: "configured JetBrains AI Assistant rule file is missing the tokenjuice ownership marker",
      },
      {
        requiredText: TOKENJUICE_JETBRAINS_AI_RULE_MARKER,
        missingIssue: "configured JetBrains AI Assistant rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured JetBrains AI Assistant rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured JetBrains AI Assistant rule file is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured JetBrains AI Assistant rule file still suggests the full escape hatch",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_JETBRAINS_AI_ADVISORY,
      fixCommand: TOKENJUICE_JETBRAINS_AI_FIX_COMMAND,
    }),
  };
}
