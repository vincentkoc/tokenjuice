import { describe, expect, it } from "vitest";

import { parseReduceJsonRequest } from "../src/index.js";

describe("parseReduceJsonRequest", () => {
  it("accepts a direct ToolExecutionInput payload", () => {
    const request = parseReduceJsonRequest({
      toolName: "exec",
      command: "pnpm test",
      combinedText: "ok",
      exitCode: 0,
    });

    expect(request).toEqual({
      input: {
        toolName: "exec",
        command: "pnpm test",
        combinedText: "ok",
        exitCode: 0,
      },
      options: {},
    });
  });

  it("accepts an envelope payload with options", () => {
    const request = parseReduceJsonRequest({
      input: {
        toolName: "exec",
        command: "pnpm test",
        combinedText: "ok",
        exitCode: 0,
      },
      options: {
        classifier: "tests/pnpm-test",
        store: true,
        maxInlineChars: 800,
      },
    });

    expect(request).toEqual({
      input: {
        toolName: "exec",
        command: "pnpm test",
        combinedText: "ok",
        exitCode: 0,
      },
      options: {
        classifier: "tests/pnpm-test",
        store: true,
        maxInlineChars: 800,
      },
    });
  });

  it("rejects missing toolName", () => {
    expect(() => parseReduceJsonRequest({
      input: {
        command: "pnpm test",
      },
    })).toThrow("input.toolName");
  });

  it("rejects invalid option types", () => {
    expect(() => parseReduceJsonRequest({
      input: {
        toolName: "exec",
      },
      options: {
        maxInlineChars: "800",
      },
    })).toThrow("options.maxInlineChars");
  });
});
