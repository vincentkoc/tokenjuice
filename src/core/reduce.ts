import { loadRules } from "./rules.js";
import { classifyExecution, matchesRule } from "./classify.js";
import { clampText, countTextChars, dedupeAdjacent, headTail, normalizeLines, pluralize, stripAnsi, trimEmptyEdges } from "./text.js";
import { storeArtifact } from "./artifacts.js";

import type { CompactResult, CompiledRule, ReduceOptions, ToolExecutionInput } from "../types.js";

const TINY_OUTPUT_MAX_CHARS = 240;

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

  if (rule.filters?.skipPatterns?.length) {
    lines = lines.filter((line) => !compiledRule.compiled.skipPatterns.some((pattern) => pattern.test(line)));
  }

  if (rule.filters?.keepPatterns?.length) {
    const kept = lines.filter((line) => compiledRule.compiled.keepPatterns.some((pattern) => pattern.test(line)));
    if (kept.length > 0) {
      lines = kept;
    }
  }

  if (rule.transforms?.trimEmptyEdges) {
    lines = trimEmptyEdges(lines);
  }

  if (rule.transforms?.dedupeAdjacent) {
    lines = dedupeAdjacent(lines);
  }

  for (const counter of compiledRule.compiled.counters) {
    const pattern = counter.pattern;
    facts[counter.name] = lines.filter((line) => pattern.test(line)).length;
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
  if (factParts.length > 0) {
    lines.push(factParts.join(", "));
  }
  lines.push(summary);
  return lines.join("\n").trim();
}

function selectInlineText(
  input: ToolExecutionInput,
  rawText: string,
  compactText: string,
): string {
  const passthroughText = buildPassthroughText(input, rawText);
  if (passthroughText.length > TINY_OUTPUT_MAX_CHARS) {
    return compactText;
  }
  if (passthroughText.length <= compactText.length) {
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
  const classification = classifyExecution(input, rules, opts.classifier);
  const rawText = buildRawText(input);
  const measuredRawChars = countTextChars(stripAnsi(rawText));
  const matchedRule = rules.find((rule) => rule.rule.id === classification.matchedReducer)
    ?? rules.find((rule) => rule.rule.id === "generic/fallback");

  if (!matchedRule) {
    throw new Error("missing generic fallback rule");
  }

  const { summary, facts } = applyRule(matchedRule, input, rawText);
  const compactText = formatInline(input, summary || "(no output)", facts);
  const selectedText = selectInlineText(input, rawText, compactText);
  const provisionalInlineText = clampText(selectedText, opts.maxInlineChars ?? 1200);
  const provisionalReducedChars = countTextChars(provisionalInlineText);
  const provisionalStats = {
    rawChars: measuredRawChars,
    reducedChars: provisionalReducedChars,
    ratio: measuredRawChars === 0 ? 1 : provisionalReducedChars / measuredRawChars,
  };
  const rawRef = opts.store
    ? await storeArtifact(
        {
          input,
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
  const inlineText = clampText(selectedText, opts.maxInlineChars ?? 1200);
  const reducedChars = countTextChars(inlineText);
  const stats = {
    rawChars: measuredRawChars,
    reducedChars,
    ratio: measuredRawChars === 0 ? 1 : reducedChars / measuredRawChars,
  };

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
  return classifyExecution(input, rules, forcedRuleId);
}

export async function findMatchingRule(input: ToolExecutionInput): Promise<CompiledRule | undefined> {
  const rules = await loadRules();
  return rules.find((rule) => matchesRule(rule, input));
}
