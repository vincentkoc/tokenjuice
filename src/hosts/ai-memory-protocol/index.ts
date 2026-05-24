import { lstat } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import { shellQuote } from "../shared/hook-command.js";
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
import { collectGuidanceIssues, readInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";

export type AiMemoryProtocolOptions = {
  memoryDir?: string;
};

export type InstallAiMemoryProtocolResult = {
  memoryPath: string;
  backupPath?: string;
};

export type UninstallAiMemoryProtocolResult = {
  memoryPath: string;
  removed: boolean;
};

export type AiMemoryProtocolDoctorReport = {
  memoryPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AI_MEMORY_PROTOCOL_BEGIN = ".. tokenjuice:ai-memory-protocol begin";
const TOKENJUICE_AI_MEMORY_PROTOCOL_END = ".. tokenjuice:ai-memory-protocol end";
const TOKENJUICE_AI_MEMORY_PROTOCOL_ID = "PREF_TOKENJUICE_TERMINAL_OUTPUT_COMPACTION";
const TOKENJUICE_AI_MEMORY_PROTOCOL_ADVISORY =
  "AI Memory Protocol support is beta and RST-memory based; run memory init before install; tokenjuice records command guidance in the memory graph but does not intercept MCP tool output.";

type AiMemoryProtocolLocation = {
  memoryDir: string;
  memoryPath: string;
  confPath: string;
  indexPath: string;
  memoryIndexPath: string;
  workspacePaths: string[];
};

type AiMemoryProtocolWorkspaceCheck = {
  issues: string[];
  missingPaths: string[];
};

function getMemoryDir(options: AiMemoryProtocolOptions = {}): string {
  return options.memoryDir || process.env.AI_MEMORY_PROTOCOL_DIR || process.env.MEMORY_DIR || join(process.cwd(), ".memories");
}

function getDefaultMemoryPath(options: AiMemoryProtocolOptions = {}): string {
  return join(getMemoryDir(options), "memory", "preferences.rst");
}

function resolveMemoryLocation(memoryPath?: string, options: AiMemoryProtocolOptions = {}): AiMemoryProtocolLocation {
  const memoryDir = options.memoryDir ?? (memoryPath ? dirname(dirname(memoryPath)) : getMemoryDir(options));
  const confPath = join(memoryDir, "conf.py");
  const indexPath = join(memoryDir, "index.rst");
  const memoryIndexPath = join(memoryDir, "memory", "index.rst");
  return {
    memoryDir,
    memoryPath: memoryPath ?? getDefaultMemoryPath({ ...options, memoryDir }),
    confPath,
    indexPath,
    memoryIndexPath,
    workspacePaths: [confPath, indexPath, memoryIndexPath],
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    const stats = await lstat(filePath);
    return stats.isFile();
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      return false;
    }
    throw error;
  }
}

async function readOptionalMemoryFile(filePath: string): Promise<Awaited<ReturnType<typeof readInstructionFile>>> {
  try {
    return await readInstructionFile(filePath);
  } catch (error) {
    if (["EISDIR", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      return { text: "", exists: false };
    }
    throw error;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await lstat(filePath)).isDirectory();
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      return false;
    }
    throw error;
  }
}

async function findMemoryPathSymlink(location: AiMemoryProtocolLocation): Promise<{ label: string; path: string } | undefined> {
  const candidates = [
    { label: "memory workspace directory", path: location.memoryDir },
    { label: "workspace config file", path: location.confPath },
    { label: "workspace index file", path: location.indexPath },
    { label: "memory directory", path: dirname(location.memoryPath) },
    { label: "memory index file", path: location.memoryIndexPath },
    { label: "memory file", path: location.memoryPath },
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.path)) {
      continue;
    }
    seen.add(candidate.path);
    try {
      const stats = await lstat(candidate.path);
      if (stats.isSymbolicLink()) {
        return candidate;
      }
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        throw error;
      }
    }
  }
  return undefined;
}

async function assertNoMemoryPathSymlink(location: AiMemoryProtocolLocation, operation: string): Promise<void> {
  const symlink = await findMemoryPathSymlink(location);
  if (symlink) {
    throw new Error(`cannot safely ${operation} AI Memory Protocol memory through symlinked ${symlink.label} ${symlink.path}; remove the symlink, then rerun tokenjuice ${operation} ai-memory-protocol`);
  }
}

