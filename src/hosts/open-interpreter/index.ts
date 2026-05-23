import { readdir, realpath, stat } from "node:fs/promises";
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

export type OpenInterpreterInstructionsOptions = {
  projectDir?: string;
  scanProjectTree?: boolean;
};

export type InstallOpenInterpreterInstructionsResult = {
  instructionsPath: string;
  instructionsPaths?: string[];
  backupPath?: string;
};

export type UninstallOpenInterpreterInstructionsResult = {
  instructionsPath: string;
  removedPaths?: string[];
  removed: boolean;
};

export type OpenInterpreterDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_OPEN_INTERPRETER_FIX_COMMAND = "tokenjuice install open-interpreter";
const TOKENJUICE_OPEN_INTERPRETER_BEGIN = "<!-- tokenjuice:open-interpreter begin -->";
const TOKENJUICE_OPEN_INTERPRETER_END = "<!-- tokenjuice:open-interpreter end -->";
const TOKENJUICE_OPEN_INTERPRETER_ADVISORY = "Open Interpreter support is beta and instruction-based; it guides command usage through project AGENTS.md but does not intercept tool output. tokenjuice manages AGENTS.md files inside the current git/project root; global Open Interpreter instructions remain user-managed.";

function getExplicitProjectDir(options: OpenInterpreterInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.OPEN_INTERPRETER_PROJECT_DIR;
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

async function resolveProjectDir(options: OpenInterpreterInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? resolve(process.cwd());
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

async function findParentTokenjuiceInstructionPaths(startDir: string, boundaryDir: string): Promise<string[]> {
  let current = resolve(startDir);
  const boundary = resolve(boundaryDir);
  const paths: string[] = [];
  while (true) {
    if (!await isInsideOrEqualPath(current, boundary)) {
      return paths;
    }

    const instructionsPath = join(current, "AGENTS.md");
    const existing = await readInstructionFile(instructionsPath);
    if (existing.exists && (existing.text.includes(TOKENJUICE_OPEN_INTERPRETER_BEGIN) || existing.text.includes(TOKENJUICE_OPEN_INTERPRETER_END))) {
      paths.push(instructionsPath);
    }

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

const OPEN_INTERPRETER_SCAN_SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

async function findDescendantTokenjuiceInstructionPaths(projectDir: string): Promise<string[]> {
  const paths: string[] = [];
  const rootDir = resolve(projectDir);

  async function visit(dir: string): Promise<void> {
    if (dir !== rootDir && await hasGitMetadata(dir)) {
      return;
    }

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      if (entry.isFile() && entry.name === "AGENTS.md") {
        const existing = await readInstructionFile(entryPath);
        if (existing.text.includes(TOKENJUICE_OPEN_INTERPRETER_BEGIN) || existing.text.includes(TOKENJUICE_OPEN_INTERPRETER_END)) {
          paths.push(entryPath);
        }
        continue;
      }

      if (entry.isDirectory() && !OPEN_INTERPRETER_SCAN_SKIP_DIRS.has(entry.name)) {
        await visit(entryPath);
      }
    }
  }

  await visit(rootDir);
  return paths;
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

async function getDefaultInstructionPaths(
  options: OpenInterpreterInstructionsOptions = {},
  preferExistingTokenjuiceBlocks = false,
  includeRootWithExistingBlocks = false,
): Promise<string[]> {
  const scanProjectTree = options.scanProjectTree !== false;
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    const projectDir = resolve(explicitProjectDir);
    const rootInstructionsPath = join(projectDir, "AGENTS.md");
    if (preferExistingTokenjuiceBlocks) {
      const existing = await isInsideOrEqualPath(resolve(process.cwd()), projectDir)
        ? await findParentTokenjuiceInstructionPaths(process.cwd(), projectDir)
        : [];
      const descendantExisting = includeRootWithExistingBlocks && scanProjectTree
        ? await findDescendantTokenjuiceInstructionPaths(projectDir)
        : [];
      if (existing.length > 0 || descendantExisting.length > 0) {
        return includeRootWithExistingBlocks
          ? await uniqueCanonicalPaths([rootInstructionsPath, ...existing, ...descendantExisting])
          : existing;
      }
    }
    return [rootInstructionsPath];
  }

  const projectDir = await resolveProjectDir(options);
  if (preferExistingTokenjuiceBlocks) {
    const existing = await findParentTokenjuiceInstructionPaths(process.cwd(), projectDir);
    const descendantExisting = includeRootWithExistingBlocks && scanProjectTree
      ? await findDescendantTokenjuiceInstructionPaths(projectDir)
      : [];
    if (existing.length > 0 || descendantExisting.length > 0) {
      return includeRootWithExistingBlocks
        ? await uniqueCanonicalPaths([join(projectDir, "AGENTS.md"), ...existing, ...descendantExisting])
        : existing;
    }
  }

  return [join(projectDir, "AGENTS.md")];
}

async function getDefaultUninstallInstructionPaths(options: OpenInterpreterInstructionsOptions = {}): Promise<string[]> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    const projectDir = resolve(explicitProjectDir);
    const rootInstructionsPath = join(projectDir, "AGENTS.md");
    const descendantExisting = await findDescendantTokenjuiceInstructionPaths(projectDir);
    if (await isInsideOrEqualPath(resolve(process.cwd()), projectDir)) {
      const existing = await findParentTokenjuiceInstructionPaths(process.cwd(), projectDir);
      if (existing.length > 0) {
        return await uniqueCanonicalPaths([...existing, ...descendantExisting]);
      }
    }
    if (descendantExisting.length > 0) {
      return await uniqueCanonicalPaths(descendantExisting);
    }
    return [rootInstructionsPath];
  }

  const projectDir = await resolveProjectDir(options);
  const rootInstructionsPath = join(projectDir, "AGENTS.md");
  const descendantExisting = await findDescendantTokenjuiceInstructionPaths(projectDir);
  const existing = await findParentTokenjuiceInstructionPaths(process.cwd(), projectDir);
  if (existing.length > 0 || descendantExisting.length > 0) {
    return await uniqueCanonicalPaths([...existing, ...descendantExisting]);
  }
  return [rootInstructionsPath];
}

const TOKENJUICE_OPEN_INTERPRETER_BLOCK = [
  TOKENJUICE_OPEN_INTERPRETER_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Open Interpreter, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  TOKENJUICE_OPEN_INTERPRETER_END,
].join("\n");

const TOKENJUICE_OPEN_INTERPRETER_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_OPEN_INTERPRETER_BEGIN,
  endMarker: TOKENJUICE_OPEN_INTERPRETER_END,
  block: TOKENJUICE_OPEN_INTERPRETER_BLOCK,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_OPEN_INTERPRETER_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_OPEN_INTERPRETER_END, beginIndex + TOKENJUICE_OPEN_INTERPRETER_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_OPEN_INTERPRETER_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_OPEN_INTERPRETER_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_OPEN_INTERPRETER_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installOpenInterpreterInstructions(
  instructionsPath?: string,
  options: OpenInterpreterInstructionsOptions = {},
): Promise<InstallOpenInterpreterInstructionsResult> {
  const resolvedInstructionsPaths = instructionsPath ? [instructionsPath] : await getDefaultInstructionPaths(options, true, true);
  for (const resolvedInstructionsPath of resolvedInstructionsPaths) {
    const existing = await readInstructionFile(resolvedInstructionsPath);
    const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_OPEN_INTERPRETER_BLOCK_CONFIG);
    if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
      throw new Error(
        `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install open-interpreter`,
      );
    }
  }

  const results = [];
  for (const resolvedInstructionsPath of resolvedInstructionsPaths) {
    results.push(await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_OPEN_INTERPRETER_BLOCK_CONFIG));
  }
  const result = results[0]!;
  const instructionsPaths = results.map((entry) => entry.filePath);
  return {
    instructionsPath: result.filePath,
    ...(instructionsPaths.length > 1 ? { instructionsPaths } : {}),
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallOpenInterpreterInstructions(
  instructionsPath?: string,
  options: OpenInterpreterInstructionsOptions = {},
): Promise<UninstallOpenInterpreterInstructionsResult> {
  const resolvedInstructionsPaths = instructionsPath ? [instructionsPath] : await getDefaultUninstallInstructionPaths(options);
  for (const resolvedInstructionsPath of resolvedInstructionsPaths) {
    const existing = await readInstructionFile(resolvedInstructionsPath);
    const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_OPEN_INTERPRETER_BLOCK_CONFIG);
    if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
      throw new Error(
        `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall open-interpreter`,
      );
    }
  }

  const results = [];
  for (const resolvedInstructionsPath of resolvedInstructionsPaths) {
    results.push(await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_OPEN_INTERPRETER_BLOCK_CONFIG));
  }
  const removedPaths = results.filter((result) => result.removed).map((result) => result.filePath);
  const firstResult = results[0]!;
  return {
    instructionsPath: firstResult.filePath,
    ...(removedPaths.length > 0 ? { removedPaths } : {}),
    removed: removedPaths.length > 0,
  };
}

