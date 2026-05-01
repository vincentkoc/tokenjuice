import { createCompactionMetadata, mergeCompactionMetadata, type CompactionMetadata } from "./compaction-metadata.js";
import { compactWhitespace, clipMiddleWithHash, parseJsonObjectLine, parseJsonValue } from "./reduce-utils.js";

import type { ToolExecutionInput } from "../types.js";

const LONG_SEARCH_LINE_MAX_CHARS = 420;
const LONG_CHANGED_LINE_MAX_CHARS = 260;
const GIT_DIFF_CHANGED_LINES_PER_HUNK = 8;
const GH_RUN_LOG_SIGNAL_CONTEXT_LINES = 1;
const GH_RUN_LOG_SIGNAL_PATTERN =
  /(?:##\[error\]|::error|(?:^|[\s|])(?:FAIL|FAILED|FAILURE)(?:[\s|:]|$)|\bAssertionError\b|\bError:\s+Process completed with exit code\b|\berror\s+TS\d+\b|\bELIFECYCLE\b|\bCommand failed\b|\bfailed with exit code\b|\bfailed in build-artifacts\b|\bERR_[A-Z0-9_]+\b)/iu;
const MAX_GH_STATUS_CHECK_ATTENTION_LINES = 12;

function rewriteGitStatusLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("On branch ")) {
    return null;
  }
  if (/^and have \d+ and \d+ different commits each/u.test(trimmed)) {
    return null;
  }
  if (/^(?:no changes added to commit|nothing added to commit but untracked files present)/u.test(trimmed)) {
    return null;
  }
  if (/^\(use "git .+"\)$/u.test(trimmed) || /^use "git .+" to .+/u.test(trimmed)) {
    return null;
  }
  if (trimmed === "Changes not staged for commit:") {
    return "Changes not staged:";
  }
  if (trimmed === "Changes to be committed:") {
    return "Staged changes:";
  }
  if (trimmed === "Untracked files:") {
    return "Untracked files:";
  }
  if (/^\s*modified:\s+/u.test(line)) {
    return `M: ${line.replace(/^\s*modified:\s+/u, "").trim()}`;
  }
  if (/^\s*new file:\s+/u.test(line)) {
    return `A: ${line.replace(/^\s*new file:\s+/u, "").trim()}`;
  }
  if (/^\s*deleted:\s+/u.test(line)) {
    return `D: ${line.replace(/^\s*deleted:\s+/u, "").trim()}`;
  }
  if (/^\s*renamed:\s+/u.test(line)) {
    return `R: ${line.replace(/^\s*renamed:\s+/u, "").trim()}`;
  }
  if (/^\?\?\s+/u.test(trimmed)) {
    return `?? ${trimmed.replace(/^\?\?\s+/u, "").trim()}`;
  }

  const porcelainMatch = line.match(/^([ MADRCU?!]{2})\s+(.+)$/u);
  if (porcelainMatch) {
    const status = porcelainMatch[1]!.trim().replace(/\?/gu, "??");
    const path = porcelainMatch[2]!.trim();
    const code = status === "" ? "M" : status[0] === "?" ? "??" : status[0]!;
    return `${code}: ${path}`;
  }

  return trimmed;
}

export function rewriteGitStatusLines(lines: string[]): string[] {
  let section: "staged" | "unstaged" | "untracked" | null = null;
  const rewritten = lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "Changes not staged for commit:") {
        section = "unstaged";
      } else if (trimmed === "Changes to be committed:") {
        section = "staged";
      } else if (trimmed === "Untracked files:") {
        section = "untracked";
      }

      if (section === "untracked" && /^\s{2,}\S/u.test(line) && !/^\s*(?:modified:|new file:|deleted:|renamed:)/u.test(line)) {
        return `?? ${trimmed}`;
      }

      return rewriteGitStatusLine(line);
    })
    .filter((line): line is string => line !== null);

  const collapsed: string[] = [];
  for (const line of rewritten) {
    if (line === "" && collapsed[collapsed.length - 1] === "") {
      continue;
    }
    collapsed.push(line);
  }
  return collapsed;
}

function extractGhLabelNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      return entry ? [entry] : [];
    }
    if (typeof entry === "object" && entry !== null && "name" in entry && typeof entry.name === "string") {
      return entry.name ? [entry.name] : [];
    }
    return [];
  });
}

function extractGhCommentCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (typeof value === "object" && value !== null && "totalCount" in value && typeof value.totalCount === "number") {
    return value.totalCount;
  }
  return null;
}

function parseIsoTimestamp(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "";
  }

  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}m${String(remainingSeconds).padStart(2, "0")}s`;
}

function extractGhDuration(record: Record<string, unknown>): string | null {
  if (typeof record.durationSec === "number" && Number.isFinite(record.durationSec) && record.durationSec >= 0) {
    return formatDuration(record.durationSec);
  }
  if (typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds) && record.durationSeconds >= 0) {
    return formatDuration(record.durationSeconds);
  }

  const startedAt = parseIsoTimestamp(record.startedAt);
  const completedAt = parseIsoTimestamp(record.completedAt);
  if (startedAt !== null && completedAt !== null && completedAt >= startedAt) {
    return formatDuration((completedAt - startedAt) / 1000);
  }

  const createdAt = parseIsoTimestamp(record.createdAt);
  const updatedAt = parseIsoTimestamp(record.updatedAt);
  if (createdAt !== null && updatedAt !== null && updatedAt >= createdAt) {
    return formatDuration((updatedAt - createdAt) / 1000);
  }

  return null;
}

function formatGhJsonRecord(record: Record<string, unknown>): { line: string; compaction?: CompactionMetadata } | null {
  const comment = formatGhCommentJsonRecord(record);
  if (comment) {
    return comment;
  }

  const numericId = typeof record.number === "number" ? record.number
    : typeof record.databaseId === "number" ? record.databaseId
      : null;
  const title = typeof record.title === "string" ? record.title
    : typeof record.displayTitle === "string" ? record.displayTitle
      : typeof record.name === "string" ? record.name
        : typeof record.workflowName === "string" ? record.workflowName
          : null;
  if (!title) {
    return null;
  }

  const labels = extractGhLabelNames(record.labels).slice(0, 3);
  const comments = extractGhCommentCount(record.comments);
  const branch = typeof record.headBranch === "string" ? record.headBranch
    : typeof record.headRefName === "string" ? record.headRefName
      : null;
  const status = getGhString(record, "state")
    ?? getGhString(record, "conclusion")
    ?? getGhString(record, "status");
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt.slice(0, 10) : null;
  const duration = extractGhDuration(record);

  const parts: string[] = [];
  if (numericId !== null) {
    parts.push(`#${numericId}`);
  }
  parts.push(compactWhitespace(title));
  if (status) {
    parts.push(`[${status}]`);
  }
  if (branch) {
    parts.push(`(${compactWhitespace(branch)})`);
  }
  if (duration) {
    parts.push(duration);
  }
  if (typeof comments === "number" && comments > 0) {
    parts.push(`${comments}c`);
  }
  if (labels.length > 0) {
    parts.push(`{${labels.join(", ")}}`);
  }
  if (updatedAt) {
    parts.push(updatedAt);
  }
  return { line: parts.join(" ") };
}

function getNestedLogin(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && "login" in value && typeof value.login === "string") {
    return value.login;
  }
  return null;
}

function formatGhCommentJsonRecord(record: Record<string, unknown>): { line: string; compaction?: CompactionMetadata } | null {
  const body = typeof record.body === "string" ? record.body
    : typeof record.bodyText === "string" ? record.bodyText
      : null;
  if (!body) {
    return null;
  }

  const id = typeof record.id === "string" ? record.id
    : typeof record.id === "number" ? String(record.id)
    : typeof record.databaseId === "number" ? String(record.databaseId)
      : typeof record.node_id === "string" ? record.node_id
        : null;
  const author = getNestedLogin(record.author)
    ?? getNestedLogin(record.user)
    ?? getNestedLogin(record.actor);
  const path = typeof record.path === "string" ? record.path : null;
  const line = typeof record.line === "number" ? record.line
    : typeof record.originalLine === "number" ? record.originalLine
      : typeof record.startLine === "number" ? record.startLine
        : null;
  const state = typeof record.state === "string" ? record.state : null;
  const createdAt = typeof record.createdAt === "string" ? record.createdAt.slice(0, 10)
    : typeof record.created_at === "string" ? record.created_at.slice(0, 10)
      : null;
  const clippedBody = clipMiddleWithHash(compactWhitespace(body), 180);

  const location = path ? `${path}${line !== null ? `:${line}` : ""}` : null;
  const parts = [
    "comment",
    id ? `#${id}` : null,
    author ? `@${author}` : null,
    location,
    state ? `[${state}]` : null,
    createdAt,
    `body=${clippedBody.text}`,
  ].filter((part): part is string => Boolean(part));
  return {
    line: parts.join(" "),
    ...(clippedBody.compaction ? { compaction: clippedBody.compaction } : {}),
  };
}

function getGhCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "object" && value !== null && "nodes" in value && Array.isArray(value.nodes)) {
    return value.nodes;
  }
  return [];
}

function getGhString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function normalizeGhStatus(value: string | null): string | null {
  return value ? value.trim().toUpperCase().replace(/-/gu, "_") : null;
}

function isGhStatusCheckOk(record: Record<string, unknown>): boolean {
  const conclusion = normalizeGhStatus(getGhString(record, "conclusion"));
  if (conclusion) {
    return conclusion === "SUCCESS" || conclusion === "SKIPPED" || conclusion === "NEUTRAL";
  }

  const state = normalizeGhStatus(getGhString(record, "state"));
  if (state) {
    return state === "SUCCESS";
  }

  return false;
}

function formatGhStatusCheckLine(record: Record<string, unknown>): string | null {
  const name = getGhString(record, "name", "context", "workflowName");
  if (!name) {
    return null;
  }

  const conclusion = normalizeGhStatus(getGhString(record, "conclusion", "state"));
  const status = normalizeGhStatus(getGhString(record, "status"));
  const workflow = getGhString(record, "workflowName");
  const duration = extractGhDuration(record);
  const detailsUrl = getGhString(record, "detailsUrl", "targetUrl");
  const parts = [
    "check",
    compactWhitespace(name),
    conclusion ? `[${conclusion}]` : status ? `[${status}]` : null,
    workflow && workflow !== name ? `workflow=${compactWhitespace(workflow)}` : null,
    duration ? `duration=${duration}` : null,
    detailsUrl ? `url=${detailsUrl}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" ");
}

function formatGhStatusCheckRollup(value: unknown): { lines: string[]; compaction?: CompactionMetadata } {
  const records = getGhCollection(value)
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry));
  if (records.length === 0) {
    return { lines: [] };
  }

  const attention = records.filter((record) => !isGhStatusCheckOk(record));
  const okCount = records.length - attention.length;
  const lines = [`status checks: ${okCount} ok, ${attention.length} attention`];
  const listed = attention.slice(0, MAX_GH_STATUS_CHECK_ATTENTION_LINES);
  for (const record of listed) {
    const line = formatGhStatusCheckLine(record);
    if (line) {
      lines.push(line);
    }
  }

  const omittedAttention = attention.length - listed.length;
  if (omittedAttention > 0) {
    lines.push(`... ${omittedAttention} attention checks omitted ...`);
  }

  return {
    lines,
    ...(okCount > 0 || omittedAttention > 0
      ? { compaction: createCompactionMetadata("github-status-check-rollup-omission") }
      : {}),
  };
}

function formatGhJsonValue(value: unknown): { lines: string[]; compaction?: CompactionMetadata } {
  const compactions: CompactionMetadata[] = [];
  if (Array.isArray(value)) {
    const lines = value.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return [];
      }
      const formatted = formatGhJsonRecord(entry as Record<string, unknown>);
      if (!formatted) {
        return [];
      }
      if (formatted.compaction) {
        compactions.push(formatted.compaction);
      }
      return [formatted.line];
    });

    return {
      lines,
      ...(compactions.length > 0 ? { compaction: mergeCompactionMetadata(...compactions) } : {}),
    };
  }

  if (typeof value !== "object" || value === null) {
    return { lines: [] };
  }

  const record = value as Record<string, unknown>;
  const lines: string[] = [];
  const header = formatGhJsonRecord(record);
  if (header) {
    lines.push(header.line);
    if (header.compaction) {
      compactions.push(header.compaction);
    }
  }

  const statusCheckRollup = formatGhStatusCheckRollup(record.statusCheckRollup);
  if (statusCheckRollup.lines.length > 0) {
    lines.push(...statusCheckRollup.lines);
    if (statusCheckRollup.compaction) {
      compactions.push(statusCheckRollup.compaction);
    }
  }

  for (const collectionKey of ["jobs", "workflowRuns", "items", "artifacts", "comments", "reviews", "reviewThreads"]) {
    const collection = getGhCollection(record[collectionKey]);
    if (collection.length === 0) {
      continue;
    }

    for (const entry of collection) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        continue;
      }
      const formatted = formatGhJsonRecord(entry as Record<string, unknown>);
      if (formatted) {
        lines.push(formatted.line);
        if (formatted.compaction) {
          compactions.push(formatted.compaction);
        }
      }
    }
  }

  return {
    lines,
    ...(compactions.length > 0 ? { compaction: mergeCompactionMetadata(...compactions) } : {}),
  };
}

export function rewriteSearchLines(lines: string[]): { lines: string[]; compaction?: CompactionMetadata } {
  const compactions: CompactionMetadata[] = [];
  const rewritten = lines.map((line) => {
    const match = /^(.+?:\d+(?::|-))(.*)$/u.exec(line);
    if (!match) {
      const clipped = clipMiddleWithHash(line, LONG_SEARCH_LINE_MAX_CHARS);
      if (clipped.compaction) {
        compactions.push(clipped.compaction);
      }
      return clipped.text;
    }
    const [, prefix, rest] = match;
    const clipped = clipMiddleWithHash(rest ?? "", LONG_SEARCH_LINE_MAX_CHARS);
    if (clipped.compaction) {
      compactions.push(clipped.compaction);
    }
    return `${prefix}${clipped.text}`;
  });

  return {
    lines: rewritten,
    ...(compactions.length > 0 ? { compaction: mergeCompactionMetadata(...compactions) } : {}),
  };
}

export function rewriteGitDiffLines(lines: string[]): { lines: string[]; compaction?: CompactionMetadata } {
  const rewritten: string[] = [];
  const compactions: CompactionMetadata[] = [];
  let emittedChangedLinesInHunk = 0;
  let omittedAdded = 0;
  let omittedRemoved = 0;

  const flushOmitted = () => {
    if (omittedAdded > 0 || omittedRemoved > 0) {
      rewritten.push(`... hunk clipped: ${omittedAdded} added, ${omittedRemoved} removed lines omitted`);
      compactions.push(createCompactionMetadata("git-diff-hunk-clip"));
      omittedAdded = 0;
      omittedRemoved = 0;
    }
  };

  for (const line of lines) {
    if (line.startsWith("@@ ")) {
      flushOmitted();
      emittedChangedLinesInHunk = 0;
      rewritten.push(line);
      continue;
    }
    if (line.startsWith("diff --git ")) {
      flushOmitted();
      emittedChangedLinesInHunk = 0;
      rewritten.push(line);
      continue;
    }

    const isChangedLine = line.startsWith("+") || line.startsWith("-");
    if (!isChangedLine || line.startsWith("+++") || line.startsWith("---")) {
      rewritten.push(line);
      continue;
    }

    if (emittedChangedLinesInHunk < GIT_DIFF_CHANGED_LINES_PER_HUNK) {
      emittedChangedLinesInHunk += 1;
      const clipped = clipMiddleWithHash(line, LONG_CHANGED_LINE_MAX_CHARS);
      if (clipped.compaction) {
        compactions.push(clipped.compaction);
      }
      rewritten.push(clipped.text);
      continue;
    }

    if (line.startsWith("+")) {
      omittedAdded += 1;
    } else {
      omittedRemoved += 1;
    }
  }

  flushOmitted();
  return {
    lines: rewritten,
    ...(compactions.length > 0 ? { compaction: mergeCompactionMetadata(...compactions) } : {}),
  };
}

function formatGhTableLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }

  const tabColumns = line.split("\t").map((part) => compactWhitespace(part)).filter(Boolean);
  if (tabColumns.length >= 4 && /^\d{4}-\d{2}-\d{2}T/u.test(tabColumns[2] ?? "")) {
    const [job, step, , ...rest] = tabColumns;
    const parts = [job, step, compactWhitespace(rest.join(" "))].filter(Boolean);
    return parts.join(" | ");
  }

  const columns = trimmed.split(/\s{2,}|\t+/u).map((part) => compactWhitespace(part)).filter(Boolean);
  if (columns.length >= 2 && /^\d+$/u.test(columns[0] ?? "")) {
    const number = columns[0]!;
    const title = columns[1]!;
    const state = columns.length >= 4 ? columns.at(-1) : null;
    const context = columns.length >= 3 ? columns.slice(2, state ? -1 : undefined).join(" ") : null;
    const parts = [`#${number}`, title];
    if (state) {
      parts.push(`[${state}]`);
    }
    if (context) {
      parts.push(`(${context})`);
    }
    return parts.join(" ");
  }

  return compactWhitespace(trimmed);
}

