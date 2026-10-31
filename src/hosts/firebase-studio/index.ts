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

export type FirebaseStudioRuleOptions = {
  projectDir?: string;
};

export type InstallFirebaseStudioRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallFirebaseStudioRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type FirebaseStudioDoctorReport = PathDoctorReport<"rulePath">;

const TOKENJUICE_FIREBASE_STUDIO_FIX_COMMAND = "tokenjuice install firebase-studio";
const TOKENJUICE_FIREBASE_STUDIO_BEGIN = "<!-- tokenjuice:firebase-studio begin -->";
const TOKENJUICE_FIREBASE_STUDIO_END = "<!-- tokenjuice:firebase-studio end -->";
const TOKENJUICE_FIREBASE_STUDIO_ADVISORY = "Firebase Studio support is beta and instruction-based; Gemini in Firebase chat prioritizes .idx/airules.md, but still owns command execution.";

const resolveProjectDir = createProjectDirResolver("FIREBASE_STUDIO_PROJECT_DIR");

async function getDefaultRulePath(options: FirebaseStudioRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".idx", "airules.md");
}

const TOKENJUICE_FIREBASE_STUDIO_BLOCK = [
  TOKENJUICE_FIREBASE_STUDIO_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Gemini in Firebase, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_FIREBASE_STUDIO_END,
].join("\n");

const TOKENJUICE_FIREBASE_STUDIO_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_FIREBASE_STUDIO_BEGIN,
  endMarker: TOKENJUICE_FIREBASE_STUDIO_END,
  block: TOKENJUICE_FIREBASE_STUDIO_BLOCK,
};

export async function installFirebaseStudioRule(
  rulePath?: string,
  options: FirebaseStudioRuleOptions = {},
): Promise<InstallFirebaseStudioRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_FIREBASE_STUDIO_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_FIREBASE_STUDIO_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedRulePath}; remove the dangling marker manually, then rerun tokenjuice install firebase-studio`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedRulePath, TOKENJUICE_FIREBASE_STUDIO_BLOCK_CONFIG);
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallFirebaseStudioRule(
  rulePath?: string,
  options: FirebaseStudioRuleOptions = {},
): Promise<UninstallFirebaseStudioRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_FIREBASE_STUDIO_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_FIREBASE_STUDIO_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedRulePath}; remove the dangling marker manually, then rerun tokenjuice uninstall firebase-studio`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedRulePath, TOKENJUICE_FIREBASE_STUDIO_BLOCK_CONFIG);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorFirebaseStudioRule(
  rulePath?: string,
  options: FirebaseStudioRuleOptions = {},
): Promise<FirebaseStudioDoctorReport> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const { instructionsPath, ...report } = await doctorMarkerInstructions(resolvedRulePath, TOKENJUICE_FIREBASE_STUDIO_BLOCK_CONFIG, {
    configuredLabel: "Firebase Studio rules",
    advisory: TOKENJUICE_FIREBASE_STUDIO_ADVISORY,
    fixCommand: TOKENJUICE_FIREBASE_STUDIO_FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from .idx/airules.md, then run tokenjuice install firebase-studio",
  });
  return { rulePath: instructionsPath, ...report };
}
