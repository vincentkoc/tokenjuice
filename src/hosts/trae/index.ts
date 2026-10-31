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

export type TraeRuleOptions = {
  projectDir?: string;
};

export type InstallTraeRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallTraeRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type TraeDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_TRAE_FIX_COMMAND = "tokenjuice install trae";
const TOKENJUICE_TRAE_BEGIN = "<!-- tokenjuice:trae begin -->";
const TOKENJUICE_TRAE_END = "<!-- tokenjuice:trae end -->";
const TOKENJUICE_TRAE_ADVISORY = "Trae support is beta and rule-based; Trae loads project .rules Markdown but still owns command execution.";

const resolveProjectDir = createProjectDirResolver("TRAE_PROJECT_DIR");

async function getDefaultRulePath(options: TraeRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".trae", "rules", "project_rules.md");
}

const TOKENJUICE_TRAE_BLOCK = [
  TOKENJUICE_TRAE_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Trae, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_TRAE_END,
].join("\n");

const TOKENJUICE_TRAE_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_TRAE_BEGIN,
  endMarker: TOKENJUICE_TRAE_END,
  block: TOKENJUICE_TRAE_BLOCK,
};

export async function installTraeRule(
  rulePath?: string,
  options: TraeRuleOptions = {},
): Promise<InstallTraeRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_TRAE_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_TRAE_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedRulePath}; remove the dangling marker manually, then rerun tokenjuice install trae`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedRulePath, TOKENJUICE_TRAE_BLOCK_CONFIG);
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallTraeRule(
  rulePath?: string,
  options: TraeRuleOptions = {},
): Promise<UninstallTraeRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_TRAE_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_TRAE_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedRulePath}; remove the dangling marker manually, then rerun tokenjuice uninstall trae`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedRulePath, TOKENJUICE_TRAE_BLOCK_CONFIG);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorTraeRule(
  rulePath?: string,
  options: TraeRuleOptions = {},
): Promise<TraeDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const { instructionsPath, ...report } = await doctorMarkerInstructions(resolvedRulePath, TOKENJUICE_TRAE_BLOCK_CONFIG, {
    configuredLabel: "Trae rule",
    advisory: TOKENJUICE_TRAE_ADVISORY,
    fixCommand: TOKENJUICE_TRAE_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from .trae/rules/project_rules.md, then run tokenjuice install trae",
    singular: true,
  });
  return { rulePath: instructionsPath, ...report };
}
