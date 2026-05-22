import { describe, expect, it } from "vitest";

import { clipMiddleWithHash, compactWholeJsonText } from "../../src/core/reduce-utils.js";

describe("reduce-utils no-omit support", () => {
  it("returns the full text for clipMiddleWithHash when noOmit is enabled", () => {
    const text = "x".repeat(300);

    expect(clipMiddleWithHash(text, 60, true)).toEqual({
      text,
      compaction: {
        authoritative: false,
        kinds: ["no-omit-char-clip-passthrough"],
      },
    });
  });

  it("returns the full minified JSON when noOmit is enabled", () => {
    const value = {
      alpha: "x".repeat(120),
      nested: {
        beta: "y".repeat(120),
      },
    };

    expect(compactWholeJsonText(JSON.stringify(value, null, 2), 80, true)).toEqual({
      text: JSON.stringify(value),
      compaction: {
        authoritative: false,
        kinds: ["no-omit-char-clip-passthrough"],
      },
    });
  });
});
