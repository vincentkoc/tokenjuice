import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { collectGuidanceIssues, readInstructionFile } from "../shared/instruction-file.js";

export type GitLabDuoRuleOptions = {
  projectDir?: string;
};

export type InstallGitLabDuoRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallGitLabDuoRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type GitLabDuoDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_GITLAB_DUO_FIX_COMMAND = "tokenjuice install gitlab-duo";
const TOKENJUICE_GITLAB_DUO_BEGIN = "<!-- tokenjuice:gitlab-duo begin -->";
const TOKENJUICE_GITLAB_DUO_END = "<!-- tokenjuice:gitlab-duo end -->";
const TOKENJUICE_GITLAB_DUO_ADVISORY =
  "GitLab Duo support is beta and custom-rules based; Duo still owns command execution.";

function getExplicitProjectDir(options: GitLabDuoRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.GITLAB_DUO_PROJECT_DIR;
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

async function resolveProjectDir(options: GitLabDuoRuleOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultRulePath(options: GitLabDuoRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".gitlab", "duo", "chat-rules.md");
}

const TOKENJUICE_GITLAB_DUO_BLOCK = [
  TOKENJUICE_GITLAB_DUO_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through GitLab Duo Agent Platform, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_GITLAB_DUO_END,
].join("\n");

const TOKENJUICE_GITLAB_DUO_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_GITLAB_DUO_BEGIN,
  endMarker: TOKENJUICE_GITLAB_DUO_END,
  block: TOKENJUICE_GITLAB_DUO_BLOCK,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_GITLAB_DUO_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_GITLAB_DUO_END, beginIndex + TOKENJUICE_GITLAB_DUO_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_GITLAB_DUO_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_GITLAB_DUO_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_GITLAB_DUO_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installGitLabDuoRule(
  rulePath?: string,
  options: GitLabDuoRuleOptions = {},
): Promise<InstallGitLabDuoRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GITLAB_DUO_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedRulePath}; remove the dangling marker manually, then rerun tokenjuice install gitlab-duo`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedRulePath, TOKENJUICE_GITLAB_DUO_BLOCK_CONFIG);
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallGitLabDuoRule(
  rulePath?: string,
  options: GitLabDuoRuleOptions = {},
): Promise<UninstallGitLabDuoRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GITLAB_DUO_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedRulePath}; remove the dangling marker manually, then rerun tokenjuice uninstall gitlab-duo`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedRulePath, TOKENJUICE_GITLAB_DUO_BLOCK_CONFIG);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorGitLabDuoRule(
  rulePath?: string,
  options: GitLabDuoRuleOptions = {},
): Promise<GitLabDuoDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GITLAB_DUO_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice GitLab Duo rule is not installed"],
        advisory: TOKENJUICE_GITLAB_DUO_ADVISORY,
        fixCommand: TOKENJUICE_GITLAB_DUO_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "GitLab Duo rule",
    repairCommand: TOKENJUICE_GITLAB_DUO_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured GitLab Duo rule has malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured GitLab Duo rule is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured GitLab Duo rule is missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured GitLab Duo rule still suggests the full escape hatch",
        },
      ],
    }),
  ];

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_GITLAB_DUO_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from .gitlab/duo/chat-rules.md, then run tokenjuice install gitlab-duo"
        : TOKENJUICE_GITLAB_DUO_FIX_COMMAND,
    }),
  };
}
