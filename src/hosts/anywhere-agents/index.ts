import { lstat, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  removeMarkerDelimitedBlock,
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

export type AnywhereAgentsInstructionsOptions = {
  projectDir?: string;
};

export type InstallAnywhereAgentsInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
  syncCommand: string;
};

export type UninstallAnywhereAgentsInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
  syncCommand: string;
};

export type AnywhereAgentsDoctorReport = {
  instructionsPath: string;
  syncCommand: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_ANYWHERE_AGENTS_FIX_COMMAND = "tokenjuice install anywhere-agents";
const TOKENJUICE_ANYWHERE_AGENTS_SYNC_COMMAND = "anywhere-agents";
const TOKENJUICE_ANYWHERE_AGENTS_BEGIN = "<!-- tokenjuice:anywhere-agents begin -->";
const TOKENJUICE_ANYWHERE_AGENTS_END = "<!-- tokenjuice:anywhere-agents end -->";
const TOKENJUICE_ANYWHERE_AGENTS_ADVISORY =
  "anywhere-agents support is beta and local-override based; anywhere-agents composes AGENTS.md plus AGENTS.local.md into downstream agent files, but each agent still owns command execution. Run `anywhere-agents` after install or uninstall.";

function getExplicitProjectDir(options: AnywhereAgentsInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.ANYWHERE_AGENTS_PROJECT_DIR;
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

async function resolveProjectDir(options: AnywhereAgentsInstructionsOptions = {}): Promise<string> {
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

type ResolvedInstructionsTarget = {
  filePath: string;
  followedSymlink: boolean;
};

async function resolveSafeProjectWritePath(filePath: string, projectDir: string): Promise<ResolvedInstructionsTarget> {
  const realParentDir = await realpathExistingAncestor(dirname(filePath));
  if (!isInsideOrEqual(projectDir, realParentDir)) {
    throw new Error(
      `cannot use anywhere-agents source ${filePath}; tokenjuice will not write through instruction directories outside ${projectDir}`,
    );
  }

  let stats;
  try {
    stats = await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { filePath, followedSymlink: false };
    }
    throw error;
  }

  if (!stats.isSymbolicLink()) {
    return { filePath, followedSymlink: false };
  }
  const targetPath = await realpath(filePath);
  if (!isInsideOrEqual(projectDir, targetPath)) {
    throw new Error(
      `cannot use anywhere-agents source ${filePath}; tokenjuice will not follow instruction symlinks outside ${projectDir}`,
    );
  }
  return { filePath: targetPath, followedSymlink: true };
}

async function getDefaultInstructionsTarget(options: AnywhereAgentsInstructionsOptions = {}): Promise<ResolvedInstructionsTarget> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectWritePath(join(projectDir, "AGENTS.local.md"), realProjectDir);
}

async function getDefaultInstructionsPath(options: AnywhereAgentsInstructionsOptions = {}): Promise<string> {
  return (await getDefaultInstructionsTarget(options)).filePath;
}

async function getDefaultAliasPath(options: AnywhereAgentsInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "AGENTS.local.md");
}

const TOKENJUICE_ANYWHERE_AGENTS_BLOCK = [
  TOKENJUICE_ANYWHERE_AGENTS_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When anywhere-agents layers this AGENTS.local.md after the generated AGENTS.md and deploys downstream agent files, prefer `tokenjuice wrap -- <command>` for terminal commands likely to produce long output.",
  }),
  "- After editing this local override file, run `anywhere-agents` so generated downstream agent files receive the updated guidance.",
  TOKENJUICE_ANYWHERE_AGENTS_END,
].join("\n");

