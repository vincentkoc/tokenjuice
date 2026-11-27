import { createCompactionMetadata, NO_COMPACTION_METADATA, type CompactionMetadata } from "./compaction-metadata.js";
import { clampTextWithMetadata, countTextChars, normalizeLines, stripAnsi } from "./text.js";
import type { ToolExecutionInput } from "../types.js";

const FAILURE_LINE = /(?:^|\s)(?:fatal(?:\s+error)?|error|panic|exception|caused by|traceback)(?:[:\s]|$)|\b[A-Z][A-Za-z]*(?:Error|Exception):/iu;
const NESTED_BUILD_FAILURE = /\bnpm\s+(?:ERR!|error\b)|\bundefined reference\b/iu;
const BUILD_CAUSE = /(?:^|\s)(?:fatal\s+error|error(?:\s+TS\d+)?|panic|caused by):|\b[A-Z][A-Za-z]*(?:Error|Exception):/iu;
const BUILD_DETAIL = /\bcompilation terminated\.|^\s*\d*\s*\||^\s*\(?Command (?:timed out|terminated|killed|exited)\b/iu;
// Under -k, GNU Make can report a missing prerequisite without a final "Stop.".
const MAKE_FAILURE = /^(?:g?make(?:\[\d+\])?|[^:\r\n]+:\d+):\s+\*\*\* (?!\[)(?:No rule to make target\b|.+\.\s+Stop\.$)/u;
const BUILD_FAILURE_WRAPPER = /^(?:\s*make(?:\[\d+\])?:\s+\*\*\*.*\bError\s+\d+|.*\bprocess .*did not complete successfully|.*\bfailed to solve:.*\bexit code\b)/iu;

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
    if (makeFailure || ((nestedFailure || BUILD_CAUSE.test(line)) && !BUILD_FAILURE_WRAPPER.test(line))) hasCause = true;
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
