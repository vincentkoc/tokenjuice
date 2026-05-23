import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

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

export type GreptileDoctorReport = {
  rulePath: string;
  hasTokenjuiceMarker: boolean;
  hasUnsafePathIssue: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_GREPTILE_FIX_COMMAND = "tokenjuice install greptile";
const TOKENJUICE_GREPTILE_BEGIN = "<!-- tokenjuice:greptile begin -->";
const TOKENJUICE_GREPTILE_END = "<!-- tokenjuice:greptile end -->";
const TOKENJUICE_GREPTILE_ADVISORY =
  "Greptile support is beta and rules-based; Greptile still owns PR review, runtime inspection, and comment delivery.";

function getExplicitProjectDir(options: GreptileRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.GREPTILE_PROJECT_DIR;
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

async function resolveProjectDir(options: GreptileRuleOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

function isInsideOrEqual(parentDir: string, childPath: string): boolean {
  const relativePath = relative(parentDir, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function getExpectedRulePath(projectDir: string): string {
  return join(projectDir, ".greptile", "rules.md");
}

async function realpathExistingAncestor(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
}

async function rejectRuleSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use Greptile rule ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectRuleSymlink(`${filePath}.bak`);
  await rejectRuleSymlink(`${filePath}.tmp`);
}

async function rejectSymlinkPathComponents(filePath: string, projectDir: string): Promise<void> {
  const relativePath = relative(projectDir, filePath);
  const segments = relativePath.split(sep).filter(Boolean);
  let currentPath = projectDir;
  for (const segment of segments.slice(0, -1)) {
    currentPath = join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`cannot use Greptile rule ${filePath}; tokenjuice will not read or write through instruction symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function resolveSafeProjectRulePath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  if (projectDir !== realProjectDir) {
    throw new Error(`cannot use Greptile rule ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use Greptile rule ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectRuleSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectRuleSymlink(resolvedPath);
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

async function pathExistsWithoutReading(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
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

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_GREPTILE_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_GREPTILE_END, beginIndex + TOKENJUICE_GREPTILE_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_GREPTILE_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_GREPTILE_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_GREPTILE_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installGreptileRule(
  rulePath?: string,
  options: GreptileRuleOptions = {},
): Promise<InstallGreptileRuleResult> {
  const resolvedRulePath = await resolveRulePath(rulePath, options);
  await rejectInstallSidecarSymlinks(resolvedRulePath);
  const existing = await readInstructionFile(resolvedRulePath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GREPTILE_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
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
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
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
    if (!rulePath && !(await pathExistsWithoutReading(aliasPath))) {
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
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Greptile rule has malformed tokenjuice markers"] : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Greptile rule is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Greptile rule is missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Greptile rule still suggests the full escape hatch",
        },
      ],
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