function isGhRunLogCommand(input: ToolExecutionInput): boolean {
  const argv = input.argv ?? [];
  return argv[0] === "gh"
    && argv.includes("run")
    && argv.includes("view")
    && argv.some((arg) => arg === "--log" || arg === "--log-failed" || arg.startsWith("--log="));
}

function formatOmittedGhLogLines(count: number): string {
  return `... ${count} non-signal log lines omitted ...`;
}

function filterGhRunLogSignalLines(lines: string[]): { lines: string[]; compaction?: CompactionMetadata } {
  const signalIndexes = lines
    .map((line, index) => GH_RUN_LOG_SIGNAL_PATTERN.test(line) ? index : -1)
    .filter((index) => index >= 0);

  if (signalIndexes.length === 0) {
    return { lines };
  }

  const ranges: Array<{ start: number; end: number }> = [];
  for (const index of signalIndexes) {
    const start = Math.max(0, index - GH_RUN_LOG_SIGNAL_CONTEXT_LINES);
    const end = Math.min(lines.length - 1, index + GH_RUN_LOG_SIGNAL_CONTEXT_LINES);
    const previous = ranges.at(-1);
    if (previous && start <= previous.end + 1) {
      previous.end = Math.max(previous.end, end);
      continue;
    }
    ranges.push({ start, end });
  }

  const rewritten: string[] = [];
  let cursor = 0;
  for (const range of ranges) {
    const omittedBefore = range.start - cursor;
    if (omittedBefore > 0) {
      rewritten.push(formatOmittedGhLogLines(omittedBefore));
    }
    rewritten.push(...lines.slice(range.start, range.end + 1));
    cursor = range.end + 1;
  }

  const omittedAfter = lines.length - cursor;
  if (omittedAfter > 0) {
    rewritten.push(formatOmittedGhLogLines(omittedAfter));
  }

  if (rewritten.length >= lines.length) {
    return { lines };
  }

  return {
    lines: rewritten,
    compaction: createCompactionMetadata("github-actions-log-signal-filter"),
  };
}