async function collectMissingWorkspacePaths(location: AiMemoryProtocolLocation): Promise<string[]> {
  const checks = await Promise.all(location.workspacePaths.map(async (filePath) => [filePath, await pathExists(filePath)] as const));
  return checks.filter(([, exists]) => !exists).map(([filePath]) => filePath);
}

function memoryIndexSupportsPreferences(text: string): boolean {
  const lines = text.split(/\r?\n/u);
  let includesPreferences = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*\.\. toctree::\s*$/u.test(lines[index] ?? "")) {
      continue;
    }
    const block: string[] = [];
    for (let blockIndex = index + 1; blockIndex < lines.length; blockIndex += 1) {
      const line = lines[blockIndex] ?? "";
      if (line.trim() && !/^\s+/u.test(line)) {
        break;
      }
      block.push(line);
    }
    const hasGlob = block.some((line) => /^\s+:glob:\s*$/u.test(line));
    const hasPreferences = block.some((line) => /^\s+preferences\s*$/u.test(line));
    const hasWildcard = block.some((line) => /^\s+\*\s*$/u.test(line));
    if (hasWildcard && !hasGlob) {
      return false;
    }
    if (hasPreferences || (hasGlob && hasWildcard)) {
      includesPreferences = true;
    }
  }
  return includesPreferences;
}

async function collectWorkspaceIssues(location: AiMemoryProtocolLocation): Promise<AiMemoryProtocolWorkspaceCheck> {
  const missingPaths = await collectMissingWorkspacePaths(location);
  const issues = missingPaths.map((filePath) => `AI Memory Protocol workspace is missing ${filePath}`);

  if (!missingPaths.includes(location.confPath)) {
    const conf = (await readInstructionFile(location.confPath)).text;
    if (!conf.includes("sphinx_needs")) {
      issues.push("AI Memory Protocol workspace conf.py is missing the sphinx_needs extension");
    }
    if (!conf.includes("needs_types")) {
      issues.push("AI Memory Protocol workspace conf.py is missing needs_types");
    }
    if (!/["']pref["']/u.test(conf)) {
      issues.push("AI Memory Protocol workspace conf.py is missing the pref memory type");
    }
    if (!/^\s*needs_build_json\s*=\s*True\b/mu.test(conf)) {
      issues.push("AI Memory Protocol workspace conf.py must enable needs_build_json");
    }
    if (!conf.includes("needs_extra_options")) {
      issues.push("AI Memory Protocol workspace conf.py is missing needs_extra_options");
    }
    for (const option of ["source", "confidence", "scope", "created_at", "review_after"]) {
      const optionPattern = new RegExp(`["']${option}["']`, "u");
      if (!optionPattern.test(conf)) {
        issues.push(`AI Memory Protocol workspace conf.py is missing the ${option} metadata option`);
      }
    }
  }

  if (!missingPaths.includes(location.indexPath)) {
    const index = (await readInstructionFile(location.indexPath)).text;
    if (!/(^|\n)\s+memory\/index\s*(\n|$)/u.test(index)) {
      issues.push("AI Memory Protocol workspace index.rst does not include memory/index");
    }
  }

  if (!missingPaths.includes(location.memoryIndexPath)) {
    const memoryIndex = (await readInstructionFile(location.memoryIndexPath)).text;
    if (!memoryIndexSupportsPreferences(memoryIndex)) {
      issues.push("AI Memory Protocol workspace memory/index.rst does not include preferences or a :glob: memory toctree");
    }
  }

  return { issues, missingPaths };
}

async function assertInitializedWorkspace(location: AiMemoryProtocolLocation): Promise<void> {
  const workspaceCheck = await collectWorkspaceIssues(location);
  if (workspaceCheck.issues.length === 0) {
    return;
  }
  throw new Error(
    `AI Memory Protocol workspace is not initialized or incompatible at ${location.memoryDir}; run ${buildMemoryInitCommand(location.memoryDir)} before ${buildTargetedInstallCommand(location.memoryDir)} (${workspaceCheck.issues.join("; ")})`,
  );
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildAiMemoryProtocolBlock(now = new Date()): string {
  const today = formatDate(now);
  const reviewAfter = formatDate(addDays(now, 90));
  return [
    TOKENJUICE_AI_MEMORY_PROTOCOL_BEGIN,
    ".. pref:: tokenjuice terminal output compaction",
    ` :id: ${TOKENJUICE_AI_MEMORY_PROTOCOL_ID}`,
    " :status: draft",
    " :tags: topic:terminal-output, topic:tokenjuice, intent:coding-style",
    " :source: tokenjuice install ai-memory-protocol",
    " :confidence: high",
    " :scope: repo:current",
    ` :created_at: ${today}`,
    ` :review_after: ${reviewAfter}`,
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        "- When an AI coding agent using AI Memory Protocol needs to run a terminal command likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
    }).map((line) => ` ${line}`),
    " - AI Memory Protocol stores this as an RST preference memory; run `memory rebuild` so recall/MCP results include the updated guidance.",
    TOKENJUICE_AI_MEMORY_PROTOCOL_END,
  ].join("\n");
}

