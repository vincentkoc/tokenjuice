import { describe, expect, it } from "vitest";

import { reduceExecution } from "../../src/core/reduce.js";
import { countTextChars } from "../../src/core/text.js";

describe("search output budget", () => {
  it("keeps a distinctive middle match and original row order when all rows fit", async () => {
    const lines = Array.from({ length: 24 }, (_, index) =>
      `src/file-${index}.ts:${index + 1}:${index === 12 ? "unique_middle_identifier" : "ordinary match"}`);
    const result = await reduceExecution({
      toolName: "exec", command: "rg needle src", combinedText: lines.join("\n"), exitCode: 0,
    }, { maxInlineChars: 4000 });

    expect(result.inlineText).toContain(lines.join("\n"));
    expect(result.inlineText).not.toContain("omitted");
    expect(result.compaction?.authoritative).toBe(false);
  });

  it("does not clip a long matching row that fits the total budget", async () => {
    const line = `src/file.ts:14:${"prefix ".repeat(100)}unique_end_identifier`;
    const result = await reduceExecution({
      toolName: "exec", command: "rg needle src", combinedText: line, exitCode: 0,
    }, { maxInlineChars: 1200 });

    expect(result.inlineText).toContain(line);
  });

  it("still bounds over-budget searches and declares omitted output", async () => {
    const result = await reduceExecution({
      toolName: "exec", command: "rg needle src", exitCode: 0,
      combinedText: Array.from({ length: 100 }, (_, index) => `src/file-${index}.ts:1:${"match ".repeat(20)}`).join("\n"),
    }, { maxInlineChars: 512 });

    expect(countTextChars(result.inlineText)).toBeLessThanOrEqual(512);
    expect(result.compaction?.authoritative).toBe(true);
    expect(result.inlineText).toContain("omitted");
  });
});
