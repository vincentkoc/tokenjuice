import { readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { hasGitMetadata, createProjectDirResolver } from "../shared/project-root.js";

import {
  getMarkerDelimitedBlockText,
  hasMalformedMarkerDelimitedBlock,
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import {
  type PathDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { collectGuidanceIssues, readInstructionFile } from "../shared/instruction-file.js";

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

export type GooseDoctorReport = PathDoctorReport<"hintsPath">;

const TOKENJUICE_GOOSE_FIX_COMMAND = "tokenjuice install goose";
const TOKENJUICE_GOOSE_BEGIN = "<!-- tokenjuice:begin -->";
const TOKENJUICE_GOOSE_END = "<!-- tokenjuice:end -->";
const TOKENJUICE_GOOSE_ADVISORY = "Goose support is beta and hints-based; it guides command usage but does not intercept tool output.";
const GOOSE_HINTS_FILENAME = ".goosehints";
const GOOSE_HINTS_SCAN_SKIP_DIRS = new Set([".git", "node_modules"]);

const resolveProjectDir = createProjectDirResolver("GOOSE_PROJECT_DIR");

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
    if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_GOOSE_BLOCK_CONFIG)) {
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
    if (existing.exists && hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_GOOSE_BLOCK_CONFIG)) {
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

  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, TOKENJUICE_GOOSE_BLOCK_CONFIG);
  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Goose hints",
    repairCommand: TOKENJUICE_GOOSE_FIX_COMMAND,
  });
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers ? ["configured Goose hints have unmatched tokenjuice markers"] : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, TOKENJUICE_GOOSE_BLOCK_CONFIG), {
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

  const report = reports.find((report) => report.status === "broken")
    ?? reports.find((report) => report.status === "warn")
    ?? reports.find((report) => report.status === "ok")
    ?? reports[0]!;
  const configuredNames = process.env.CONTEXT_FILE_NAMES;
  if (configuredNames === undefined || report.status === "disabled") return report;

  let contextIssue: string | undefined;
  try {
    const names: unknown = JSON.parse(configuredNames);
    if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
      contextIssue = "CONTEXT_FILE_NAMES must be a JSON array of filenames; Goose hint loading is unverified";
    } else if (!names.includes(GOOSE_HINTS_FILENAME)) {
      contextIssue = "CONTEXT_FILE_NAMES excludes .goosehints; Goose will not discover the installed tokenjuice hints through this filename list";
    }
  } catch {
    contextIssue = "CONTEXT_FILE_NAMES must be a JSON array of filenames; Goose hint loading is unverified";
  }
  return contextIssue ? {
    ...report,
    status: report.status === "broken" ? "broken" : "warn",
    issues: [...report.issues, contextIssue],
    advisories: [...report.advisories, "Include .goosehints in the Goose process's CONTEXT_FILE_NAMES array and restart the session; tokenjuice does not change this setting."],
  } : report;
}