const TOKENJUICE_AI_MEMORY_PROTOCOL_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_AI_MEMORY_PROTOCOL_BEGIN,
  endMarker: TOKENJUICE_AI_MEMORY_PROTOCOL_END,
  block: buildAiMemoryProtocolBlock(),
};

function buildMemoryInitCommand(memoryDir: string): string {
  return `memory init ${shellQuote(memoryDir)} --install`;
}

function buildTargetedInstallCommand(memoryDir: string): string {
  return `AI_MEMORY_PROTOCOL_DIR=${shellQuote(memoryDir)} tokenjuice install ai-memory-protocol`;
}

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_AI_MEMORY_PROTOCOL_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_AI_MEMORY_PROTOCOL_END, beginIndex + TOKENJUICE_AI_MEMORY_PROTOCOL_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_AI_MEMORY_PROTOCOL_END.length);
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_AI_MEMORY_PROTOCOL_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_AI_MEMORY_PROTOCOL_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

function ensurePreferencesHeader(text: string): string {
  if (text.trim()) {
    return text;
  }
  return "===========\nPreferences\n===========\n\n";
}

export async function installAiMemoryProtocolMemory(
  memoryPath?: string,
  options: AiMemoryProtocolOptions = {},
): Promise<InstallAiMemoryProtocolResult> {
  const location = resolveMemoryLocation(memoryPath, options);
  await assertNoMemoryPathSymlink(location, "install");
  await assertInitializedWorkspace(location);
  const existing = await readOptionalMemoryFile(location.memoryPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AI_MEMORY_PROTOCOL_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice markers in ${location.memoryPath}; remove the dangling marker manually, then rerun tokenjuice install ai-memory-protocol`,
    );
  }

  if (!existing.exists) {
    if (await isDirectory(location.memoryPath)) {
      throw new Error(`cannot install AI Memory Protocol memory because ${location.memoryPath} is a directory; replace it with a regular preferences.rst file, then rerun tokenjuice install ai-memory-protocol`);
    }
    const result = await writeInstructionFile(
      location.memoryPath,
      `${ensurePreferencesHeader(existing.text)}${buildAiMemoryProtocolBlock()}\n`,
    );
    return { memoryPath: result.filePath };
  }
  const result = await installMarkerDelimitedBlock(location.memoryPath, {
    ...TOKENJUICE_AI_MEMORY_PROTOCOL_BLOCK_CONFIG,
    block: buildAiMemoryProtocolBlock(),
  });
  return {
    memoryPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAiMemoryProtocolMemory(
  memoryPath?: string,
  options: AiMemoryProtocolOptions = {},
): Promise<UninstallAiMemoryProtocolResult> {
  const location = resolveMemoryLocation(memoryPath, options);
  await assertNoMemoryPathSymlink(location, "uninstall");
  const existing = await readOptionalMemoryFile(location.memoryPath);
  if (!existing.exists) {
    return { memoryPath: location.memoryPath, removed: false };
  }
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AI_MEMORY_PROTOCOL_BLOCK_CONFIG);
  if (existing.exists && hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice markers in ${location.memoryPath}; remove the dangling marker manually, then rerun tokenjuice uninstall ai-memory-protocol`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(location.memoryPath, TOKENJUICE_AI_MEMORY_PROTOCOL_BLOCK_CONFIG);
  return { memoryPath: result.filePath, removed: result.removed };
}

export async function doctorAiMemoryProtocolMemory(
  memoryPath?: string,
  options: AiMemoryProtocolOptions = {},
): Promise<AiMemoryProtocolDoctorReport> {
  const location = resolveMemoryLocation(memoryPath, options);
  const symlink = await findMemoryPathSymlink(location);
  if (symlink) {
    return {
      memoryPath: location.memoryPath,
      // Keep marker evidence false here: aggregate doctor should not treat an
      // arbitrary symlinked memory workspace as a tokenjuice install when the
      // direct doctor refused to inspect it for privacy/safety.
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [`cannot safely inspect AI Memory Protocol memory through symlinked ${symlink.label} ${symlink.path}; remove the symlink, then rerun tokenjuice doctor ai-memory-protocol`],
        advisory: TOKENJUICE_AI_MEMORY_PROTOCOL_ADVISORY,
        fixCommand: buildTargetedInstallCommand(location.memoryDir),
      }),
      checkedPaths: location.workspacePaths,
      missingPaths: [],
    };
  }
  const workspaceCheck = await collectWorkspaceIssues(location);
  const existing = await readOptionalMemoryFile(location.memoryPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_AI_MEMORY_PROTOCOL_BLOCK_CONFIG);
  const hasTokenjuiceMarker = markerState.hasBegin || markerState.hasEnd;
  const targetedInstallCommand = buildTargetedInstallCommand(location.memoryDir);
  if (workspaceCheck.issues.length > 0) {
    return {
      memoryPath: location.memoryPath,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: markerState.hasBegin || markerState.hasEnd ? "broken" : "disabled",
        issues: [
          `AI Memory Protocol workspace is not initialized or incompatible at ${location.memoryDir}; run ${buildMemoryInitCommand(location.memoryDir)} before ${buildTargetedInstallCommand(location.memoryDir)}`,
          ...workspaceCheck.issues,
        ],
        advisory: TOKENJUICE_AI_MEMORY_PROTOCOL_ADVISORY,
        fixCommand: `${buildMemoryInitCommand(location.memoryDir)} && ${targetedInstallCommand}`,
      }),
      checkedPaths: location.workspacePaths,
      missingPaths: workspaceCheck.missingPaths,
    };
  }

  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      memoryPath: location.memoryPath,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice AI Memory Protocol memory is not installed"],
        advisory: TOKENJUICE_AI_MEMORY_PROTOCOL_ADVISORY,
        fixCommand: targetedInstallCommand,
      }),
      checkedPaths: location.workspacePaths,
      missingPaths: [],
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel: "AI Memory Protocol memory",
    repairCommand: targetedInstallCommand,
  });
  const malformedMarkerIssues = hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)
    ? ["configured AI Memory Protocol memory has mismatched tokenjuice marker counts; remove unmatched tokenjuice markers before reinstalling"]
    : [];
  const issues = [
    ...markerIssues,
    ...malformedMarkerIssues,
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_AI_MEMORY_PROTOCOL_ID,
          missingIssue: "configured AI Memory Protocol memory is missing the tokenjuice preference id",
        },
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured AI Memory Protocol memory is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured AI Memory Protocol memory is missing the raw escape hatch",
        },
        {
          requiredText: "memory rebuild",
          missingIssue: "configured AI Memory Protocol memory is missing rebuild guidance",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured AI Memory Protocol memory still suggests the full escape hatch",
        },
      ],
    }),
  ];

  return {
    memoryPath: location.memoryPath,
    hasTokenjuiceMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_AI_MEMORY_PROTOCOL_ADVISORY,
      fixCommand: hasMalformedMarkerStructure(existing.text, markerState.completeBlockCount)
        ? `remove unmatched tokenjuice markers from AI Memory Protocol memory, then run ${targetedInstallCommand}`
        : targetedInstallCommand,
    }),
    checkedPaths: location.workspacePaths,
    missingPaths: [],
  };
}
