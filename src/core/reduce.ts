import { loadBuiltinRules } from "./rules.js";
import { classifyExecution, matchesRule } from "./classify.js";
import { clampText, dedupeAdjacent, headTail, normalizeLines, pluralize, stripAnsi, trimEmptyEdges } from "./text.js";
import { storeArtifact } from "./artifacts.js";

import type { CompactResult, JsonRule, ReduceOptions, ToolExecutionInput } from "../types.js";

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

function applyRule(rule: JsonRule, input: ToolExecutionInput, rawText: string): { summary: string; facts: Record<string, number> } {
  let lines = normalizeLines(rawText);
  const facts: Record<string, number> = {};

  if (rule.transforms?.stripAnsi) {
    lines = normalizeLines(stripAnsi(lines.join("\n")));
  }

  if (rule.filters?.skipPatterns?.length) {
    const skipPatterns = rule.filters.skipPatterns.map((pattern) => new RegExp(pattern, "u"));
    lines = lines.filter((line) => !skipPatterns.some((pattern) => pattern.test(line)));
  }

  if (rule.filters?.keepPatterns?.length) {
    const keepPatterns = rule.filters.keepPatterns.map((pattern) => new RegExp(pattern, "u"));
    const kept = lines.filter((line) => keepPatterns.some((pattern) => pattern.test(line)));
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

  for (const counter of rule.counters ?? []) {
    const pattern = new RegExp(counter.pattern, counter.flags ? `u${counter.flags}` : "u");
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

function formatInline(
  input: ToolExecutionInput,
  summary: string,
  facts: Record<string, number>,
  rawChars: number,
  rawRefId?: string,
): string {
  const factParts = Object.entries(facts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => pluralize(count, name));

  const firstLineParts = ["summary"];
  if (input.command) {
    firstLineParts.push(`for \`${input.command}\``);
  }
  if (input.exitCode && input.exitCode !== 0) {
    firstLineParts.push(`exit ${input.exitCode}`);
  }

  const header = `${firstLineParts.join(" ")}${factParts.length > 0 ? `: ${factParts.join(", ")}.` : "."}`;
  const artifactNote = rawRefId ? `\nraw artifact: ${rawRefId} (${rawChars} chars).` : "";
  return `${header}\n${summary}${artifactNote}`.trim();
}

export async function reduceExecution(input: ToolExecutionInput, opts: ReduceOptions = {}): Promise<CompactResult> {
  const rules = await loadBuiltinRules();
  const classification = classifyExecution(input, rules, opts.classifier);
  const rawText = buildRawText(input);
  const matchedRule = rules.find((rule) => rule.id === classification.matchedReducer)
    ?? rules.find((rule) => rule.id === "generic/fallback");

  if (!matchedRule) {
    throw new Error("missing generic fallback rule");
  }

  const { summary, facts } = applyRule(matchedRule, input, rawText);
  const rawRef = opts.store
    ? await storeArtifact(
        {
          input,
          rawText,
          classification,
        },
        opts.storeDir,
      )
    : undefined;
  const inlineText = clampText(
    formatInline(input, summary || "(no output)", facts, rawText.length, rawRef?.id),
    opts.maxInlineChars ?? 1200,
  );

  return {
    inlineText,
    ...(summary ? { previewText: summary } : {}),
    ...(Object.keys(facts).length > 0 ? { facts } : {}),
    ...(rawRef ? { rawRef } : {}),
    stats: {
      rawChars: rawText.length,
      reducedChars: inlineText.length,
      ratio: rawText.length === 0 ? 1 : inlineText.length / rawText.length,
    },
    classification,
  };
}

export async function classifyOnly(input: ToolExecutionInput, forcedRuleId?: string) {
  const rules = await loadBuiltinRules();
  return classifyExecution(input, rules, forcedRuleId);
}

export async function findMatchingRule(input: ToolExecutionInput): Promise<JsonRule | undefined> {
  const rules = await loadBuiltinRules();
  return rules.find((rule) => matchesRule(rule, input));
}
