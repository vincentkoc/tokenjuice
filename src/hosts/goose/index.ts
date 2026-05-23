import { readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { collectGuidanceIssues, readInstructionFile } from "../shared/instruction-file.js";
import {
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";

export type GooseHintsOptions = {
  projectDir?: string;
  scanProjectTree?: boolean;
};

export type InstallGooseHintsResult = {
  hintsPath: string;
  hintsPaths?: string[];
  backupPath?: string;
};

export type UninstallGooseHintsResult = {
  hintsPath: string;
  removedPaths?: string[];
  removed: boolean;
};

export type GooseDoctorReport = {
  hintsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_GOOSE_FIX_COMMAND = "tokenjuice install goose";
const TOKENJUICE_GOOSE_BEGIN = "<!-- tokenjuice:begin -->";
const TOKENJUICE_GOOSE_END = "<!-- tokenjuice:end -->";
const TOKENJUICE_GOOSE_ADVISORY = "Goose support is beta and hints-based; it guides command usage but does not intercept tool output.";
const GOOSE_HINTS_FILENAME = ".goosehints";
const GOOSE_HINTS_SCAN_SKIP_DIRS = new Set([".git", "node_modules"]);

function getExplicitProjectDir(options: GooseHintsOptions = {}): string | undefined {
  return options.projectDir || process.env.GOOSE_PROJECT_DIR;
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

async function resolveProjectDir(options: GooseHintsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

async function isInsideOrEqualPath(childPath: string, parentPath: string): Promise<boolean> {
  const child = await canonicalPath(childPath);
  const parent = await canonicalPath(parentPath);
  const relativePath = relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

async function uniqueCanonicalPaths(paths: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const uniquePaths: string[] = [];
  for (const path of paths) {
    const key = await canonicalPath(path);
    if (!seen.has(key)) {
      seen.add(key);
      uniquePaths.push(path);
    }
  }
  return uniquePaths;
}

function getHintsPathForDir(dir: string): string {
  return join(resolve(dir), GOOSE_HINTS_FILENAME);
}

async function getTokenjuiceHintsPathInDir(dir: string): Promise<string | undefined> {
  const hintsPath = getHintsPathForDir(dir);
  const existing = await readInstructionFile(hintsPath);
  return existing.exists && (existing.text.includes(TOKENJUICE_GOOSE_BEGIN) || existing.text.includes(TOKENJUICE_GOOSE_END))
    ? hintsPath
    : undefined;
}

async function findParentTokenjuiceHintsPaths(startDir: string, boundaryDir: string): Promise<string[]> {
  let current = resolve(startDir);
  const boundary = resolve(boundaryDir);
  const paths: string[] = [];
  while (await isInsideOrEqualPath(current, boundary)) {
    const hintsPath = await getTokenjuiceHintsPathInDir(current);
    if (hintsPath) {
      paths.push(hintsPath);
    }
    if (await isInsideOrEqualPath(boundary, current)) {
      return paths;
    }
    const parent = dirname(current);
    if (parent === current) {
      return paths;
    }
    current = parent;
  }
  return paths;
}

async function findProjectTokenjuiceHintsPaths(projectDir: string): Promise<string[]> {
  const root = resolve(projectDir);
  const paths: string[] = [];

  async function visit(dir: string): Promise<void> {
    const hintsPath = await getTokenjuiceHintsPathInDir(dir);
    if (hintsPath) {
      paths.push(hintsPath);
    }

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || GOOSE_HINTS_SCAN_SKIP_DIRS.has(entry.name)) {
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
  return paths;
}

function shouldScanProjectTree(options: GooseHintsOptions): boolean {
  return options.scanProjectTree !== false;
}

async function getDefaultHintsPaths(
  options: GooseHintsOptions = {},
  preferExistingTokenjuiceBlocks = false,
  includeRootWithExistingBlocks = false,
): Promise<string[]> {
  const projectDir = await resolveProjectDir(options);
  const rootHintsPath = getHintsPathForDir(projectDir);
  const existingHintsPaths: string[] = [];
  const cwdIsInsideProject = await isInsideOrEqualPath(process.cwd(), projectDir);
  if (preferExistingTokenjuiceBlocks && cwdIsInsideProject) {
    existingHintsPaths.push(...await findParentTokenjuiceHintsPaths(process.cwd(), projectDir));
  }
  if (preferExistingTokenjuiceBlocks && shouldScanProjectTree(options)) {
    existingHintsPaths.push(...await findProjectTokenjuiceHintsPaths(projectDir));
  }
  if (existingHintsPaths.length > 0) {
    const paths = includeRootWithExistingBlocks ? [rootHintsPath, ...existingHintsPaths] : existingHintsPaths;
    return uniqueCanonicalPaths(paths);
  }
  return [rootHintsPath];
}

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_GOOSE_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_GOOSE_END, beginIndex + TOKENJUICE_GOOSE_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_GOOSE_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_GOOSE_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_GOOSE_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

const TOKENJUICE_GOOSE_BLOCK = [
  TOKENJUICE_GOOSE_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets(),
  "- Restart your Goose session after changing this file so the updated hints are loaded.",
  TOKENJUICE_GOOSE_END,
].join("\n");

const TOKENJUICE_GOOSE_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_GOOSE_BEGIN,
  endMarker: TOKENJUICE_GOOSE_END,
  block: TOKENJUICE_GOOSE_BLOCK,
};

export async function installGooseHints(
  hintsPath?: string,
  options: GooseHintsOptions = {},
): Promise<InstallGooseHintsResult> {
  const resolvedHintsPaths = hintsPath ? [hintsPath] : await getDefaultHintsPaths(options, true, true);
  for (const resolvedHintsPath of resolvedHintsPaths) {
    const existing = await readInstructionFile(resolvedHintsPath);
    const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GOOSE_BLOCK_CONFIG);
    if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
      throw new Error(
        `cannot safely repair malformed tokenjuice markers in ${resolvedHintsPath}; remove the dangling marker manually, then rerun tokenjuice install goose`,
      );
    }
  }

  const results = [];
  for (const resolvedHintsPath of resolvedHintsPaths) {
    results.push(await installMarkerDelimitedBlock(resolvedHintsPath, TOKENJUICE_GOOSE_BLOCK_CONFIG));
  }
  const result = results[0]!;
  const hintsPaths = results.map((entry) => entry.filePath);
  return {
    hintsPath: result.filePath,
    ...(hintsPaths.length > 1 ? { hintsPaths } : {}),
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallGooseHints(
  hintsPath?: string,
  options: GooseHintsOptions = {},
): Promise<UninstallGooseHintsResult> {
  const resolvedHintsPaths = hintsPath ? [hintsPath] : await getDefaultHintsPaths(options, true);
  for (const resolvedHintsPath of resolvedHintsPaths) {
    const existing = await readInstructionFile(resolvedHintsPath);
    const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GOOSE_BLOCK_CONFIG);
    if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
      throw new Error(
        `cannot safely uninstall malformed tokenjuice markers in ${resolvedHintsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall goose`,
      );
    }
  }

  const results = [];
  for (const resolvedHintsPath of resolvedHintsPaths) {
    results.push(await uninstallMarkerDelimitedBlock(resolvedHintsPath, TOKENJUICE_GOOSE_BLOCK_CONFIG));
  }
  const removedPaths = results.filter((result) => result.removed).map((result) => result.filePath);
  const result = results[0]!;
  return {
    hintsPath: result.filePath,
    ...(removedPaths.length > 0 ? { removedPaths } : {}),
    removed: removedPaths.length > 0,
  };
}

async function inspectGooseHintsPath(resolvedHintsPath: string): Promise<GooseDoctorReport> {
  const existing = await readInstructionFile(resolvedHintsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_GOOSE_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      hintsPath: resolvedHintsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Goose hints are not installed"],
        advisory: TOKENJUICE_GOOSE_ADVISORY,
        fixCommand: TOKENJUICE_GOOSE_FIX_COMMAND,
      }),
    };
  }

  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Goose hints",
    repairCommand: TOKENJUICE_GOOSE_FIX_COMMAND,
  });
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Goose hints have unmatched tokenjuice markers"] : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Goose hints are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Goose hints are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Goose hints still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    hintsPath: resolvedHintsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_GOOSE_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from .goosehints, then run tokenjuice install goose"
        : TOKENJUICE_GOOSE_FIX_COMMAND,
    }),
  };
}

export async function doctorGooseHints(
  hintsPath?: string,
  options: GooseHintsOptions = {},
): Promise<GooseDoctorReport> {
  const resolvedHintsPaths = hintsPath ? [hintsPath] : await getDefaultHintsPaths(options, true);
  const reports = [];
  for (const resolvedHintsPath of resolvedHintsPaths) {
    reports.push(await inspectGooseHintsPath(resolvedHintsPath));
  }

  return reports.find((report) => report.status === "broken")
    ?? reports.find((report) => report.status === "warn")
    ?? reports.find((report) => report.status === "ok")
    ?? reports[0]!;
}
