import { join } from "node:path";

import { createProjectDirResolver } from "../shared/project-root.js";

import {
  hasMalformedMarkerDelimitedBlock,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import {
  buildTokenjuiceGuidanceBullets,
} from "../shared/instruction-guidance.js";
import type { PathDoctorReport } from "../shared/instruction-doctor.js";
import { readInstructionFile } from "../shared/instruction-file.js";

import { doctorMarkerInstructions } from "../shared/marker-instruction-doctor.js";

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

export type GitLabDuoDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_GITLAB_DUO_FIX_COMMAND = "tokenjuice install gitlab-duo";
const TOKENJUICE_GITLAB_DUO_BEGIN = "<!-- tokenjuice:gitlab-duo begin -->";
const TOKENJUICE_GITLAB_DUO_END = "<!-- tokenjuice:gitlab-duo end -->";
const TOKENJUICE_GITLAB_DUO_ADVISORY =
  "GitLab Duo support is beta and custom-rules based; Duo still owns command execution.";

const resolveProjectDir = createProjectDirResolver("GITLAB_DUO_PROJECT_DIR");

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

export async function installGitLabDuoRule(
  rulePath?: string,
  options: GitLabDuoRuleOptions = {},
): Promise<InstallGitLabDuoRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GITLAB_DUO_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_GITLAB_DUO_BLOCK_CONFIG)) {
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
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_GITLAB_DUO_BLOCK_CONFIG)) {
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
  const { instructionsPath, ...report } = await doctorMarkerInstructions(resolvedRulePath, TOKENJUICE_GITLAB_DUO_BLOCK_CONFIG, {
    configuredLabel: "GitLab Duo rule",
    advisory: TOKENJUICE_GITLAB_DUO_ADVISORY,
    fixCommand: TOKENJUICE_GITLAB_DUO_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from .gitlab/duo/chat-rules.md, then run tokenjuice install gitlab-duo",
    singular: true,
  });
  return { rulePath: instructionsPath, ...report };
}
