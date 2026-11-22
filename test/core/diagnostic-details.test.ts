import { describe, expect, it } from "vitest";

import { reduceExecution } from "../../src/core/reduce.js";

describe("diagnostic details in delivered output", () => {
  it("preserves nested TypeScript explanations while removing compiler statistics", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "tsc --noEmit",
      exitCode: 2,
      combinedText: [
        "src/index.ts(1,1): error TS2345: Argument is not assignable.",
        "  Types of property 'handler' are incompatible.",
        "    Property requiredField is missing in type Source but required in type Target.",
        "Found 1 error.",
        "Files: 100",
        "Check time: 0.20s",
      ].join("\n"),
    });

    expect(result.inlineText).toContain("Types of property 'handler' are incompatible.");
    expect(result.inlineText).toContain("Property requiredField is missing");
    expect(result.inlineText).not.toContain("Files: 100");
    expect(result.inlineText).not.toContain("Check time:");
  });

  it.each(["TypeError", "ValueError", "AssertionError"])("preserves pytest file locations for %s", async (exception) => {
    const location = `tests/nested/test_handler.py:81: ${exception}`;
    const result = await reduceExecution({
      toolName: "exec",
      command: "pytest tests/nested/test_handler.py",
      exitCode: 1,
      combinedText: [
        "================ test session starts ================",
        "platform linux -- Python 3.12.0",
        "tests/nested/test_handler.py::test_handler FAILED",
        ">       handler(value)",
        `E       ${exception}: invalid value`,
        location,
        `FAILED tests/nested/test_handler.py::test_handler - ${exception}: invalid value`,
        "================ 1 failed in 0.10s ================",
      ].join("\n"),
    });

    expect(result.inlineText).toContain(location);
    expect(result.inlineText).toContain(`${exception}: invalid value`);
    expect(result.inlineText).not.toContain("platform linux");
  });
});
