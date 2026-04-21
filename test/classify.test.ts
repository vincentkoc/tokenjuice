import { describe, expect, it } from "vitest";

import { matchesRule } from "../src/core/classify.js";
import type { JsonRule, ToolExecutionInput } from "../src/types.js";

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
});
