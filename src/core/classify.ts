import type { ClassificationResult, CompiledRule, JsonRule, ToolExecutionInput } from "../types.js";

import { getGitSubcommand } from "./command.js";

function includesAll(argv: string[], expected: string[]): boolean {
  return expected.every((part) => argv.includes(part));
}

function isWordLikeChar(char: string | undefined): boolean {
  return typeof char === "string" && /[A-Za-z0-9_]/u.test(char);
}

function includesCommandPart(command: string, part: string): boolean {
  if (!part) {
    return true;
  }

  let fromIndex = 0;
  while (fromIndex <= command.length) {
    const index = command.indexOf(part, fromIndex);
    if (index === -1) {
      return false;
    }

    const end = index + part.length;
    const partStartsWord = isWordLikeChar(part[0]);
    const partEndsWord = isWordLikeChar(part.at(-1));
    const prev = index > 0 ? command[index - 1] : undefined;
    const next = end < command.length ? command[end] : undefined;
    const leftBoundaryOk = !partStartsWord || !isWordLikeChar(prev);
    const rightBoundaryOk = !partEndsWord || !isWordLikeChar(next);

    if (leftBoundaryOk && rightBoundaryOk) {
      return true;
    }

    fromIndex = index + 1;
  }

  return false;
}

type RuleLike = JsonRule | CompiledRule;

function getJsonRule(rule: RuleLike): JsonRule {
  return "rule" in rule ? rule.rule : rule;
}

export function matchesRule(ruleLike: RuleLike, input: ToolExecutionInput): boolean {
  const rule = getJsonRule(ruleLike);
  const argv = input.argv ?? [];
  const command = input.command ?? "";
  const toolName = input.toolName;

  if (rule.match.toolNames && !rule.match.toolNames.includes(toolName)) {
    return false;
  }

  if (rule.match.argv0 && !rule.match.argv0.includes(argv[0] ?? "")) {
    return false;
  }

  if (rule.match.gitSubcommands && !rule.match.gitSubcommands.includes(getGitSubcommand(argv) ?? "")) {
    return false;
  }

  if (rule.match.argvIncludes && !rule.match.argvIncludes.every((parts) => includesAll(argv, parts))) {
    return false;
  }

  if (rule.match.argvIncludesAny && !rule.match.argvIncludesAny.some((parts) => includesAll(argv, parts))) {
    return false;
  }

  if (rule.match.commandIncludes && !rule.match.commandIncludes.every((part) => includesCommandPart(command, part))) {
    return false;
  }

  if (rule.match.commandIncludesAny && !rule.match.commandIncludesAny.some((part) => includesCommandPart(command, part))) {
    return false;
  }

  return true;
}

function scoreRule(ruleLike: RuleLike): number {
  const rule = getJsonRule(ruleLike);
  return (
    (rule.priority ?? 0) * 1000
    + (rule.match.argv0?.length ?? 0) * 100
    + (rule.match.gitSubcommands?.length ?? 0) * 60
    + (rule.match.argvIncludes?.reduce((sum, parts) => sum + parts.length, 0) ?? 0) * 40
    + (rule.match.argvIncludesAny?.reduce((sum, parts) => sum + parts.length, 0) ?? 0) * 35
    + (rule.match.commandIncludes?.length ?? 0) * 25
    + (rule.match.commandIncludesAny?.length ?? 0) * 20
    + (rule.match.toolNames?.length ?? 0) * 10
  );
}

export function classifyExecution(
  input: ToolExecutionInput,
  rules: RuleLike[],
  forcedRuleId?: string,
): ClassificationResult {
  if (forcedRuleId) {
    const forcedRule = rules.find((rule) => getJsonRule(rule).id === forcedRuleId);
    if (forcedRule) {
      const forced = getJsonRule(forcedRule);
      return {
        family: forced.family,
        confidence: 1,
        matchedReducer: forced.id,
      };
    }
  }

  const matchedRules = rules.filter((rule) => matchesRule(rule, input));
  if (matchedRules.length === 0) {
    return {
      family: "generic",
      confidence: 0.2,
    };
  }

  const matchedRule = [...matchedRules].sort((left, right) => {
    const scoreDiff = scoreRule(right) - scoreRule(left);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return getJsonRule(left).id.localeCompare(getJsonRule(right).id);
  })[0]!;
  const rule = getJsonRule(matchedRule);
  return {
    family: rule.family,
    confidence: rule.id === "generic/fallback" ? 0.2 : 0.9,
    matchedReducer: rule.id,
  };
}
