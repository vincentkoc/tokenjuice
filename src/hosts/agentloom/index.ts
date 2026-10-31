import { join } from "node:path";

import { createProjectDirResolver } from "../shared/project-root.js";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  type PathDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type AgentloomRuleOptions = {
  projectDir?: string;
};

export type InstallAgentloomRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallAgentloomRuleResult = {
  rulePath: string;
  removed: boolean;
  syncCommand: string;
};

export type AgentloomDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_AGENTLOOM_FIX_COMMAND = "tokenjuice install agentloom";
const TOKENJUICE_AGENTLOOM_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_AGENTLOOM_ADVISORY =
  "Agentloom support is beta and rule-based; run `agentloom sync` after install so provider-native configs receive the rule.";

function parseLeadingFrontmatter(text: string): Map<string, string> | undefined {
  const frontmatterStart = text.match(/^---\r?\n/u);
  if (!frontmatterStart) {
    return undefined;
  }
  const endIndex = text.search(/\r?\n---(?:\r?\n|$)/u);
  if (endIndex === -1) {
    return undefined;
  }

  const fields = new Map<string, string>();
  const frontmatter = text.slice(frontmatterStart[0].length, endIndex);
  for (const line of frontmatter.split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z][\w-]*):\s*(.*?)\s*$/u);
    if (!match) {
      continue;
    }
    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) {
      continue;
    }
    const value = rawValue.replace(/^["']|["']$/gu, "");
    fields.set(key.trim(), value);
  }
  return fields;
}

const resolveProjectDir = createProjectDirResolver("AGENTLOOM_PROJECT_DIR");

async function getDefaultRulePath(options: AgentloomRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".agents", "rules", "tokenjuice-agentloom.md");
}

const TOKENJUICE_AGENTLOOM_RULE = [
  "---",
  `name: ${TOKENJUICE_AGENTLOOM_RULE_MARKER}`,
  `description: ${TOKENJUICE_AGENTLOOM_RULE_MARKER}`,
  "alwaysApply: true",
  "---",
  "",
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When Agentloom syncs this rule into provider-native coding-agent configs, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for terminal commands likely to produce long output.`,
  }),
  "- After editing this source rule, run `agentloom sync` so provider-native configs receive the updated guidance.",
  "",
].join("\n");

export async function installAgentloomRule(
  rulePath?: string,
  options: AgentloomRuleOptions = {},
): Promise<InstallAgentloomRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && existing.text === TOKENJUICE_AGENTLOOM_RULE) {
    return { rulePath: resolvedRulePath };
  }

  const result = await writeInstructionFile(resolvedRulePath, TOKENJUICE_AGENTLOOM_RULE);
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAgentloomRule(
  rulePath?: string,
  options: AgentloomRuleOptions = {},
): Promise<UninstallAgentloomRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const result = await removeInstructionFile(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed, syncCommand: "agentloom sync" };
}

export async function doctorAgentloomRule(
  rulePath?: string,
  options: AgentloomRuleOptions = {},
): Promise<AgentloomDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Agentloom rule is not installed"],
        advisory: TOKENJUICE_AGENTLOOM_ADVISORY,
        fixCommand: TOKENJUICE_AGENTLOOM_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_AGENTLOOM_RULE_MARKER,
        missingIssue: "configured Agentloom rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Agentloom rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Agentloom rule file is missing the raw escape hatch",
      },
      {
        requiredText: "agentloom sync",
        missingIssue: "configured Agentloom rule file is missing sync guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Agentloom rule file still suggests the full escape hatch",
      },
    ],
  });
  const frontmatter = parseLeadingFrontmatter(existing.text);
  if (frontmatter?.get("name") !== TOKENJUICE_AGENTLOOM_RULE_MARKER) {
    issues.push("configured Agentloom rule file is missing required name frontmatter");
  }
  if (frontmatter?.get("description") !== TOKENJUICE_AGENTLOOM_RULE_MARKER) {
    issues.push("configured Agentloom rule file is missing description frontmatter");
  }
  if (frontmatter?.get("alwaysApply") !== "true") {
    issues.push("configured Agentloom rule file is missing alwaysApply frontmatter");
  }

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_AGENTLOOM_ADVISORY,
      fixCommand: TOKENJUICE_AGENTLOOM_FIX_COMMAND,
    }),
  };
}
