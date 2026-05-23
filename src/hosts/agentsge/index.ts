import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type AgentsGeRuleOptions = {
  projectDir?: string;
};

export type InstallAgentsGeRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallAgentsGeRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type AgentsGeDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AGENTSGE_FIX_COMMAND = "tokenjuice install agentsge";
const TOKENJUICE_AGENTSGE_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_AGENTSGE_ADVISORY =
  "agents.ge support is beta and rule-based; run `agents sync` after install so generated agent entrypoints receive the rule.";

function getExplicitProjectDir(options: AgentsGeRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.AGENTSGE_PROJECT_DIR;
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

async function resolveProjectDir(options: AgentsGeRuleOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultRulePath(options: AgentsGeRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".agents", "rules", "tokenjuice-agentsge.md");
}

const TOKENJUICE_AGENTSGE_RULE = [
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When agents.ge syncs this rule into coding-agent entrypoints, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for terminal commands likely to produce long output.`,
  }),
  "- After editing this source rule, run `agents sync` so generated agent entrypoints receive the updated guidance.",
  "",
].join("\n");

export async function installAgentsGeRule(
  rulePath?: string,
  options: AgentsGeRuleOptions = {},
): Promise<InstallAgentsGeRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && existing.text === TOKENJUICE_AGENTSGE_RULE) {
    return { rulePath: resolvedRulePath };
  }
  const result = await writeInstructionFile(resolvedRulePath, TOKENJUICE_AGENTSGE_RULE);
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAgentsGeRule(
  rulePath?: string,
  options: AgentsGeRuleOptions = {},
): Promise<UninstallAgentsGeRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const result = await removeInstructionFile(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorAgentsGeRule(
  rulePath?: string,
  options: AgentsGeRuleOptions = {},
): Promise<AgentsGeDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice agents.ge rule is not installed"],
        advisory: TOKENJUICE_AGENTSGE_ADVISORY,
        fixCommand: TOKENJUICE_AGENTSGE_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_AGENTSGE_RULE_MARKER,
        missingIssue: "configured agents.ge rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured agents.ge rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured agents.ge rule file is missing the raw escape hatch",
      },
      {
        requiredText: "agents sync",
        missingIssue: "configured agents.ge rule file is missing sync guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured agents.ge rule file still suggests the full escape hatch",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_AGENTSGE_ADVISORY,
      fixCommand: TOKENJUICE_AGENTSGE_FIX_COMMAND,
    }),
  };
}
