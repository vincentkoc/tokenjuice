import { rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { doctorOwnedInstructionFile } from "../shared/owned-instruction-doctor.js";

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
import type { PathDoctorReport } from "../shared/instruction-doctor.js";

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

export type AntigravityDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_ANTIGRAVITY_FIX_COMMAND = "tokenjuice install antigravity";
const TOKENJUICE_ANTIGRAVITY_OWNERSHIP_MARKER = "<!-- tokenjuice:antigravity-rule -->";
const TOKENJUICE_ANTIGRAVITY_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_ANTIGRAVITY_ADVISORY = "Antigravity support is beta and rule-based; it guides command usage but does not intercept tool output.";

function getExplicitProjectDir(options: AntigravityRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.ANTIGRAVITY_PROJECT_DIR;
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

export async function installAntigravityRule(
  rulePath?: string,
  options: AntigravityRuleOptions = {},
): Promise<InstallAntigravityRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const result = await installManagedInstructionFile(
    resolvedRulePath,
    TOKENJUICE_ANTIGRAVITY_RULE,
    isTokenjuiceAntigravityRuleText,
  );
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
  return {
    rulePath: resolvedRulePath,
    ...await doctorOwnedInstructionFile(resolvedRulePath, {
      isManagedText: isTokenjuiceAntigravityRuleText,
      missingIssue: "tokenjuice Antigravity rule is not installed",
      unmanagedIssue: "tokenjuice Antigravity rule is not installed; existing rule file is not tokenjuice-managed",
      advisory: TOKENJUICE_ANTIGRAVITY_ADVISORY,
      fixCommand: TOKENJUICE_ANTIGRAVITY_FIX_COMMAND,
      collectIssues: (text) => collectTokenjuiceGuidanceIssues(text, {
        configuredLabel: "Antigravity rule file",
        singular: true,
        additionalRequired: [
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
        ],
      }),
    }),
  };
}
