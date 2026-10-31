import { rename, rm } from "node:fs/promises";
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

export type AugmentDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_AUGMENT_FIX_COMMAND = "tokenjuice install augment";
const TOKENJUICE_AUGMENT_OWNERSHIP_MARKER = "<!-- tokenjuice:augment-rule -->";
const TOKENJUICE_AUGMENT_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_AUGMENT_ADVISORY = "Augment support is beta and rule-based; it guides command usage but does not intercept tool output.";

function getProjectDir(options: AugmentRuleOptions = {}): string {
  return options.projectDir || process.env.AUGMENT_PROJECT_DIR || "";
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

export async function installAugmentRule(
  rulePath?: string,
  options: AugmentRuleOptions = {},
): Promise<InstallAugmentRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const result = await installManagedInstructionFile(
    resolvedRulePath,
    TOKENJUICE_AUGMENT_RULE,
    isTokenjuiceAugmentRuleText,
  );
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

  const issues = collectTokenjuiceGuidanceIssues(existing.text, {
    configuredLabel: "Augment rule file",
    singular: true,
    additionalRequired: [
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