export function rewriteGhLines(lines: string[], input: ToolExecutionInput): { lines: string[]; compaction?: CompactionMetadata } {
  const nonEmpty = lines.filter((line) => line.trim() !== "");
  if (nonEmpty.length === 0) {
    return { lines: [] };
  }

  const parsedWholeJson = parseJsonValue(nonEmpty.join("\n"));
  if (parsedWholeJson !== null) {
    const rewrittenWholeJson = formatGhJsonValue(parsedWholeJson);
    if (rewrittenWholeJson.lines.length > 0) {
      return rewrittenWholeJson;
    }
  }

  const parsedJsonLines = nonEmpty.map(parseJsonObjectLine);
  if (parsedJsonLines.every((entry) => entry !== null)) {
    const compactions: CompactionMetadata[] = [];
    const rewritten = parsedJsonLines
      .map((entry) => formatGhJsonRecord(entry!))
      .flatMap((line) => {
        if (!line || line.line.length === 0) {
          return [];
        }
        if (line.compaction) {
          compactions.push(line.compaction);
        }
        return [line.line];
      });
    if (rewritten.length > 0) {
      return {
        lines: rewritten,
        ...(compactions.length > 0 ? { compaction: mergeCompactionMetadata(...compactions) } : {}),
      };
    }
  }

  if (isGithubCliCommand((input.argv ?? [])[0])) {
    const formattedLines = lines.map(formatGhTableLine);
    if (isGhRunLogCommand(input)) {
      return filterGhRunLogSignalLines(formattedLines);
    }
    return { lines: formattedLines };
  }

  return { lines };
}

function isGithubCliCommand(command: string | undefined): boolean {
  return command === "gh" || command === "ghx";
}
