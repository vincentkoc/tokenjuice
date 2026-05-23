import { readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

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

export type AmpInstructionsOptions = {
  projectDir?: string;
  scanProjectTree?: boolean;
};

export type InstallAmpInstructionsResult = {
  instructionsPath: string;
  instructionsPaths?: string[];
  backupPath?: string;
};

export type UninstallAmpInstructionsResult = {
  instructionsPath: string;
  removedPaths?: string[];
  removed: boolean;
};

export type AmpDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AMP_FIX_COMMAND = "tokenjuice install amp";
const TOKENJUICE_AMP_BEGIN = "<!-- tokenjuice:begin -->";
const TOKENJUICE_AMP_END = "<!-- tokenjuice:end -->";
const TOKENJUICE_AMP_ADVISORY = "Amp support is beta and instruction-based; it guides command usage but does not intercept tool output. tokenjuice manages Amp instruction files inside the current git/project root; parent or global Amp instructions remain user-managed.";
const AMP_INSTRUCTION_FILENAMES = ["AGENTS.md", "AGENT.md", "CLAUDE.md"] as const;
const AMP_SUBTREE_SCAN_SKIP_DIRS = new Set([".git", "node_modules"]);

function getExplicitProjectDir(options: AmpInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.AMP_PROJECT_DIR;
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

async function resolveProjectDir(options: AmpInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

type ParentInstructionSearchOptions = {
  includeShadowedFallbacks?: boolean;
};

function isInsideOrEqualPath(childPath: string, parentPath: string): boolean {
  const relativePath = relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

async function getTokenjuiceInstructionPathsInDir(
  dir: string,
  options: ParentInstructionSearchOptions = {},
): Promise<string[]> {
  const candidatePaths = options.includeShadowedFallbacks
    ? AMP_INSTRUCTION_FILENAMES.map((filename) => join(resolve(dir), filename))
    : [await getAmpInstructionPathForDir(dir)];
  const paths: string[] = [];
  for (const instructionsPath of candidatePaths) {
    const existing = await readInstructionFile(instructionsPath);
    if (existing.exists && (existing.text.includes(TOKENJUICE_AMP_BEGIN) || existing.text.includes(TOKENJUICE_AMP_END))) {
      paths.push(instructionsPath);
    }
  }
  return paths;
}

async function findParentTokenjuiceInstructionPaths(
  startDir: string,
  boundaryDir: string,
  options: ParentInstructionSearchOptions = {},
): Promise<string[]> {
  let current = resolve(startDir);
  const boundary = resolve(boundaryDir);
  const paths: string[] = [];
  while (true) {
    if (!isInsideOrEqualPath(current, boundary)) {
      return paths;
    }

    paths.push(...await getTokenjuiceInstructionPathsInDir(current, options));

    if (current === boundary) {
      return paths;
    }

    const parent = dirname(current);
    if (parent === current) {
      return paths;
    }
    current = parent;
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

function shouldScanProjectTree(options: AmpInstructionsOptions): boolean {
  return options.scanProjectTree !== false;
}

async function findProjectTokenjuiceInstructionPaths(
  projectDir: string,
  options: ParentInstructionSearchOptions = {},
): Promise<string[]> {
  const root = resolve(projectDir);
  const paths: string[] = [];

  async function visit(dir: string): Promise<void> {
    paths.push(...await getTokenjuiceInstructionPathsInDir(dir, options));

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || AMP_SUBTREE_SCAN_SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const childDir = join(dir, entry.name);
      if (await hasGitMetadata(childDir)) {
        continue;
      }
      await visit(childDir);
    }
  }

  await visit(root);
  return uniquePaths(paths);
}

async function getAmpInstructionPathForDir(dir: string): Promise<string> {
  const resolvedDir = resolve(dir);
  for (const filename of AMP_INSTRUCTION_FILENAMES) {
    const instructionsPath = join(resolvedDir, filename);
    const existing = await readInstructionFile(instructionsPath);
    if (existing.exists) {
      return instructionsPath;
    }
  }
  return join(resolvedDir, "AGENTS.md");
}

async function getDefaultInstructionPaths(
  options: AmpInstructionsOptions = {},
  preferExistingTokenjuiceBlocks = false,
): Promise<string[]> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    const projectDir = resolve(explicitProjectDir);
    const rootInstructionsPath = await getAmpInstructionPathForDir(projectDir);
    if (preferExistingTokenjuiceBlocks) {
      const existing = shouldScanProjectTree(options)
        ? await findProjectTokenjuiceInstructionPaths(projectDir)
        : await getTokenjuiceInstructionPathsInDir(projectDir);
      if (existing.length > 0) {
        return uniquePaths([rootInstructionsPath, ...existing]);
      }
    }
    return [rootInstructionsPath];
  }

  const projectDir = await resolveProjectDir(options);
  if (preferExistingTokenjuiceBlocks) {
    const parentExisting = await findParentTokenjuiceInstructionPaths(process.cwd(), projectDir);
    const projectExisting = shouldScanProjectTree(options)
      ? await findProjectTokenjuiceInstructionPaths(projectDir)
      : [];
    if (parentExisting.length > 0) {
      return uniquePaths([...parentExisting, ...projectExisting]);
    }

    if (projectExisting.length > 0) {
      return uniquePaths([await getAmpInstructionPathForDir(projectDir), ...parentExisting, ...projectExisting]);
    }
  }

  return [await getAmpInstructionPathForDir(projectDir)];
}

async function getDefaultUninstallInstructionPaths(options: AmpInstructionsOptions = {}): Promise<string[]> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    const projectDir = resolve(explicitProjectDir);
    const existing = await findProjectTokenjuiceInstructionPaths(projectDir, { includeShadowedFallbacks: true });
    return existing.length > 0 ? existing : [await getAmpInstructionPathForDir(explicitProjectDir)];
  }

  const projectDir = await resolveProjectDir(options);
  const existing = uniquePaths([
    ...await findParentTokenjuiceInstructionPaths(
      process.cwd(),
      projectDir,
      { includeShadowedFallbacks: true },
    ),
    ...await findProjectTokenjuiceInstructionPaths(projectDir, { includeShadowedFallbacks: true }),
  ]);
  return existing.length > 0 ? existing : [await getAmpInstructionPathForDir(projectDir)];
}

const TOKENJUICE_AMP_BLOCK = [
  TOKENJUICE_AMP_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Amp, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_AMP_END,
].join("\n");

const TOKENJUICE_AMP_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_AMP_BEGIN,
  endMarker: TOKENJUICE_AMP_END,
  block: TOKENJUICE_AMP_BLOCK,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_AMP_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_AMP_END, beginIndex + TOKENJUICE_AMP_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_AMP_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_AMP_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_AMP_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installAmpInstructions(
  instructionsPath?: string,
  options: AmpInstructionsOptions = {},
): Promise<InstallAmpInstructionsResult> {
  const resolvedInstructionsPaths = instructionsPath ? [instructionsPath] : await getDefaultInstructionPaths(options, true);
  for (const resolvedInstructionsPath of resolvedInstructionsPaths) {
    const existing = await readInstructionFile(resolvedInstructionsPath);
    const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AMP_BLOCK_CONFIG);
    if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
      throw new Error(
        `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install amp`,
      );
    }
  }

  const results = [];
  for (const resolvedInstructionsPath of resolvedInstructionsPaths) {
    results.push(await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AMP_BLOCK_CONFIG));
  }
  const result = results[0]!;
  const instructionsPaths = results.map((entry) => entry.filePath);
  return {
    instructionsPath: result.filePath,
    ...(instructionsPaths.length > 1 ? { instructionsPaths } : {}),
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAmpInstructions(
  instructionsPath?: string,
  options: AmpInstructionsOptions = {},
): Promise<UninstallAmpInstructionsResult> {
  const resolvedInstructionsPaths = instructionsPath ? [instructionsPath] : await getDefaultUninstallInstructionPaths(options);
  for (const resolvedInstructionsPath of resolvedInstructionsPaths) {
    const existing = await readInstructionFile(resolvedInstructionsPath);
    const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AMP_BLOCK_CONFIG);
    if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
      throw new Error(
        `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall amp`,
      );
    }
  }

  const results = [];
  for (const resolvedInstructionsPath of resolvedInstructionsPaths) {
    results.push(await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AMP_BLOCK_CONFIG));
  }
  const removedPaths = results.filter((result) => result.removed).map((result) => result.filePath);
  const firstResult = results[0]!;
  return {
    instructionsPath: firstResult.filePath,
    ...(removedPaths.length > 0 ? { removedPaths } : {}),
    removed: removedPaths.length > 0,
  };
}

