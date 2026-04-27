import { isFileContentInspectionCommand } from "./command-identity.js";
import { createCompactionMetadata, mergeCompactionMetadata, type CompactionMetadata } from "./compaction-metadata.js";
import { clipMiddleWithHash, parseJsonValue } from "./reduce-utils.js";
import { countTextChars, headTail, normalizeLines, stripAnsi, trimEmptyEdges } from "./text.js";

import type { ToolExecutionInput } from "../types.js";

const LARGE_INSPECTION_MIN_CHARS = 4_000;
const LARGE_INSPECTION_MIN_LINES = 40;
const PACKAGE_LOCK_RE = /\bpackage-lock\.json\b/u;

export type InspectionSummaryReducerId = "generic/package-lock-summary" | "generic/large-document-summary";

export type InspectionSummary = {
  lines: string[];
  matchedReducer: InspectionSummaryReducerId;
  compaction: CompactionMetadata;
};

function buildPackageLockSummary(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }
  const record = value as Record<string, unknown>;
  const packages = typeof record.packages === "object" && record.packages !== null && !Array.isArray(record.packages)
    ? Object.keys(record.packages as Record<string, unknown>)
    : [];
  const dependencies = typeof record.dependencies === "object" && record.dependencies !== null && !Array.isArray(record.dependencies)
    ? Object.keys(record.dependencies as Record<string, unknown>)
    : [];

  const lines = [
    "package-lock summary",
    typeof record.name === "string" ? `name: ${record.name}` : null,
    typeof record.version === "string" ? `version: ${record.version}` : null,
    typeof record.lockfileVersion === "number" ? `lockfileVersion: ${record.lockfileVersion}` : null,
    `packages: ${packages.length}`,
    `dependencies: ${dependencies.length}`,
  ].filter((line): line is string => line !== null);

  const packageSamples = packages.filter(Boolean).slice(0, 12);
  if (packageSamples.length > 0) {
    lines.push(`sample packages: ${packageSamples.join(", ")}`);
  }
  return lines;
}

function buildLargeDocumentSummary(lines: string[], rawText: string): { lines: string[]; compaction: CompactionMetadata } {
  const headings = lines
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+\S/u.test(line))
    .slice(0, 24);
  const excerpt = headTail(lines, 6, 6);
  const clippedHeadingCompactions: CompactionMetadata[] = [];
  const clippedHeadings = headings.map((line) => {
    const clipped = clipMiddleWithHash(line, 180);
    if (clipped.compaction) {
      clippedHeadingCompactions.push(clipped.compaction);
    }
    return `- ${clipped.text}`;
  });
  const clippedExcerptCompactions: CompactionMetadata[] = [];
  const excerptLines = excerpt.lines.map((line) => {
    const clipped = clipMiddleWithHash(line, 180);
    if (clipped.compaction) {
      clippedExcerptCompactions.push(clipped.compaction);
    }
    return clipped.text;
  });

  return {
    lines: [
      `large document summary: ${lines.length} lines, ${countTextChars(rawText)} chars`,
      ...(clippedHeadings.length > 0 ? ["headings:", ...clippedHeadings] : []),
      "excerpt:",
      ...excerptLines,
    ],
    compaction: mergeCompactionMetadata(
      createCompactionMetadata("inspection-large-document-summary"),
      excerpt.compaction,
      ...clippedHeadingCompactions,
      ...clippedExcerptCompactions,
    ),
  };
}

function isLikelyDocumentLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 50) {
    return false;
  }
  if (/^(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|case|try|catch)\b/u.test(trimmed)) {
    return false;
  }
  if (/^[{}()[\].,;:]/u.test(trimmed) || /[{};]$/u.test(trimmed)) {
    return false;
  }
  return /\s/u.test(trimmed);
}

function isLikelyCodeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  return /^(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|case|try|catch|\}|\{|\)|\])/u.test(trimmed)
    || /[{};]$/u.test(trimmed);
}

function isLargeDocumentOutput(lines: string[], rawChars: number): boolean {
  if (rawChars < LARGE_INSPECTION_MIN_CHARS) {
    return false;
  }

  if (lines.length < LARGE_INSPECTION_MIN_LINES) {
    return false;
  }

  const nonEmptyLines = lines.filter((line) => line.trim() !== "");
  const headingCount = nonEmptyLines.filter((line) => /^#{1,6}\s+\S/u.test(line.trim())).length;
  const hasFrontmatter = nonEmptyLines[0]?.trim() === "---"
    && nonEmptyLines.slice(1, 20).some((line) => line.trim() === "---");
  if (headingCount >= 2 || (hasFrontmatter && headingCount >= 1)) {
    return true;
  }

  const documentLines = nonEmptyLines.filter(isLikelyDocumentLine).length;
  const codeLines = nonEmptyLines.filter(isLikelyCodeLine).length;
  return documentLines >= 20
    && documentLines / nonEmptyLines.length >= 0.5
    && codeLines / nonEmptyLines.length < 0.25;
}

export function buildInspectionSummary(input: ToolExecutionInput, rawText: string): InspectionSummary | null {
  const command = input.command ?? "";
  if (PACKAGE_LOCK_RE.test(command)) {
    const lines = buildPackageLockSummary(parseJsonValue(rawText));
    return lines.length > 0
      ? { lines, matchedReducer: "generic/package-lock-summary", compaction: createCompactionMetadata("inspection-package-lock-summary") }
      : null;
  }

  const rawChars = countTextChars(rawText);
  const lines = trimEmptyEdges(normalizeLines(stripAnsi(rawText)));
  if (!isFileContentInspectionCommand(input) || !isLargeDocumentOutput(lines, rawChars)) {
    return null;
  }

  const summary = buildLargeDocumentSummary(lines, rawText);
  return {
    lines: summary.lines,
    matchedReducer: "generic/large-document-summary",
    compaction: summary.compaction,
  };
}
