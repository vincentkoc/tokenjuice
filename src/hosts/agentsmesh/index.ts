import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
} from "../shared/instruction-doctor.js";

export type AgentsMeshRuleOptions = {
  projectDir?: string;
};

export type InstallAgentsMeshRuleResult = {
  rulePath: string;
  backupPath?: string;
  syncCommand: string;
};

export type UninstallAgentsMeshRuleResult = {
  rulePath: string;
  removed: boolean;
  syncCommand: string;
};

export type AgentsMeshDoctorReport = {
  rulePath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

type AgentsMeshDoctorReportFields = Omit<AgentsMeshDoctorReport, "rulePath" | "hasTokenjuiceMarker">;

const TOKENJUICE_AGENTSMESH_FIX_COMMAND = "tokenjuice install agentsmesh";
const TOKENJUICE_AGENTSMESH_INIT_FIX_COMMAND = "agentsmesh init && tokenjuice install agentsmesh";
const TOKENJUICE_AGENTSMESH_RULES_FIX_COMMAND = "edit agentsmesh.yaml features to include rules, then tokenjuice install agentsmesh";
const TOKENJUICE_AGENTSMESH_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_AGENTSMESH_ADVISORY =
  "AgentsMesh support is beta and rule-based; run `agentsmesh init` before install and `agentsmesh generate` after install so generated tool configs receive the rule.";
const TOKENJUICE_AGENTSMESH_UNINITIALIZED_ISSUE =
  "AgentsMesh project is not initialized; run `agentsmesh init` before installing tokenjuice rules";
const TOKENJUICE_AGENTSMESH_RULES_DISABLED_ISSUE =
  "AgentsMesh rules feature is disabled in agentsmesh.yaml; add `rules` to features before running agentsmesh generate";
const AGENTSMESH_REQUIRED_PROJECT_FILES = ["agentsmesh.yaml"] as const;

function getExplicitProjectDir(options: AgentsMeshRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.AGENTSMESH_PROJECT_DIR;
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
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

async function findAgentsMeshProjectRoot(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    if (await pathExists(join(current, "agentsmesh.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function resolveProjectDir(options: AgentsMeshRuleOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findAgentsMeshProjectRoot(process.cwd())) ?? (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultRulePath(options: AgentsMeshRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".agentsmesh", "rules", "tokenjuice.md");
}

async function getAgentsMeshProjectState(projectDir: string): Promise<{
  checkedPaths: string[];
  missingPaths: string[];
}> {
  const checkedPaths = AGENTSMESH_REQUIRED_PROJECT_FILES.map((file) => join(projectDir, file));
  const exists = await Promise.all(checkedPaths.map((path) => pathExists(path)));
  return {
    checkedPaths,
    missingPaths: checkedPaths.filter((_, index) => !exists[index]),
  };
}

function stripYamlComment(line: string): string {
  return line.split("#", 1)[0] ?? "";
}

function getIndent(line: string): number {
  return line.match(/^ */)?.[0].length ?? 0;
}

function normalizeYamlListValue(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function parseInlineYamlList(value: string): string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return undefined;
  }
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => normalizeYamlListValue(item))
    .filter(Boolean);
}

function parseYamlList(lines: string[], startIndex: number, parentIndent: number): {
  items: string[];
  nextIndex: number;
} {
  const items: string[] = [];
  let index = startIndex;
  for (; index < lines.length; index += 1) {
    const line = stripYamlComment(lines[index] ?? "");
    if (line.trim() === "") {
      continue;
    }
    if (getIndent(line) <= parentIndent) {
      break;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      items.push(normalizeYamlListValue(trimmed.slice(2)));
    }
  }
  return { items, nextIndex: index };
}

function parseYamlFeatureValue(lines: string[], index: number, value: string, parentIndent: number): {
  features?: string[];
  nextIndex: number;
} {
  const inlineList = parseInlineYamlList(value);
  if (inlineList) {
    return { features: inlineList, nextIndex: index + 1 };
  }

  const trimmed = value.trim();
  if (trimmed) {
    return { features: [normalizeYamlListValue(trimmed)], nextIndex: index + 1 };
  }

  const parsed = parseYamlList(lines, index + 1, parentIndent);
  return { features: parsed.items, nextIndex: parsed.nextIndex };
}

function parseAgentsMeshConfig(text: string): {
  rulesEnabled: boolean;
  overrideTargetsWithoutRules: string[];
} {
  const lines = text.split(/\r?\n/);
  let topLevelFeatures: string[] | undefined;
  const overrideTargetsWithoutRules: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripYamlComment(lines[index] ?? "");
    if (line.trim() === "" || getIndent(line) !== 0) {
      continue;
    }

    const featuresMatch = line.match(/^features:\s*(.*)$/);
    if (featuresMatch) {
      const parsed = parseYamlFeatureValue(lines, index, featuresMatch[1] ?? "", 0);
      topLevelFeatures = parsed.features;
      index = parsed.nextIndex - 1;
      continue;
    }

    if (!line.match(/^overrides:\s*$/)) {
      continue;
    }

    for (let overrideIndex = index + 1; overrideIndex < lines.length; overrideIndex += 1) {
      const overrideLine = stripYamlComment(lines[overrideIndex] ?? "");
      if (overrideLine.trim() === "") {
        continue;
      }
      const overrideIndent = getIndent(overrideLine);
      if (overrideIndent === 0) {
        break;
      }
      if (overrideIndent !== 2) {
        continue;
      }

      const targetMatch = overrideLine.trim().match(/^([^:\s]+):\s*$/);
      if (!targetMatch) {
        continue;
      }

      const target = targetMatch[1] ?? "";
      for (let targetIndex = overrideIndex + 1; targetIndex < lines.length; targetIndex += 1) {
        const targetLine = stripYamlComment(lines[targetIndex] ?? "");
        if (targetLine.trim() === "") {
          continue;
        }
        const targetIndent = getIndent(targetLine);
        if (targetIndent <= overrideIndent) {
          break;
        }
        const targetFeaturesMatch = targetLine.trim().match(/^features:\s*(.*)$/);
        if (!targetFeaturesMatch) {
          continue;
        }

        const parsed = parseYamlFeatureValue(lines, targetIndex, targetFeaturesMatch[1] ?? "", targetIndent);
        if (!parsed.features?.includes("rules")) {
          overrideTargetsWithoutRules.push(target);
        }
        break;
      }
    }
  }

  return {
    rulesEnabled: topLevelFeatures ? topLevelFeatures.includes("rules") : true,
    overrideTargetsWithoutRules,
  };
}

async function getAgentsMeshConfigState(projectDir: string): Promise<{
  rulesEnabled: boolean;
  overrideTargetsWithoutRules: string[];
}> {
  const configPath = join(projectDir, "agentsmesh.yaml");
  return parseAgentsMeshConfig(await readFile(configPath, "utf8"));
}

async function assertInitializedAgentsMeshProject(projectDir: string): Promise<void> {
  const projectState = await getAgentsMeshProjectState(projectDir);
  if (projectState.missingPaths.length === 0) {
    const configState = await getAgentsMeshConfigState(projectDir);
    if (configState.rulesEnabled) {
      return;
    }

    throw new Error(
      `cannot install AgentsMesh rule because ${join(projectDir, "agentsmesh.yaml")} disables the rules feature; add rules to features, then rerun tokenjuice install agentsmesh`,
    );
  }

  throw new Error(
    `cannot install AgentsMesh rule because ${projectDir} is not initialized for AgentsMesh; run agentsmesh init first, then rerun tokenjuice install agentsmesh`,
  );
}

function withProjectState(
  fields: AgentsMeshDoctorReportFields,
  projectState?: { checkedPaths: string[]; missingPaths: string[] },
): AgentsMeshDoctorReportFields {
  if (!projectState) {
    return fields;
  }

  return {
    ...fields,
    checkedPaths: projectState.checkedPaths,
    missingPaths: projectState.missingPaths,
  };
}

const TOKENJUICE_AGENTSMESH_RULE = [
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When AgentsMesh generates native tool configs from this rule, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for terminal commands likely to produce long output.`,
  }),
  "- After editing this source rule, run `agentsmesh generate` so generated tool configs receive the updated guidance.",
  "",
].join("\n");

export async function installAgentsMeshRule(
  rulePath?: string,
  options: AgentsMeshRuleOptions = {},
): Promise<InstallAgentsMeshRuleResult> {
  let resolvedRulePath = rulePath;
  if (!resolvedRulePath) {
    const projectDir = await resolveProjectDir(options);
    await assertInitializedAgentsMeshProject(projectDir);
    resolvedRulePath = join(projectDir, ".agentsmesh", "rules", "tokenjuice.md");
  }
  const existing = await readInstructionFile(resolvedRulePath);
  if (existing.exists && existing.text === TOKENJUICE_AGENTSMESH_RULE) {
    return { rulePath: resolvedRulePath, syncCommand: "agentsmesh generate" };
  }

  const result = await writeInstructionFile(resolvedRulePath, TOKENJUICE_AGENTSMESH_RULE);
  return {
    rulePath: result.filePath,
    syncCommand: "agentsmesh generate",
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAgentsMeshRule(
  rulePath?: string,
  options: AgentsMeshRuleOptions = {},
): Promise<UninstallAgentsMeshRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  if (
    existing.exists
    && (
      !existing.text.includes(TOKENJUICE_AGENTSMESH_RULE_MARKER)
      || !existing.text.includes(TOKENJUICE_WRAP_COMMAND)
      || !existing.text.includes(TOKENJUICE_RAW_COMMAND)
      || !existing.text.includes("agentsmesh generate")
    )
  ) {
    throw new Error(
      `refusing to remove ${resolvedRulePath}; it does not look like the tokenjuice AgentsMesh rule. Review and remove it manually, or reinstall tokenjuice agentsmesh first.`,
    );
  }
  const result = await removeInstructionFile(resolvedRulePath);
  return { rulePath: result.filePath, removed: result.removed, syncCommand: "agentsmesh generate" };
}

export async function doctorAgentsMeshRule(
  rulePath?: string,
  options: AgentsMeshRuleOptions = {},
): Promise<AgentsMeshDoctorReport> {
  const projectDir = rulePath ? undefined : await resolveProjectDir(options);
  const projectState = projectDir ? await getAgentsMeshProjectState(projectDir) : undefined;
  const configState = projectDir && projectState?.missingPaths.length === 0 ? await getAgentsMeshConfigState(projectDir) : undefined;
  const resolvedRulePath =
    rulePath ?? join(projectDir ?? (await resolveProjectDir(options)), ".agentsmesh", "rules", "tokenjuice.md");
  const isProjectInitialized = !projectState || projectState.missingPaths.length === 0;
  const rulesEnabled = configState?.rulesEnabled !== false;
  const fixCommand = !isProjectInitialized
    ? TOKENJUICE_AGENTSMESH_INIT_FIX_COMMAND
    : rulesEnabled
      ? TOKENJUICE_AGENTSMESH_FIX_COMMAND
      : TOKENJUICE_AGENTSMESH_RULES_FIX_COMMAND;
  const configIssues = [
    ...(configState && !configState.rulesEnabled ? [TOKENJUICE_AGENTSMESH_RULES_DISABLED_ISSUE] : []),
    ...(configState?.overrideTargetsWithoutRules.map(
      (target) => `AgentsMesh target override disables rules for ${target}; generated config for that target will not receive tokenjuice guidance`,
    ) ?? []),
  ];
  const existing = await readInstructionFile(resolvedRulePath);
  if (!existing.exists) {
    const status = configState?.rulesEnabled === false ? "broken" : "disabled";
    return {
      rulePath: resolvedRulePath,
      hasTokenjuiceMarker: false,
      ...withProjectState(
        buildInstructionDoctorReportFields({
          status,
          issues: [
            "tokenjuice AgentsMesh rule is not installed",
            ...(isProjectInitialized ? [] : [TOKENJUICE_AGENTSMESH_UNINITIALIZED_ISSUE]),
            ...configIssues,
          ],
          advisory: TOKENJUICE_AGENTSMESH_ADVISORY,
          fixCommand,
        }),
        projectState,
      ),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_AGENTSMESH_RULE_MARKER,
        missingIssue: "configured AgentsMesh rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured AgentsMesh rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured AgentsMesh rule file is missing the raw escape hatch",
      },
      {
        requiredText: "agentsmesh generate",
        missingIssue: "configured AgentsMesh rule file is missing generate guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured AgentsMesh rule file still suggests the full escape hatch",
      },
    ],
  });

  const allIssues = [...issues, ...(isProjectInitialized ? [] : [TOKENJUICE_AGENTSMESH_UNINITIALIZED_ISSUE]), ...configIssues];
  const status =
    issues.length > 0 || !isProjectInitialized || configState?.rulesEnabled === false
      ? "broken"
      : configIssues.length > 0
        ? "warn"
        : "ok";

  return {
    rulePath: resolvedRulePath,
    hasTokenjuiceMarker: existing.text.includes(TOKENJUICE_AGENTSMESH_RULE_MARKER),
    ...withProjectState(
      {
        status,
        issues: allIssues,
        advisories: [TOKENJUICE_AGENTSMESH_ADVISORY],
        fixCommand,
        checkedPaths: [],
        missingPaths: [],
      },
      projectState,
    ),
  };
}