async function inspectOpenInterpreterInstructionsPath(resolvedInstructionsPath: string): Promise<OpenInterpreterDoctorReport> {
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_OPEN_INTERPRETER_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Open Interpreter instructions are not installed"],
        advisory: TOKENJUICE_OPEN_INTERPRETER_ADVISORY,
        fixCommand: TOKENJUICE_OPEN_INTERPRETER_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Open Interpreter instructions",
    repairCommand: TOKENJUICE_OPEN_INTERPRETER_FIX_COMMAND,
  });
  const malformedMarkerIssues = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount) && markerIssues.length === 0
    ? ["configured Open Interpreter instructions have malformed tokenjuice markers"]
    : [];
  const issues = [
    ...markerIssues,
    ...malformedMarkerIssues,
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Open Interpreter instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Open Interpreter instructions are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Open Interpreter instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_OPEN_INTERPRETER_ADVISORY,
      fixCommand: hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install open-interpreter"
        : TOKENJUICE_OPEN_INTERPRETER_FIX_COMMAND,
    }),
  };
}

export async function doctorOpenInterpreterInstructions(
  instructionsPath?: string,
  options: OpenInterpreterInstructionsOptions = {},
): Promise<OpenInterpreterDoctorReport> {
  const resolvedInstructionsPaths = instructionsPath ? [instructionsPath] : await getDefaultInstructionPaths(options, true, true);
  const reports = [];
  for (const resolvedInstructionsPath of resolvedInstructionsPaths) {
    reports.push(await inspectOpenInterpreterInstructionsPath(resolvedInstructionsPath));
  }

  const brokenReport = reports.find((report) => report.status === "broken");
  if (brokenReport) {
    return brokenReport;
  }

  if (!instructionsPath && reports.length > 1 && reports[0]?.status === "disabled") {
    return {
      instructionsPath: reports[0].instructionsPath,
      status: "warn",
      issues: ["tokenjuice Open Interpreter root instructions are not installed, but nested tokenjuice instructions exist"],
      advisories: [TOKENJUICE_OPEN_INTERPRETER_ADVISORY],
      fixCommand: TOKENJUICE_OPEN_INTERPRETER_FIX_COMMAND,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  return reports.find((report) => report.status === "warn")
    ?? reports.find((report) => report.status === "ok")
    ?? reports[0]!;
}
