import { describe, expect, it } from "vitest";

import { clampText, countTextChars, stripAnsi } from "../src/core/text.js";

describe("text helpers", () => {
  it("strips xterm colors and OSC hyperlinks while preserving emoji and CJK", () => {
    const input = [
      "\u001b[38;5;196m错误🔥\u001b[0m",
      "\u001b]8;;https://openclaw.ai\u0007链接🔗\u001b]8;;\u0007",
      "\u001b[38;2;120;200;255mblue🦊\u001b[0m",
    ].join(" ");

    const stripped = stripAnsi(input);

    expect(stripped).toBe("错误🔥 链接🔗 blue🦊");
    expect(stripped).not.toContain("\u001b");
    expect(countTextChars(stripped)).toBe(13);
  });

  it("clamps text without splitting emoji graphemes", () => {
    const input = "🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂abc123xyz";
    const clamped = clampText(input, 18);

    expect(clamped).toBe("\n... truncated ...");
    expect(countTextChars(clamped)).toBeLessThanOrEqual(18);
  });
});
