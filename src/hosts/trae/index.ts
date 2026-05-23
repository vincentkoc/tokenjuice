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

export type TraeDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_TRAE_FIX_COMMAND = "tokenjuice install trae";
const TOKENJUICE_TRAE_BEGIN = "<!-- tokenjuice:trae begin -->";
const TOKENJUICE_TRAE_END = "<!-- tokenjuice:trae end -->";
const TOKENJUICE_TRAE_ADVISORY = "Trae support is beta and rule-based; Trae loads project .rules Markdown but still owns command execution.";

function getExplicitProjectDir(options: TraeRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.TRAE_PROJECT_DIR;
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

async function resolveProjectDir(options: TraeRuleOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

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

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_TRAE_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_TRAE_END, beginIndex + TOKENJUICE_TRAE_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_TRAE_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_TRAE_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_TRAE_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installTraeRule(
  rulePath?: string,
  options: TraeRuleOptions = {},
): Promise<InstallTraeRuleResult> {
  const resolvedRulePath = rulePath ?? (await getDefaultRulePath(options));
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_TRAE_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
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
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
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
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_TRAE_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      rulePath: resolvedRulePath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Trae rule is not installed"],
        advisory: TOKENJUICE_TRAE_ADVISORY,
        fixCommand: TOKENJUICE_TRAE_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Trae rule",
    repairCommand: TOKENJUICE_TRAE_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Trae rule has malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Trae rule is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Trae rule is missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Trae rule still suggests the full escape hatch",
        },
      ],
    }),
  ];

  return {
    rulePath: resolvedRulePath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_TRAE_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from .trae/rules/project_rules.md, then run tokenjuice install trae"
        : TOKENJUICE_TRAE_FIX_COMMAND,
    }),
  };
}
