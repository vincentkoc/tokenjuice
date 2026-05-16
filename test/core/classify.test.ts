import { describe, expect, it } from "vitest";

import { matchesRule, resolveRuleMatch } from "../../src/core/classify.js";
import type { CompiledRule, JsonRule, ToolExecutionInput } from "../../src/types.js";

function buildRule(commandIncludes: string[]): JsonRule {
  return {
    id: "test/rule",
    family: "test",
    match: {
      toolNames: ["exec"],
      commandIncludes,
    },
  };
}

function buildAnyRule(commandIncludesAny: string[]): JsonRule {
  return {
    id: "test/any-rule",
    family: "test",
    match: {
      toolNames: ["exec"],
      commandIncludesAny,
    },
  };
}

function compileForTest(rule: JsonRule, source: CompiledRule["source"] = "project"): CompiledRule {
  return {
    rule,
    source,
    path: `test:${rule.id}`,
    compiled: {
      skipPatterns: [],
      keepPatterns: [],
      counters: [],
      outputMatches: [],
    },
  };
}

describe("matchesRule commandIncludes", () => {
  it("matches terminal token patterns even when they end the command", () => {
    const rule = buildRule([" && git diff"]);
    const input: ToolExecutionInput = {
      toolName: "exec",
      command: "git status && git diff",
    };

    expect(matchesRule(rule, input)).toBe(true);
  });

  it("does not match partial tokens", () => {
    const rule = buildRule([" && git diff"]);
    const input: ToolExecutionInput = {
      toolName: "exec",
      command: "git status && git diffx",
    };

    expect(matchesRule(rule, input)).toBe(false);
  });

  it("applies the same boundary protection to commandIncludesAny", () => {
    const rule = buildAnyRule(["git diff"]);
    const input: ToolExecutionInput = {
      toolName: "exec",
      command: "git status && git diffx",
    };

    expect(matchesRule(rule, input)).toBe(false);
  });
});

describe("resolveRuleMatch candidate selection", () => {
  it("keeps project commandIncludes rules that target wrapper command text", () => {
    const wrapperRule = compileForTest(buildRule(["bash -lc"]));
    const match = resolveRuleMatch({
      toolName: "exec",
      command: "bash -lc 'echo hi'",
      combinedText: "hi\n",
      exitCode: 0,
    }, [wrapperRule]);

    expect(match?.rule.rule.id).toBe("test/rule");
    expect(match?.candidate.source).toBe("original");
  });
});
