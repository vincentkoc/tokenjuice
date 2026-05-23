import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  removeMarkerDelimitedBlock,
  upsertMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type DotAgentsRuleOptions = {
  configDir?: string;
};

export type InstallDotAgentsRuleResult = {
  rulePath: string;
  backupPath?: string;
  syncCommand: string;
};

export type UninstallDotAgentsRuleResult = {
  rulePath: string;
  removed: boolean;
  syncCommand: string;
};

export type DotAgentsDoctorReport = {
  rulePath: string;
  syncCommand: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_DOT_AGENTS_FIX_COMMAND = "tokenjuice install dot-agents";
const TOKENJUICE_DOT_AGENTS_SYNC_COMMAND = "dot-agents sync";
const TOKENJUICE_DOT_AGENTS_BEGIN = "<!-- tokenjuice:dot-agents begin -->";
const TOKENJUICE_DOT_AGENTS_END = "<!-- tokenjuice:dot-agents end -->";
const TOKENJUICE_DOT_AGENTS_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_DOT_AGENTS_FRONTMATTER = ["---", "alwaysApply: true", "---"].join("\n");
const DOT_AGENTS_FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---(?:\n|$)/u;
const TOKENJUICE_DOT_AGENTS_ADVISORY =
  "dot-agents support is beta and rule-based; run `dot-agents sync` after install or uninstall so dot-agents propagates global rules to managed agent configs.";

function getDotAgentsConfigDir(options: DotAgentsRuleOptions = {}): string {
  return resolve(options.configDir || process.env.DOT_AGENTS_HOME || join(homedir(), ".agents"));
}

function getDefaultRulePath(options: DotAgentsRuleOptions = {}): string {
  return join(getDotAgentsConfigDir(options), "rules", "global", "rules.mdc");
}

const TOKENJUICE_DOT_AGENTS_BLOCK = [
  TOKENJUICE_DOT_AGENTS_BEGIN,
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When dot-agents propagates this global rule into managed coding-agent configs, prefer `tokenjuice wrap -- <command>` for terminal commands likely to produce long output.",
  }),
  "- After editing this global rule, run `dot-agents sync` so managed agent configs receive the updated guidance.",
  TOKENJUICE_DOT_AGENTS_END,
  "",
].join("\n");

const TOKENJUICE_DOT_AGENTS_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_DOT_AGENTS_BEGIN,
  endMarker: TOKENJUICE_DOT_AGENTS_END,
  block: TOKENJUICE_DOT_AGENTS_BLOCK,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_DOT_AGENTS_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_DOT_AGENTS_END, beginIndex + TOKENJUICE_DOT_AGENTS_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_DOT_AGENTS_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_DOT_AGENTS_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_DOT_AGENTS_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

function ensureDotAgentsFrontmatter(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return `${TOKENJUICE_DOT_AGENTS_FRONTMATTER}\n\n`;
  }
  if (text.match(DOT_AGENTS_FRONTMATTER_PATTERN)) {
    return text;
  }
  return text;
}

export async function installDotAgentsRule(
  rulePath?: string,
  options: DotAgentsRuleOptions = {},
): Promise<InstallDotAgentsRuleResult> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_DOT_AGENTS_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedRulePath}; remove the dangling marker manually, then rerun tokenjuice install dot-agents`,
    );
  }

  const nextText = upsertMarkerDelimitedBlock(ensureDotAgentsFrontmatter(existing.text), TOKENJUICE_DOT_AGENTS_BLOCK_CONFIG);
  if (existing.exists && existing.text === nextText) {
    return {
      rulePath: resolvedRulePath,
      syncCommand: TOKENJUICE_DOT_AGENTS_SYNC_COMMAND,
    };
  }

  const result = await writeInstructionFile(resolvedRulePath, nextText);
  return {
    rulePath: result.filePath,
    syncCommand: TOKENJUICE_DOT_AGENTS_SYNC_COMMAND,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallDotAgentsRule(
  rulePath?: string,
  options: DotAgentsRuleOptions = {},
): Promise<UninstallDotAgentsRuleResult> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_DOT_AGENTS_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedRulePath}; remove the dangling marker manually, then rerun tokenjuice uninstall dot-agents`,
    );
  }

  const removed = removeMarkerDelimitedBlock(existing.text, TOKENJUICE_DOT_AGENTS_BLOCK_CONFIG);
  if (!removed.removed) {
    return { rulePath: resolvedRulePath, removed: false, syncCommand: TOKENJUICE_DOT_AGENTS_SYNC_COMMAND };
  }
  if (removed.text.trim()) {
    await writeInstructionFile(resolvedRulePath, `${removed.text.trim()}\n`);
  } else {
    await rm(resolvedRulePath, { force: true });
  }
  return { rulePath: resolvedRulePath, removed: true, syncCommand: TOKENJUICE_DOT_AGENTS_SYNC_COMMAND };
}

export async function doctorDotAgentsRule(
  rulePath?: string,
  options: DotAgentsRuleOptions = {},
): Promise<DotAgentsDoctorReport> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_DOT_AGENTS_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      rulePath: resolvedRulePath,
      syncCommand: TOKENJUICE_DOT_AGENTS_SYNC_COMMAND,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice dot-agents rule is not installed"],
        advisory: TOKENJUICE_DOT_AGENTS_ADVISORY,
        fixCommand: TOKENJUICE_DOT_AGENTS_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "dot-agents global rules",
    repairCommand: TOKENJUICE_DOT_AGENTS_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const malformedMarkerIssues =
    hasMalformedMarkers && markerIssues.length === 0
      ? [
          "configured dot-agents global rules have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install dot-agents",
        ]
      : [];
  const guidanceIssues = collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
    required: [
      {
        requiredText: TOKENJUICE_DOT_AGENTS_RULE_MARKER,
        missingIssue: "configured dot-agents rule file does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured dot-agents rule file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured dot-agents rule file is missing the raw escape hatch",
      },
      {
        requiredText: "dot-agents sync",
        missingIssue: "configured dot-agents rule file is missing sync guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured dot-agents rule file still suggests the full escape hatch",
      },
    ],
  });

  return {
    rulePath: resolvedRulePath,
    syncCommand: TOKENJUICE_DOT_AGENTS_SYNC_COMMAND,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues([...markerIssues, ...malformedMarkerIssues, ...guidanceIssues]),
      issues: [...markerIssues, ...malformedMarkerIssues, ...guidanceIssues],
      advisory: TOKENJUICE_DOT_AGENTS_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from dot-agents global rules, then run tokenjuice install dot-agents"
        : TOKENJUICE_DOT_AGENTS_FIX_COMMAND,
    }),
  };
}
