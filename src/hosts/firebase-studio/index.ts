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

export type FirebaseStudioDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_FIREBASE_STUDIO_FIX_COMMAND = "tokenjuice install firebase-studio";
const TOKENJUICE_FIREBASE_STUDIO_BEGIN = "<!-- tokenjuice:firebase-studio begin -->";
const TOKENJUICE_FIREBASE_STUDIO_END = "<!-- tokenjuice:firebase-studio end -->";
const TOKENJUICE_FIREBASE_STUDIO_ADVISORY = "Firebase Studio support is beta and instruction-based; Gemini in Firebase chat prioritizes .idx/airules.md, but still owns command execution.";

function getExplicitProjectDir(options: FirebaseStudioRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.FIREBASE_STUDIO_PROJECT_DIR;
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

async function resolveProjectDir(options: FirebaseStudioRuleOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

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

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_FIREBASE_STUDIO_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(
    TOKENJUICE_FIREBASE_STUDIO_END,
    beginIndex + TOKENJUICE_FIREBASE_STUDIO_BEGIN.length,
  );
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_FIREBASE_STUDIO_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_FIREBASE_STUDIO_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_FIREBASE_STUDIO_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installFirebaseStudioRule(
  rulePath?: string,
  options: FirebaseStudioRuleOptions = {},
): Promise<InstallFirebaseStudioRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_FIREBASE_STUDIO_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
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
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
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
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_FIREBASE_STUDIO_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Firebase Studio rules are not installed"],
        advisory: TOKENJUICE_FIREBASE_STUDIO_ADVISORY,
        fixCommand: TOKENJUICE_FIREBASE_STUDIO_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Firebase Studio rules",
    repairCommand: TOKENJUICE_FIREBASE_STUDIO_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Firebase Studio rules have malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Firebase Studio rules are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Firebase Studio rules are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Firebase Studio rules still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_FIREBASE_STUDIO_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from .idx/airules.md, then run tokenjuice install firebase-studio"
        : TOKENJUICE_FIREBASE_STUDIO_FIX_COMMAND,
    }),
  };
}
