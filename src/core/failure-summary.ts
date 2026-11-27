import { createCompactionMetadata, NO_COMPACTION_METADATA, type CompactionMetadata } from "./compaction-metadata.js";
import { clampTextWithMetadata, countTextChars, normalizeLines, stripAnsi } from "./text.js";
import type { ToolExecutionInput } from "../types.js";

const FAILURE_LINE = /(?:^|\s)(?:fatal(?:\s+error)?|error|panic|exception|caused by|traceback)(?:[:\s]|$)|\b[A-Z][A-Za-z]*(?:Error|Exception):/iu;
const NESTED_BUILD_FAILURE = /\bnpm\s+(?:ERR!|error\b)|\bundefined reference\b/iu;
const BUILD_CAUSE = /(?:^|\s)(?:fatal\s+error|error(?:\s+TS\d+)?|panic|caused by):|\b[A-Z][A-Za-z]*(?:Error|Exception):/iu;
const BUILD_DETAIL = /\bcompilation terminated\.|^\s*\d*\s*\||^\s*\(?Command (?:timed out|terminated|killed|exited)\b/iu;
// Under -k, GNU Make can report a missing prerequisite without a final "Stop.".
const MAKE_FAILURE = /^(?:g?make(?:\[\d+\])?|[^:\r\n]+:\d+):\s+\*\*\* (?!\[)(?:No rule to make target\b|.+\.\s+Stop\.$)/u;

function isUnicodeWordChar(char: string | undefined): boolean {
  return char !== undefined && /\w/u.test(char);
}

function hasUnicodeWordBoundary(text: string, index: number): boolean {
  return isUnicodeWordChar(text[index - 1]) !== isUnicodeWordChar(text[index]);
}

function indexOfIgnoreCase(haystack: string, lower: string | null, needle: string, from = 0): number {
  if (lower) return lower.indexOf(needle, from);
  const needleLength = needle.length;
  for (let index = from; index <= haystack.length - needleLength; index += 1) {
    if (haystack.slice(index, index + needleLength).toLowerCase() === needle) return index;
  }
  return -1;
}

function isMakeErrorWrapper(line: string, lower: string | null): boolean {
  let index = 0;
  while (index < line.length && /\s/u.test(line[index]!)) index += 1;
  if (indexOfIgnoreCase(line, lower, "make", index) !== index) return false;
  index += 4;
  if (line[index] === "[") {
    index += 1;
    if (index >= line.length || !/\d/u.test(line[index]!)) return false;
    while (index < line.length && /\d/u.test(line[index]!)) index += 1;
    if (line[index] !== "]") return false;
    index += 1;
  }
  if (line[index] !== ":") return false;
  index += 1;
  if (index >= line.length || !/\s/u.test(line[index]!)) return false;
  while (index < line.length && /\s/u.test(line[index]!)) index += 1;
  if (!line.startsWith("***", index)) return false;
  let search = index + 3;
  while (search < line.length) {
    const errorAt = indexOfIgnoreCase(line, lower, "error", search);
    if (errorAt === -1) return false;
    if (hasUnicodeWordBoundary(line, errorAt)) {
      let after = errorAt + 5;
      if (after < line.length && /\s/u.test(line[after]!)) {
        while (after < line.length && /\s/u.test(line[after]!)) after += 1;
        if (after < line.length && /\d/u.test(line[after]!)) return true;
      }
    }
    search = errorAt + 1;
  }
  return false;
}

function hasBoundedPhrase(line: string, lower: string | null, phrase: string, from: number): boolean {
  let search = from;
  while (search <= line.length - phrase.length) {
    const at = indexOfIgnoreCase(line, lower, phrase, search);
    if (at === -1) return false;
    if (hasUnicodeWordBoundary(line, at) && hasUnicodeWordBoundary(line, at + phrase.length)) return true;
    search = at + 1;
  }
  return false;
}

function isProcessFailureWrapper(line: string, lower: string | null): boolean {
  const needle = "process ";
  let search = 0;
  while (search <= line.length - needle.length) {
    const at = indexOfIgnoreCase(line, lower, needle, search);
    if (at === -1) return false;
    if (hasUnicodeWordBoundary(line, at)) {
      return indexOfIgnoreCase(line, lower, "did not complete successfully", at + needle.length) !== -1;
    }
    search = at + 1;
  }
  return false;
}

function isFailedToSolveWrapper(line: string, lower: string | null): boolean {
  const needle = "failed to solve:";
  let search = 0;
  while (search <= line.length - needle.length) {
    const at = indexOfIgnoreCase(line, lower, needle, search);
    if (at === -1) return false;
    if (hasUnicodeWordBoundary(line, at)) {
      return hasBoundedPhrase(line, lower, "exit code", at + needle.length);
    }
    search = at + 1;
  }
  return false;
}

function isBuildFailureWrapper(line: string): boolean {
  const lower = line.toLowerCase();
  const aligned = lower.length === line.length ? lower : null;
  return isMakeErrorWrapper(line, aligned)
    || isProcessFailureWrapper(line, aligned)
    || isFailedToSolveWrapper(line, aligned);
}


/** For build failures, only emit a selection when all recognized diagnostic rows fit intact. */
export function buildNamedBuildFailureSummary(
  exitCode: number | undefined,
  rawText: string,
  maxChars: number,
  noOmit = false,
): { text: string; compaction: CompactionMetadata } | null {
  if (noOmit || exitCode === undefined || !Number.isInteger(exitCode) || exitCode === 0) return null;
  const textWithoutAnsi = stripAnsi(rawText);
  const lines = normalizeLines(textWithoutAnsi);
  const diagnostics = new Set<number>();
  let hasCause = false;
  for (const [index, line] of lines.entries()) {
    const nestedFailure = NESTED_BUILD_FAILURE.test(line);
    const makeFailure = MAKE_FAILURE.test(line);
    if (makeFailure || ((nestedFailure || BUILD_CAUSE.test(line)) && !isBuildFailureWrapper(line))) hasCause = true;
    if (makeFailure || nestedFailure || FAILURE_LINE.test(line) || BUILD_DETAIL.test(line)) diagnostics.add(index);
  }
  if (!hasCause) return null;

  const header = "[exit " + exitCode + "] selected build failure details (original line numbers):\n";
  const footer = "\n[other output omitted]";
  let remaining = maxChars - countTextChars(header + footer);
  const row = (index: number) => (index + 1) + ": " + lines[index];
  for (const index of diagnostics) {
    remaining -= countTextChars(row(index)) + 1;
    if (remaining < 0) return null;
  }
  const selection = new Set(diagnostics);
  for (const index of diagnostics) {
    for (const neighbor of [index - 1, index + 1]) {
      if (!lines[neighbor] || selection.has(neighbor)) continue;
      const cost = countTextChars(row(neighbor)) + 1;
      if (cost > remaining) continue;
      selection.add(neighbor);
      remaining -= cost;
    }
  }
  const text = header + [...selection].sort((left, right) => left - right).map(row).join("\n") + footer;
  if (countTextChars(text) >= countTextChars(textWithoutAnsi)) return null;
  return { text, compaction: createCompactionMetadata("failure-signal-filter") };
}

/** Prioritize diagnostic lines before spending the remaining budget on context. */
export function buildFailureSummary(
  input: ToolExecutionInput,
  rawText: string,
  maxChars: number,
  noOmit = false,
): { text: string; compaction: CompactionMetadata } | null {
  if (noOmit || typeof input.exitCode !== "number" || input.exitCode === 0) return null;
  const text = stripAnsi(rawText);
  const lines = normalizeLines(text);
  if (lines.length <= 32) return null;
  const signals = lines.flatMap((line, index) => FAILURE_LINE.test(line) ? [index] : []);
  if (signals.length === 0) return null;
  const fullText = `[exit ${input.exitCode}]\n${text}`;
  if (countTextChars(fullText) <= maxChars) return { text: fullText, compaction: NO_COMPACTION_METADATA };

  const header = `[exit ${input.exitCode}] selected failure details (original line numbers):\n`;
  const footer = "\n[other output omitted]";
  let remaining = maxChars - countTextChars(header + footer);
  if (remaining < 32) return null;
  const diagnosticRows = signals.map((index) => {
    const row = `${index + 1}: ${lines[index]}`;
    const cost = countTextChars(row) + 1;
    return { index, row, cost, minimum: Math.min(cost, 64) };
  });
  let candidates = diagnosticRows;
  if (diagnosticRows.reduce((sum, row) => sum + row.minimum, 0) > remaining) {
    // When even short excerpts cannot all fit, retain both ends of the failure.
    candidates = [];
    let reserved = 0;
    for (let offset = 0; offset < diagnosticRows.length; offset++) {
      const index = offset % 2 === 0 ? offset / 2 : diagnosticRows.length - 1 - Math.floor(offset / 2);
      const row = diagnosticRows[index]!;
      if (reserved + row.minimum <= remaining) {
        candidates.push(row);
        reserved += row.minimum;
      }
    }
    candidates.sort((left, right) => left.index - right.index);
  }
  const selected = new Map<number, string>();
  let reserved = candidates.reduce((sum, row) => sum + row.minimum, 0);
  for (const { index, row, cost, minimum } of candidates) {
    reserved -= minimum;
    const allowance = remaining - reserved;
    if (cost <= allowance) {
      selected.set(index, row);
      remaining -= cost;
    } else {
      const clipped = clampTextWithMetadata(row, allowance - 1).text;
      selected.set(index, clipped);
      remaining -= countTextChars(clipped) + 1;
    }
  }
  for (const index of signals) {
    if (!selected.has(index)) continue;
    for (const neighbor of [index - 1, index + 1]) {
      if (neighbor < 0 || neighbor >= lines.length || selected.has(neighbor)) continue;
      const row = `${neighbor + 1}: ${lines[neighbor]}`;
      const cost = countTextChars(row) + 1;
      if (cost <= remaining) {
        selected.set(neighbor, row);
        remaining -= cost;
      }
    }
  }
  return {
    text: header + [...selected].sort(([left], [right]) => left - right).map(([, row]) => row).join("\n") + footer,
    compaction: createCompactionMetadata("failure-signal-filter"),
  };
}