async function inspectAmpInstructionsPath(resolvedInstructionsPath: string): Promise<AmpDoctorReport> {
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AMP_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Amp instructions are not installed"],
        advisory: TOKENJUICE_AMP_ADVISORY,
        fixCommand: TOKENJUICE_AMP_FIX_COMMAND,
      }),
    };
  }

  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Amp instructions",
    repairCommand: TOKENJUICE_AMP_FIX_COMMAND,
  });
  const issues = uniquePaths([
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Amp instructions have unmatched tokenjuice markers"] : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Amp instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Amp instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Amp instructions still suggest the full escape hatch",
        },
      ],
    }),
  ]);

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_AMP_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install amp"
        : TOKENJUICE_AMP_FIX_COMMAND,
    }),
  };
}

export async function doctorAmpInstructions(
  instructionsPath?: string,
  options: AmpInstructionsOptions = {},
): Promise<AmpDoctorReport> {
  const resolvedInstructionsPaths = instructionsPath ? [instructionsPath] : await getDefaultInstructionPaths(options, true);
  const reports = [];
  for (const resolvedInstructionsPath of resolvedInstructionsPaths) {
    reports.push(await inspectAmpInstructionsPath(resolvedInstructionsPath));
  }

  return reports.find((report) => report.status === "broken")
    ?? reports.find((report) => report.status === "warn")
    ?? reports.find((report) => report.status === "ok")
    ?? reports[0]!;
}
