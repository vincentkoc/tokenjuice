import { describe, expect, it } from "vitest";

import { parseReduceJsonRequest } from "../../src/index.js";

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
        raw: true,
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
        raw: true,
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

  it("rejects non-positive maxInlineChars values", () => {
    expect(() => parseReduceJsonRequest({
      input: {
        toolName: "exec",
      },
      options: {
        maxInlineChars: 0,
      },
    })).toThrow("positive integer");
  });

  it("rejects invalid raw option types", () => {
    expect(() => parseReduceJsonRequest({
      input: {
        toolName: "exec",
      },
      options: {
        raw: "yes",
      },
    })).toThrow("options.raw");
  });

  it("rejects NUL bytes in string fields", () => {
    expect(() => parseReduceJsonRequest({
      input: {
        toolName: "exec",
        command: "pnpm\0test",
      },
    })).toThrow("must not contain NUL bytes");
  });
});
