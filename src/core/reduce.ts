import { loadRules } from "./rules.js";
import { classifyExecution, resolveRuleMatch } from "./classify.js";
import { isFileContentInspectionCommand } from "./command-identity.js";
import { normalizeExecutionInput } from "./execution-input.js";
import { clampText, clampTextMiddle, countTextChars, dedupeAdjacent, headTail, normalizeLines, pluralize, stripAnsi, trimEmptyEdges } from "./text.js";
import { storeArtifact, storeArtifactMetadata } from "./artifacts.js";
import { buildGithubActionsFailureSummary } from "./github-actions-summary.js";
import { rewriteGhLines, rewriteGitDiffLines, rewriteGitStatusLines, rewriteSearchLines } from "./reduce-formatters.js";
import { buildInspectionSummary } from "./reduce-inspection-summary.js";

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

function prettyPrintJsonIfPossible(text: string): string {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return text;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    return text;
  }

  return text;
}

function applyRule(compiledRule: CompiledRule, input: ToolExecutionInput, rawText: string): { summary: string; facts: Record<string, number> } {
  const rule = compiledRule.rule;
  if (rule.transforms?.prettyPrintJson) {
    rawText = prettyPrintJsonIfPossible(rawText);
  }
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
  const preRewriteLines = [...lines];
  if (rule.id === "cloud/gh") {
    counterLines = rewriteGhLines(counterLines, input);
    lines = rewriteGhLines(lines, input);
  }
  if (rule.id === "search/rg") {
    lines = rewriteSearchLines(lines);
  }
  if (rule.id === "git/diff") {
    lines = rewriteGitDiffLines(lines);
  }

  for (const counter of compiledRule.compiled.counters) {
    const pattern = counter.pattern;
    let factLines = rule.counterSource === "preKeep" ? counterLines : rule.id === "git/diff" ? preRewriteLines : lines;
    if (rule.id === "git/diff" && (counter.name === "added line" || counter.name === "removed line")) {
      factLines = factLines.filter((line) => !line.startsWith("+++") && !line.startsWith("---"));
    }
    facts[counter.name] = factLines.filter((line) => pattern.test(line)).length;
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
  if (rawChars <= maxInlineChars && compactChars >= rawChars) {
    return passthroughText;
  }
  const passthroughLimit = classification.family === "help" ? maxInlineChars : TINY_OUTPUT_MAX_CHARS;
  if (countTextChars(passthroughText) > passthroughLimit) {
    return compactText;
  }
  if (countTextChars(passthroughText) <= countTextChars(compactText)) {
    return passthroughText;
  }
  return compactText;
}

export async function reduceExecution(input: ToolExecutionInput, opts: ReduceOptions = {}): Promise<CompactResult> {
  const rules = await loadRules(opts.cwd ? { cwd: opts.cwd } : undefined);
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
  const resolvedMatch = opts.classifier
    ? undefined
    : resolveRuleMatch(input, rules);
  const classification = resolvedMatch?.classification
    ?? classifyExecution(input, rules, opts.classifier);
  const reducerInput = resolvedMatch?.candidateInput ?? normalizedInput;
  const trace = opts.trace
    ? {
        ...(normalizedInput.command ? { normalizedCommand: normalizedInput.command } : {}),
        ...(normalizedInput.argv?.length ? { normalizedArgv: normalizedInput.argv } : {}),
        ...(reducerInput.command && reducerInput.command !== normalizedInput.command
          ? { reducerCommand: reducerInput.command }
          : {}),
        ...(reducerInput.argv?.length && reducerInput.argv !== normalizedInput.argv
          ? { reducerArgv: reducerInput.argv }
          : {}),
        ...(classification.matchedReducer ? { matchedReducer: classification.matchedReducer } : {}),
        family: classification.family,
      }
    : undefined;

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
      ...(trace ? { trace } : {}),
      ...(rawRef ? { rawRef } : {}),
      stats: {
        rawChars: measuredRawChars,
        reducedChars: measuredRawChars,
        ratio: 1,
      },
      classification,
    };
  }

  const inspectionSummary = buildInspectionSummary(normalizedInput, rawText);
  if (inspectionSummary) {
    const summaryText = inspectionSummary.lines.join("\n").trim();
    const selectedText = clampTextMiddle(summaryText, opts.maxInlineChars ?? 1200);
    const reducedChars = countTextChars(selectedText);
    const summaryClassification = {
      family: "structured-summary",
      confidence: 0.9,
      matchedReducer: inspectionSummary.matchedReducer,
    };
    const stats = {
      rawChars: measuredRawChars,
      reducedChars,
      ratio: measuredRawChars === 0 ? 1 : reducedChars / measuredRawChars,
    };
    const rawRef = opts.store
      ? await storeArtifact(
          {
            input: normalizedInput,
            rawText,
            classification: summaryClassification,
            stats,
          },
          opts.storeDir,
        )
      : undefined;

    if (!opts.store && opts.recordStats) {
      await storeArtifactMetadata(
        {
          input: normalizedInput,
          rawText,
          classification: summaryClassification,
          stats,
        },
        opts.storeDir,
      );
    }

    return {
      inlineText: selectedText,
      previewText: summaryText,
      ...(trace ? { trace } : {}),
      ...(rawRef ? { rawRef } : {}),
      stats,
      classification: summaryClassification,
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
      ...(trace ? { trace } : {}),
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

  const githubActionsFailureSummary = classification.matchedReducer === "generic/fallback"
    ? buildGithubActionsFailureSummary(reducerInput, rawText)
    : null;
  if (githubActionsFailureSummary) {
    const maxInlineChars = opts.maxInlineChars ?? 1200;
    const inlineText = clampTextMiddle(githubActionsFailureSummary, maxInlineChars);
    const reducedChars = countTextChars(inlineText);
    const stats = {
      rawChars: measuredRawChars,
      reducedChars,
      ratio: measuredRawChars === 0 ? 1 : reducedChars / measuredRawChars,
    };
    const rawRef = opts.store
      ? await storeArtifact(
          {
            input: normalizedInput,
            rawText,
            classification,
            stats,
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
          stats,
        },
        opts.storeDir,
      );
    }

    return {
      inlineText,
      previewText: githubActionsFailureSummary,
      ...(trace ? { trace } : {}),
      ...(rawRef ? { rawRef } : {}),
      stats,
      classification,
    };
  }

  const { summary, facts } = applyRule(matchedRule, reducerInput, rawText);
  const compactText = formatInline(classification, reducerInput, summary || "(no output)", facts);
  const maxInlineChars = opts.maxInlineChars ?? 1200;
  const selectedText = selectInlineText(classification, reducerInput, rawText, compactText, maxInlineChars);
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
    ...(trace ? { trace } : {}),
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
  return resolveRuleMatch(input, rules)?.rule;
}
