import type { ClassificationResult, JsonRule, ToolExecutionInput } from "../types.js";

function includesAll(argv: string[], expected: string[]): boolean {
  return expected.every((part) => argv.includes(part));
}

export function matchesRule(rule: JsonRule, input: ToolExecutionInput): boolean {
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

  if (rule.match.commandIncludes && !rule.match.commandIncludes.every((part) => command.includes(part))) {
    return false;
  }

  return true;
}

export function classifyExecution(
  input: ToolExecutionInput,
  rules: JsonRule[],
  forcedRuleId?: string,
): ClassificationResult {
  if (forcedRuleId) {
    const forcedRule = rules.find((rule) => rule.id === forcedRuleId);
    if (forcedRule) {
      return {
        family: forcedRule.family,
        confidence: 1,
        matchedReducer: forcedRule.id,
      };
    }
  }

  const matchedRule = rules.find((rule) => matchesRule(rule, input));
  if (!matchedRule) {
    return {
      family: "generic",
      confidence: 0.2,
    };
  }

  return {
    family: matchedRule.family,
    confidence: matchedRule.id === "generic/fallback" ? 0.2 : 0.9,
    matchedReducer: matchedRule.id,
  };
}