const TOKENJUICE_ANYWHERE_AGENTS_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_ANYWHERE_AGENTS_BEGIN,
  endMarker: TOKENJUICE_ANYWHERE_AGENTS_END,
  block: TOKENJUICE_ANYWHERE_AGENTS_BLOCK,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_ANYWHERE_AGENTS_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_ANYWHERE_AGENTS_END, beginIndex + TOKENJUICE_ANYWHERE_AGENTS_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_ANYWHERE_AGENTS_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_ANYWHERE_AGENTS_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_ANYWHERE_AGENTS_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installAnywhereAgentsInstructions(
  instructionsPath?: string,
  options: AnywhereAgentsInstructionsOptions = {},
): Promise<InstallAnywhereAgentsInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_ANYWHERE_AGENTS_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install anywhere-agents`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_ANYWHERE_AGENTS_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    syncCommand: TOKENJUICE_ANYWHERE_AGENTS_SYNC_COMMAND,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAnywhereAgentsInstructions(
  instructionsPath?: string,
  options: AnywhereAgentsInstructionsOptions = {},
): Promise<UninstallAnywhereAgentsInstructionsResult> {
  const target = instructionsPath
    ? { filePath: instructionsPath, followedSymlink: false }
    : await getDefaultInstructionsTarget(options);
  const resolvedInstructionsPath = target.filePath;
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_ANYWHERE_AGENTS_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall anywhere-agents`,
    );
  }

  if (!target.followedSymlink) {
    const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_ANYWHERE_AGENTS_BLOCK_CONFIG);
    return { instructionsPath: result.filePath, removed: result.removed, syncCommand: TOKENJUICE_ANYWHERE_AGENTS_SYNC_COMMAND };
  }

  const removed = removeMarkerDelimitedBlock(existing.text, TOKENJUICE_ANYWHERE_AGENTS_BLOCK_CONFIG);
  if (!removed.removed) {
    return { instructionsPath: resolvedInstructionsPath, removed: false, syncCommand: TOKENJUICE_ANYWHERE_AGENTS_SYNC_COMMAND };
  }
  if (removed.text.trim()) {
    await writeFile(resolvedInstructionsPath, `${removed.text.trim()}\n`, "utf8");
  } else {
    await writeFile(resolvedInstructionsPath, "", "utf8");
  }
  return { instructionsPath: resolvedInstructionsPath, removed: true, syncCommand: TOKENJUICE_ANYWHERE_AGENTS_SYNC_COMMAND };
}

export async function doctorAnywhereAgentsInstructions(
  instructionsPath?: string,
  options: AnywhereAgentsInstructionsOptions = {},
): Promise<AnywhereAgentsDoctorReport> {
  let resolvedInstructionsPath: string;
  try {
    resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  } catch (error) {
    if (instructionsPath) {
      throw error;
    }
    const aliasPath = await getDefaultAliasPath(options);
    return {
      instructionsPath: aliasPath,
      syncCommand: TOKENJUICE_ANYWHERE_AGENTS_SYNC_COMMAND,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: [
          "tokenjuice anywhere-agents local instructions are not installed",
          "default AGENTS.local.md is outside the project write boundary; tokenjuice doctor did not inspect it",
        ],
        advisory: TOKENJUICE_ANYWHERE_AGENTS_ADVISORY,
        fixCommand: TOKENJUICE_ANYWHERE_AGENTS_FIX_COMMAND,
      }),
    };
  }
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_ANYWHERE_AGENTS_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      syncCommand: TOKENJUICE_ANYWHERE_AGENTS_SYNC_COMMAND,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice anywhere-agents local instructions are not installed"],
        advisory: TOKENJUICE_ANYWHERE_AGENTS_ADVISORY,
        fixCommand: TOKENJUICE_ANYWHERE_AGENTS_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "anywhere-agents instructions",
    repairCommand: TOKENJUICE_ANYWHERE_AGENTS_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers && markerIssues.length === 0
      ? [
          "configured anywhere-agents instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install anywhere-agents",
        ]
      : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured anywhere-agents instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured anywhere-agents instructions are missing the raw escape hatch",
        },
        {
          requiredText: "run `anywhere-agents`",
          missingIssue: "configured anywhere-agents instructions are missing sync guidance",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured anywhere-agents instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    syncCommand: TOKENJUICE_ANYWHERE_AGENTS_SYNC_COMMAND,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_ANYWHERE_AGENTS_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.local.md, then run tokenjuice install anywhere-agents"
        : TOKENJUICE_ANYWHERE_AGENTS_FIX_COMMAND,
    }),
  };
}
