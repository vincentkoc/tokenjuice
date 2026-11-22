import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { createProjectInstructionPathResolver, createSymlinkGuard } from "../shared/path-ancestors.js";

import { createProjectDirResolver } from "../shared/project-root.js";

import {
  getMarkerDelimitedBlockText,
  hasMalformedMarkerDelimitedBlock,
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import { collectTokenjuiceGuidanceIssues, buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import {
  type PathDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { pathEntryExists, readInstructionFile } from "../shared/instruction-file.js";

export type GreptileRuleOptions = {
  projectDir?: string;
};

export type InstallGreptileRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallGreptileRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type GreptileDoctorReport = PathDoctorReport<"rulePath"> & {
  hasTokenjuiceMarker: boolean;
  hasUnsafePathIssue: boolean;
};

const TOKENJUICE_GREPTILE_FIX_COMMAND = "tokenjuice install greptile";
const TOKENJUICE_GREPTILE_BEGIN = "<!-- tokenjuice:greptile begin -->";
const TOKENJUICE_GREPTILE_END = "<!-- tokenjuice:greptile end -->";
const TOKENJUICE_GREPTILE_ADVISORY =
  "Greptile support is beta and rules-based; Greptile still owns PR review, runtime inspection, and comment delivery.";

const resolveProjectDir = createProjectDirResolver("GREPTILE_PROJECT_DIR");

function getExpectedRulePath(projectDir: string): string {
  return join(projectDir, ".greptile", "rules.md");
}

const rejectRuleSymlink = createSymlinkGuard(
  (filePath) => `cannot use Greptile rule ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectRuleSymlink(`${filePath}.bak`);
  await rejectRuleSymlink(`${filePath}.tmp`);
}

const resolveProjectRulePath = createProjectInstructionPathResolver(
  "Greptile rule",
  rejectRuleSymlink,
);

async function resolveSafeProjectRulePath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = await resolveProjectRulePath(filePath, projectDir, realProjectDir);
  const expectedRulePath = getExpectedRulePath(projectDir);
  if (resolvedPath !== expectedRulePath) {
    throw new Error(`cannot use Greptile rule ${resolvedPath}; tokenjuice only installs the project-local .greptile/rules.md rule`);
  }
  return resolvedPath;
}

async function getDefaultRulePath(options: GreptileRuleOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectRulePath(getExpectedRulePath(projectDir), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: GreptileRuleOptions = {}): Promise<string> {
  return getExpectedRulePath(await resolveProjectDir(options));
}

async function resolveRulePath(rulePath?: string, options: GreptileRuleOptions = {}): Promise<string> {
  if (rulePath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectRulePath(rulePath, projectDir, realProjectDir);
  }
  return getDefaultRulePath(options);
}

const TOKENJUICE_GREPTILE_BLOCK = [
  TOKENJUICE_GREPTILE_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When Greptile review, runtime-inspection, or fix workflows run terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
  }),
  TOKENJUICE_GREPTILE_END,
].join("\n");

const TOKENJUICE_GREPTILE_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_GREPTILE_BEGIN,
  endMarker: TOKENJUICE_GREPTILE_END,
  block: TOKENJUICE_GREPTILE_BLOCK,
};

export async function installGreptileRule(
  rulePath?: string,
  options: GreptileRuleOptions = {},
): Promise<InstallGreptileRuleResult> {
  const resolvedRulePath = await resolveRulePath(rulePath, options);
  await rejectInstallSidecarSymlinks(resolvedRulePath);
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GREPTILE_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_GREPTILE_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedRulePath}; remove the dangling marker manually, then rerun tokenjuice install greptile`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedRulePath, TOKENJUICE_GREPTILE_BLOCK_CONFIG);
  return {
    rulePath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallGreptileRule(
  rulePath?: string,
  options: GreptileRuleOptions = {},
): Promise<UninstallGreptileRuleResult> {
  const resolvedRulePath = await resolveRulePath(rulePath, options);
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GREPTILE_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_GREPTILE_BLOCK_CONFIG)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedRulePath}; remove the dangling marker manually, then rerun tokenjuice uninstall greptile`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedRulePath, TOKENJUICE_GREPTILE_BLOCK_CONFIG);
  return { rulePath: result.filePath, removed: result.removed };
}

export async function doctorGreptileRule(
  rulePath?: string,
  options: GreptileRuleOptions = {},
): Promise<GreptileDoctorReport> {
  let resolvedRulePath: string;
  try {
    resolvedRulePath = await resolveRulePath(rulePath, options);
  } catch (error) {
    const aliasPath = rulePath ?? (await getDefaultAliasPath(options));
    if (!rulePath && !(await pathEntryExists(aliasPath))) {
      return {
        rulePath: aliasPath,
        hasTokenjuiceMarker: false,
        hasUnsafePathIssue: false,
        ...buildInstructionDoctorReportFields({
          status: "disabled",
          issues: ["tokenjuice Greptile rule is not installed"],
          advisory: TOKENJUICE_GREPTILE_ADVISORY,
          fixCommand: TOKENJUICE_GREPTILE_FIX_COMMAND,
        }),
      };
    }
    return {
      rulePath: aliasPath,
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: true,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_GREPTILE_ADVISORY,
        fixCommand: (error as Error).message.includes("outside") || (error as Error).message.includes("only installs")
          ? "use a project-local .greptile/rules.md path, then run tokenjuice install greptile"
          : "replace symlinked Greptile rule with a regular project file, then run tokenjuice install greptile",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GREPTILE_BLOCK_CONFIG);
  const hasTokenjuiceMarker = markerState.hasBegin || markerState.hasEnd;
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      rulePath: resolvedRulePath,
      hasTokenjuiceMarker,
      hasUnsafePathIssue: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Greptile rule is not installed"],
        advisory: TOKENJUICE_GREPTILE_ADVISORY,
        fixCommand: TOKENJUICE_GREPTILE_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Greptile rule",
    repairCommand: TOKENJUICE_GREPTILE_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_GREPTILE_BLOCK_CONFIG);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Greptile rule has malformed tokenjuice markers"] : []),
    ...collectTokenjuiceGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_GREPTILE_BLOCK_CONFIG), {
      configuredLabel: "Greptile rule",
      singular: true,
    }),
  ];

  return {
    rulePath: resolvedRulePath,
    hasTokenjuiceMarker,
    hasUnsafePathIssue: false,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_GREPTILE_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from .greptile/rules.md, then run tokenjuice install greptile"
        : TOKENJUICE_GREPTILE_FIX_COMMAND,
    }),
  };
}
