import type { ClassificationResult, CompiledRule, JsonRule, ToolExecutionInput } from "../types.js";

function includesAll(argv: string[], expected: string[]): boolean {
  return expected.every((part) => argv.includes(part));
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

  if (rule.match.argvIncludes && !rule.match.argvIncludes.every((parts) => includesAll(argv, parts))) {
    return false;
  }

  if (rule.match.argvIncludesAny && !rule.match.argvIncludesAny.some((parts) => includesAll(argv, parts))) {
    return false;
  }

  if (rule.match.commandIncludes && !rule.match.commandIncludes.every((part) => command.includes(part))) {
    return false;
  }

  if (rule.match.commandIncludesAny && !rule.match.commandIncludesAny.some((part) => command.includes(part))) {
    return false;
  }

  return true;
}

function scoreRule(ruleLike: RuleLike): number {
  const rule = getJsonRule(ruleLike);
  return (
    (rule.priority ?? 0) * 1000
    + (rule.match.argv0?.length ?? 0) * 100
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
