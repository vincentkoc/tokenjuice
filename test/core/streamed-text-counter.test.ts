import { describe, expect, it } from "vitest";

import { StreamedTextCounter } from "../../src/core/streamed-text-counter.js";
import { countTextChars, stripAnsi } from "../../src/core/text.js";

describe("StreamedTextCounter", () => {
  it.each([
    ["\u001b[31", "mhello", "\u001b[0m"],
    ["\u001b]8;;https://example.com", "\u001b", "\\link", "\u001b]8;;\u0007"],
    ["e", "\u0301", "界", "👩", "\u200d", "💻"],
    ["a\r", "\nb"],
  ])("counts visible graphemes across chunk boundaries: %j", (...chunks) => {
    const counter = new StreamedTextCounter();
    for (const chunk of chunks) counter.write(chunk);
    expect(counter.count).toBe(countTextChars(stripAnsi(chunks.join(""))));
  });
});
