import { describe, expect, it } from "vitest";

import { clampText, countTerminalCells, countTextChars, stripAnsi } from "../../src/core/text.js";

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

  it("counts terminal cells for emoji, cjk, and combining characters", () => {
    expect(countTerminalCells("abc")).toBe(3);
    expect(countTerminalCells("错误")).toBe(4);
    expect(countTerminalCells("🦊")).toBe(2);
    expect(countTerminalCells("e\u0301")).toBe(1);
    expect(countTerminalCells("👨‍👩‍👧‍👦")).toBe(2);
  });

  it("counts visible cells after ansi stripping", () => {
    const input = "\u001b[31m错误🔥\u001b[0m \u001b]8;;https://openclaw.ai\u0007完了✅\u001b]8;;\u0007";
    const stripped = stripAnsi(input);

    expect(stripped).toBe("错误🔥 完了✅");
    expect(countTerminalCells(stripped)).toBe(13);
  });

  it("strips dangling ansi and osc fragments instead of leaking escape garbage", () => {
    const input = "ok \u001b[38;5;196broken \u001b]8;;https://openclaw.aibroken-link";
    const stripped = stripAnsi(input);

    expect(stripped.startsWith("ok ")).toBe(true);
    expect(stripped).not.toContain("broken-link");
    expect(stripped).not.toContain("\u001b");
  });

  it("prefers line boundaries when truncating long line-oriented text", () => {
    const input = [
      "line 1",
      "line 2",
      "line 3",
      "line 4",
      "line 5",
      "line 6",
      "line 7",
      "line 8",
    ].join("\n");

    const clamped = clampText(input, 40);

    expect(clamped).toContain("\n... truncated ...");
    expect(clamped).not.toContain("li\n... truncated ...");
  });
});
