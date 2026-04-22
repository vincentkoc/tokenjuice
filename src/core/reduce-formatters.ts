import { compactWhitespace, clipMiddleWithHash, parseJsonObjectLine, parseJsonValue } from "./reduce-utils.js";

import type { ToolExecutionInput } from "../types.js";

const LONG_SEARCH_LINE_MAX_CHARS = 420;
const LONG_CHANGED_LINE_MAX_CHARS = 260;
const GIT_DIFF_CHANGED_LINES_PER_HUNK = 8;

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

function formatGhJsonRecord(record: Record<string, unknown>): string | null {
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
  const status = typeof record.state === "string" ? record.state
    : typeof record.status === "string" ? record.status
      : typeof record.conclusion === "string" ? record.conclusion
      : null;
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
  return parts.join(" ");
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

function formatGhCommentJsonRecord(record: Record<string, unknown>): string | null {
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

  const location = path ? `${path}${line !== null ? `:${line}` : ""}` : null;
  const parts = [
    "comment",
    id ? `#${id}` : null,
    author ? `@${author}` : null,
    location,
    state ? `[${state}]` : null,
    createdAt,
    `body=${clipMiddleWithHash(compactWhitespace(body), 180)}`,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" ");
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

function formatGhJsonValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return [];
      }
      const formatted = formatGhJsonRecord(entry as Record<string, unknown>);
      return formatted ? [formatted] : [];
    });
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const lines: string[] = [];
  const header = formatGhJsonRecord(record);
  if (header) {
    lines.push(header);
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
        lines.push(formatted);
      }
    }
  }

  return lines;
}

export function rewriteSearchLines(lines: string[]): string[] {
  return lines.map((line) => {
    const match = /^(.+?:\d+(?::|-))(.*)$/u.exec(line);
    if (!match) {
      return clipMiddleWithHash(line, LONG_SEARCH_LINE_MAX_CHARS);
    }
    const [, prefix, rest] = match;
    return `${prefix}${clipMiddleWithHash(rest ?? "", LONG_SEARCH_LINE_MAX_CHARS)}`;
  });
}

export function rewriteGitDiffLines(lines: string[]): string[] {
  const rewritten: string[] = [];
  let emittedChangedLinesInHunk = 0;
  let omittedAdded = 0;
  let omittedRemoved = 0;

  const flushOmitted = () => {
    if (omittedAdded > 0 || omittedRemoved > 0) {
      rewritten.push(`... hunk clipped: ${omittedAdded} added, ${omittedRemoved} removed lines omitted`);
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
      rewritten.push(clipMiddleWithHash(line, LONG_CHANGED_LINE_MAX_CHARS));
      continue;
    }

    if (line.startsWith("+")) {
      omittedAdded += 1;
    } else {
      omittedRemoved += 1;
    }
  }

  flushOmitted();
  return rewritten;
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

export function rewriteGhLines(lines: string[], input: ToolExecutionInput): string[] {
  const nonEmpty = lines.filter((line) => line.trim() !== "");
  if (nonEmpty.length === 0) {
    return [];
  }

  const parsedWholeJson = parseJsonValue(nonEmpty.join("\n"));
  if (parsedWholeJson !== null) {
    const rewrittenWholeJson = formatGhJsonValue(parsedWholeJson);
    if (rewrittenWholeJson.length > 0) {
      return rewrittenWholeJson;
    }
  }

  const parsedJsonLines = nonEmpty.map(parseJsonObjectLine);
  if (parsedJsonLines.every((entry) => entry !== null)) {
    const rewritten = parsedJsonLines
      .map((entry) => formatGhJsonRecord(entry!))
      .filter((line): line is string => typeof line === "string" && line.length > 0);
    if (rewritten.length > 0) {
      return rewritten;
    }
  }

  if ((input.argv ?? [])[0] === "gh") {
    return lines.map(formatGhTableLine);
  }

  return lines;
}
