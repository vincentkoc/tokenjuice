import { loadRules } from "./rules.js";
import { classifyExecution, matchesRule } from "./classify.js";
import { isFileContentInspectionCommand, normalizeExecutionInput } from "./command.js";
import { clampText, clampTextMiddle, countTextChars, dedupeAdjacent, headTail, normalizeLines, pluralize, stripAnsi, trimEmptyEdges } from "./text.js";
import { storeArtifact, storeArtifactMetadata } from "./artifacts.js";

import type { CompactResult, CompiledRule, ReduceOptions, ToolExecutionInput } from "../types.js";

const TINY_OUTPUT_MAX_CHARS = 240;

function compactWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

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

function rewriteGitStatusLines(lines: string[]): string[] {
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

function parseJsonObjectLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function formatGhJsonRecord(record: Record<string, unknown>): string | null {
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

function formatGhTableLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
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

function rewriteGhLines(lines: string[], input: ToolExecutionInput): string[] {
  const nonEmpty = lines.filter((line) => line.trim() !== "");
  if (nonEmpty.length === 0) {
    return [];
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

function buildRawText(input: ToolExecutionInput): string {
  if (input.combinedText) {
    return input.combinedText;
  }

  const stdout = input.stdout ?? "";
  const stderr = input.stderr ?? "";
  if (!stdout) {
    return stderr;
  }
  if (!stderr) {
    return stdout;
  }
  return `${stdout}\n${stderr}`;
}

function applyRule(compiledRule: CompiledRule, input: ToolExecutionInput, rawText: string): { summary: string; facts: Record<string, number> } {
  const rule = compiledRule.rule;
  let lines = normalizeLines(rawText);
  const facts: Record<string, number> = {};

  if (rule.transforms?.stripAnsi) {
    lines = normalizeLines(stripAnsi(lines.join("\n")));
  }

  const outputMatchText = trimEmptyEdges(lines).join("\n");
  const matchedOutput = compiledRule.compiled.outputMatches.find((entry) => entry.pattern.test(outputMatchText));
  if (matchedOutput) {
    return {
      summary: matchedOutput.message,
      facts,
    };
  }

  if (rule.filters?.skipPatterns?.length) {
    lines = lines.filter((line) => !compiledRule.compiled.skipPatterns.some((pattern) => pattern.test(line)));
  }

  let counterLines = [...lines];

  if (rule.filters?.keepPatterns?.length) {
    const kept = lines.filter((line) => compiledRule.compiled.keepPatterns.some((pattern) => pattern.test(line)));
    if (kept.length > 0) {
      lines = kept;
    }
  }

  if (rule.transforms?.trimEmptyEdges) {
    counterLines = trimEmptyEdges(counterLines);
    lines = trimEmptyEdges(lines);
  }

  if (rule.transforms?.dedupeAdjacent) {
    counterLines = dedupeAdjacent(counterLines);
    lines = dedupeAdjacent(lines);
  }

  if (rule.id === "git/status") {
    counterLines = rewriteGitStatusLines(counterLines);
    lines = rewriteGitStatusLines(lines);
  }
  if (rule.id === "cloud/gh") {
    counterLines = rewriteGhLines(counterLines, input);
    lines = rewriteGhLines(lines, input);
  }

  for (const counter of compiledRule.compiled.counters) {
    const pattern = counter.pattern;
    facts[counter.name] = (rule.counterSource === "preKeep" ? counterLines : lines).filter((line) => pattern.test(line)).length;
  }

  if (lines.length === 0 && rule.onEmpty) {
    return {
      summary: rule.onEmpty,
      facts,
    };
  }

  const summarize = input.exitCode && input.exitCode !== 0 && rule.failure?.preserveOnFailure
    ? {
        head: rule.failure.head ?? 6,
        tail: rule.failure.tail ?? 12,
      }
    : {
        head: rule.summarize?.head ?? 6,
        tail: rule.summarize?.tail ?? 6,
      };

  const compacted = headTail(lines, summarize.head, summarize.tail);
  return {
    summary: compacted.join("\n").trim(),
    facts,
  };
}

function buildPassthroughText(input: ToolExecutionInput, rawText: string): string {
  const normalized = trimEmptyEdges(normalizeLines(stripAnsi(rawText))).join("\n").trim();
  if (!normalized) {
    return "(no output)";
  }

  if (input.exitCode && input.exitCode !== 0) {
    return `exit ${input.exitCode}\n${normalized}`;
  }

  return normalized;
}

function formatInline(
  classification: { family: string },
  input: ToolExecutionInput,
  summary: string,
  facts: Record<string, number>,
): string {
  const factParts = Object.entries(facts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => pluralize(count, name));

  const lines: string[] = [];
  if (input.exitCode && input.exitCode !== 0) {
    lines.push(`exit ${input.exitCode}`);
  }

  const shouldIncludeFacts = classification.family === "search"
    || (
      classification.family !== "git-status"
      && classification.family !== "help"
      && summary.includes("omitted")
    )
    || (classification.family === "test-results" && (input.exitCode ?? 0) !== 0);

  if (shouldIncludeFacts && factParts.length > 0) {
    lines.push(factParts.join(", "));
  }
  lines.push(summary);
  return lines.join("\n").trim();
}

function selectInlineText(
  classification: { family: string },
  input: ToolExecutionInput,
  rawText: string,
  compactText: string,
  maxInlineChars: number,
): string {
  if (classification.family === "git-status") {
    return compactText;
  }

  const passthroughText = buildPassthroughText(input, rawText);
  const rawChars = countTextChars(stripAnsi(rawText));
  const compactChars = countTextChars(compactText);
  const passthroughLimit = classification.family === "help" ? maxInlineChars : TINY_OUTPUT_MAX_CHARS;
  if (countTextChars(passthroughText) > passthroughLimit) {
    return compactText;
  }
  if (rawChars <= maxInlineChars && compactChars >= rawChars) {
    return passthroughText;
  }
  if (countTextChars(passthroughText) <= countTextChars(compactText)) {
    return passthroughText;
  }
  return compactText;
}

export async function reduceExecution(input: ToolExecutionInput, opts: ReduceOptions = {}): Promise<CompactResult> {
  const rules = await loadRules({
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  });
  return reduceExecutionWithRules(input, rules, opts);
}

export async function reduceExecutionWithRules(
  input: ToolExecutionInput,
  rules: CompiledRule[],
  opts: ReduceOptions = {},
): Promise<CompactResult> {
  const normalizedInput = normalizeExecutionInput(input);
  const rawText = buildRawText(normalizedInput);
  const measuredRawChars = countTextChars(stripAnsi(rawText));
  const classification = classifyExecution(normalizedInput, rules, opts.classifier);

  if (opts.raw) {
    const rawRef = opts.store
      ? await storeArtifact(
          {
            input: normalizedInput,
            rawText,
            classification,
            stats: {
              rawChars: measuredRawChars,
              reducedChars: measuredRawChars,
              ratio: 1,
            },
          },
          opts.storeDir,
        )
      : undefined;
    if (!opts.store && opts.recordStats) {
      await storeArtifactMetadata(
        {
          input: normalizedInput,
          rawText,
          classification,
          stats: {
            rawChars: measuredRawChars,
            reducedChars: measuredRawChars,
            ratio: 1,
          },
        },
        opts.storeDir,
      );
    }

    return {
      inlineText: rawText,
      ...(rawRef ? { rawRef } : {}),
      stats: {
        rawChars: measuredRawChars,
        reducedChars: measuredRawChars,
        ratio: 1,
      },
      classification,
    };
  }

  if (classification.matchedReducer === "generic/fallback" && isFileContentInspectionCommand(normalizedInput)) {
    if (!opts.store && opts.recordStats) {
      await storeArtifactMetadata(
        {
          input: normalizedInput,
          rawText,
          classification,
          stats: {
            rawChars: measuredRawChars,
            reducedChars: measuredRawChars,
            ratio: 1,
          },
        },
        opts.storeDir,
      );
    }

    return {
      inlineText: rawText,
      stats: {
        rawChars: measuredRawChars,
        reducedChars: measuredRawChars,
        ratio: 1,
      },
      classification,
    };
  }

  const matchedRule = rules.find((rule) => rule.rule.id === classification.matchedReducer)
    ?? rules.find((rule) => rule.rule.id === "generic/fallback");

  if (!matchedRule) {
    throw new Error("missing generic fallback rule");
  }

  const { summary, facts } = applyRule(matchedRule, normalizedInput, rawText);
  const compactText = formatInline(classification, normalizedInput, summary || "(no output)", facts);
  const maxInlineChars = opts.maxInlineChars ?? 1200;
  const selectedText = selectInlineText(classification, normalizedInput, rawText, compactText, maxInlineChars);
  const clamp = classification.family === "help" || selectedText.includes("\n") ? clampTextMiddle : clampText;
  const provisionalInlineText = clamp(selectedText, maxInlineChars);
  const provisionalReducedChars = countTextChars(provisionalInlineText);
  const provisionalStats = {
    rawChars: measuredRawChars,
    reducedChars: provisionalReducedChars,
    ratio: measuredRawChars === 0 ? 1 : provisionalReducedChars / measuredRawChars,
  };
  const rawRef = opts.store
    ? await storeArtifact(
        {
          input: normalizedInput,
          rawText,
          classification,
          stats: {
            rawChars: provisionalStats.rawChars,
            reducedChars: provisionalStats.reducedChars,
            ratio: provisionalStats.ratio,
          },
        },
        opts.storeDir,
      )
    : undefined;
  const inlineText = clamp(selectedText, maxInlineChars);
  const reducedChars = countTextChars(inlineText);
  const stats = {
    rawChars: measuredRawChars,
    reducedChars,
    ratio: measuredRawChars === 0 ? 1 : reducedChars / measuredRawChars,
  };

  if (!opts.store && opts.recordStats) {
    await storeArtifactMetadata(
      {
        input: normalizedInput,
        rawText,
        classification,
        stats,
      },
      opts.storeDir,
    );
  }

  return {
    inlineText,
    ...(summary ? { previewText: summary } : {}),
    ...(Object.keys(facts).length > 0 ? { facts } : {}),
    ...(rawRef ? { rawRef } : {}),
    stats,
    classification,
  };
}

export async function classifyOnly(input: ToolExecutionInput, forcedRuleId?: string) {
  const rules = await loadRules();
  return classifyExecution(normalizeExecutionInput(input), rules, forcedRuleId);
}

export async function findMatchingRule(input: ToolExecutionInput): Promise<CompiledRule | undefined> {
  const rules = await loadRules();
  const normalizedInput = normalizeExecutionInput(input);
  return rules.find((rule) => matchesRule(rule, normalizedInput));
}
