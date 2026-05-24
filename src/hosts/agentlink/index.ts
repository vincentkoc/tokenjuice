import { lstat, readFile, realpath, stat, writeFile } from "node:fs/promises";
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

export type AgentlinkInstructionsOptions = {
  projectDir?: string;
};

export type InstallAgentlinkInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
  syncCommand: string;
};

export type UninstallAgentlinkInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
  syncCommand: string;
};

export type AgentlinkDoctorReport = {
  instructionsPath: string;
  syncCommand: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AGENTLINK_FIX_COMMAND = "tokenjuice install agentlink";
const TOKENJUICE_AGENTLINK_SYNC_COMMAND = "agentlink sync";
const TOKENJUICE_AGENTLINK_BEGIN = "<!-- tokenjuice:agentlink begin -->";
const TOKENJUICE_AGENTLINK_END = "<!-- tokenjuice:agentlink end -->";
const TOKENJUICE_AGENTLINK_ADVISORY =
  "Agentlink support is beta and source-instruction based; Agentlink symlinks AGENTS.md into downstream tool files, but each tool still owns command execution. Run `agentlink sync` after install or uninstall.";

function getExplicitProjectDir(options: AgentlinkInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.AGENTLINK_PROJECT_DIR;
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

async function resolveProjectDir(options: AgentlinkInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

function stripInlineComment(value: string): string {
  let quote: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && (index === 0 || value[index - 1] !== "\\")) {
      quote = quote === char ? undefined : quote ?? char;
    }
    if (char === "#" && quote === undefined) {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

function unquoteYamlScalar(value: string): string {
  const trimmed = stripInlineComment(value);
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseAgentlinkSourceConfig(configText: string): string | undefined {
  for (const line of configText.split(/\r?\n/u)) {
    const match = /^\s*source\s*:\s*(.+?)\s*$/u.exec(line);
    if (!match) {
      continue;
    }
    const source = unquoteYamlScalar(match[1] ?? "");
    return source || undefined;
  }
  return undefined;
}

function isInsideOrEqual(parentDir: string, childPath: string): boolean {
  const relativePath = relative(parentDir, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function resolveAgentlinkSourcePath(projectDir: string, source: string): string {
  const sourcePath = resolve(projectDir, source);
  if (isAbsolute(source) || source === "~" || source.startsWith("~/") || !isInsideOrEqual(projectDir, sourcePath)) {
    throw new Error(
      `cannot use Agentlink source ${source}; tokenjuice only writes project .agentlink.yaml sources inside ${projectDir}`,
    );
  }
  return sourcePath;
}

async function readAgentlinkConfigSource(projectDir: string): Promise<string | undefined> {
  try {
    const configText = await readFile(join(projectDir, ".agentlink.yaml"), "utf8");
    return parseAgentlinkSourceConfig(configText);
  } catch {
    return undefined;
  }
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

async function resolveSafeProjectWriteTarget(
  filePath: string,
  projectDir: string,
): Promise<{ filePath: string; followedSymlink: boolean }> {
  const realParentDir = await realpathExistingAncestor(dirname(filePath));
  if (!isInsideOrEqual(projectDir, realParentDir)) {
    throw new Error(
      `cannot use Agentlink source ${filePath}; tokenjuice will not write through instruction directories outside ${projectDir}`,
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
      `cannot use Agentlink source ${filePath}; tokenjuice will not follow instruction symlinks outside ${projectDir}`,
    );
  }
  return { filePath: targetPath, followedSymlink: true };
}

async function getDefaultInstructionsTarget(
  options: AgentlinkInstructionsOptions = {},
): Promise<{ instructionsPath: string; preserveEmptyFileOnUninstall: boolean }> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  const configuredSource = await readAgentlinkConfigSource(projectDir);
  const sourcePath = configuredSource ? resolveAgentlinkSourcePath(realProjectDir, configuredSource) : join(projectDir, "AGENTS.md");
  const target = await resolveSafeProjectWriteTarget(sourcePath, realProjectDir);
  return {
    instructionsPath: target.filePath,
    preserveEmptyFileOnUninstall: configuredSource !== undefined || target.followedSymlink,
  };
}

async function getDefaultInstructionsPath(options: AgentlinkInstructionsOptions = {}): Promise<string> {
  return (await getDefaultInstructionsTarget(options)).instructionsPath;
}

async function getDoctorFallbackInstructionsPath(options: AgentlinkInstructionsOptions = {}): Promise<string> {
  try {
    return join(await resolveProjectDir(options), "AGENTS.md");
  } catch {
    return join(process.cwd(), "AGENTS.md");
  }
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const TOKENJUICE_AGENTLINK_BLOCK = [
  TOKENJUICE_AGENTLINK_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When Agentlink syncs this AGENTS.md into AI coding tool instruction files, prefer `tokenjuice wrap -- <command>` for terminal commands likely to produce long output.",
  }),
  "- After editing this source instruction file, run `agentlink sync` so downstream tool instruction files point at the updated source.",
  TOKENJUICE_AGENTLINK_END,
].join("\n");

const TOKENJUICE_AGENTLINK_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_AGENTLINK_BEGIN,
  endMarker: TOKENJUICE_AGENTLINK_END,
  block: TOKENJUICE_AGENTLINK_BLOCK,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_AGENTLINK_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_AGENTLINK_END, beginIndex + TOKENJUICE_AGENTLINK_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_AGENTLINK_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_AGENTLINK_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_AGENTLINK_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

export async function installAgentlinkInstructions(
  instructionsPath?: string,
  options: AgentlinkInstructionsOptions = {},
): Promise<InstallAgentlinkInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTLINK_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice install agentlink`,
    );
  }

  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AGENTLINK_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    syncCommand: TOKENJUICE_AGENTLINK_SYNC_COMMAND,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAgentlinkInstructions(
  instructionsPath?: string,
  options: AgentlinkInstructionsOptions = {},
): Promise<UninstallAgentlinkInstructionsResult> {
  const target = instructionsPath
    ? { instructionsPath, preserveEmptyFileOnUninstall: false }
    : await getDefaultInstructionsTarget(options);
  const resolvedInstructionsPath = target.instructionsPath;
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTLINK_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${resolvedInstructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall agentlink`,
    );
  }

  if (target.preserveEmptyFileOnUninstall) {
    const removed = removeMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTLINK_BLOCK_CONFIG);
    if (!removed.removed) {
      return { instructionsPath: resolvedInstructionsPath, removed: false, syncCommand: TOKENJUICE_AGENTLINK_SYNC_COMMAND };
    }
    await writeFile(resolvedInstructionsPath, removed.text.trim() ? `${removed.text.trim()}\n` : "", "utf8");
    return { instructionsPath: resolvedInstructionsPath, removed: true, syncCommand: TOKENJUICE_AGENTLINK_SYNC_COMMAND };
  }

  const result = await uninstallMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_AGENTLINK_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed, syncCommand: TOKENJUICE_AGENTLINK_SYNC_COMMAND };
}

export async function doctorAgentlinkInstructions(
  instructionsPath?: string,
  options: AgentlinkInstructionsOptions = {},
): Promise<AgentlinkDoctorReport> {
  let resolvedInstructionsPath: string;
  try {
    resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  } catch (error) {
    return {
      instructionsPath: await getDoctorFallbackInstructionsPath(options),
      syncCommand: TOKENJUICE_AGENTLINK_SYNC_COMMAND,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [`cannot resolve Agentlink instruction source: ${formatErrorMessage(error)}`],
        advisory: TOKENJUICE_AGENTLINK_ADVISORY,
        fixCommand: "fix .agentlink.yaml source to point inside the project, then run tokenjuice install agentlink",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AGENTLINK_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      syncCommand: TOKENJUICE_AGENTLINK_SYNC_COMMAND,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Agentlink instructions are not installed"],
        advisory: TOKENJUICE_AGENTLINK_ADVISORY,
        fixCommand: TOKENJUICE_AGENTLINK_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "Agentlink instructions",
    repairCommand: TOKENJUICE_AGENTLINK_FIX_COMMAND,
  });
  const hasMalformedMarkers = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers && markerIssues.length === 0
      ? [
          "configured Agentlink instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install agentlink",
        ]
      : []),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Agentlink instructions are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Agentlink instructions are missing the raw escape hatch",
        },
        {
          requiredText: "agentlink sync",
          missingIssue: "configured Agentlink instructions are missing sync guidance",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Agentlink instructions still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    syncCommand: TOKENJUICE_AGENTLINK_SYNC_COMMAND,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_AGENTLINK_ADVISORY,
      fixCommand: hasMalformedMarkers
        ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install agentlink"
        : TOKENJUICE_AGENTLINK_FIX_COMMAND,
    }),
  };
}
