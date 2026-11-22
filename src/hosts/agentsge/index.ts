import { join } from "node:path";

import { createProjectDirResolver } from "../shared/project-root.js";

import {
  collectTokenjuiceGuidanceIssues,
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import { readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  type PathDoctorReport,
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

export type AgentsGeDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_AGENTSGE_FIX_COMMAND = "tokenjuice install agentsge";
const TOKENJUICE_AGENTSGE_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_AGENTSGE_ADVISORY =
  "agents.ge support is beta and rule-based; run `agents sync` after install so generated agent entrypoints receive the rule.";

const resolveProjectDir = createProjectDirResolver("AGENTSGE_PROJECT_DIR");

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

  const issues = collectTokenjuiceGuidanceIssues(existing.text, {
    configuredLabel: "agents.ge rule file",
    singular: true,
    additionalRequired: [
      {
        requiredText: TOKENJUICE_AGENTSGE_RULE_MARKER,
        missingIssue: "configured agents.ge rule file does not look like the tokenjuice rule",
      },
    ],
    additionalRequiredAfter: [
      {
        requiredText: "agents sync",
        missingIssue: "configured agents.ge rule file is missing sync guidance",
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
