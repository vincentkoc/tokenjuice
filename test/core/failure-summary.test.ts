import { describe, expect, it } from "vitest";
import { reduceExecution } from "../../src/core/reduce.js";
import { countTextChars } from "../../src/core/text.js";

const input = (exitCode = 1) => ({
  toolName: "exec", command: "custom-builder", exitCode,
  combinedText: Array.from({ length: 100 }, (_, index) => index === 50
    ? "fatal: unique-needle src/problem.ts:99:8"
    : `progress ${index} ${"x".repeat(60)}`).join("\n"),
});

describe("generic failure details", () => {
  it("retains a middle diagnostic and nearby context within the output budget", async () => {
    const result = await reduceExecution(input(), { maxInlineChars: 512, recordStats: false });
    expect(result.inlineText).toContain("fatal: unique-needle src/problem.ts:99:8");
    expect(result.inlineText).toContain("progress 49");
    expect(result.inlineText).toContain("progress 51");
    expect(result.inlineText).toContain("[exit 1]");
    expect(result.inlineText).toContain("other output omitted");
    expect(countTextChars(result.inlineText)).toBeLessThanOrEqual(512);
    expect(result.compaction?.kinds).toContain("failure-signal-filter");
  });

  it("retains multiple diagnostics in source order before adding context", async () => {
    const data = input();
    data.combinedText = data.combinedText.replace("progress 10", "Error: first").replace("progress 90", "TypeError: last");
    const result = await reduceExecution(data, { maxInlineChars: 512, recordStats: false });
    expect(result.inlineText.indexOf("Error: first")).toBeLessThan(result.inlineText.indexOf("unique-needle"));
    expect(result.inlineText.indexOf("unique-needle")).toBeLessThan(result.inlineText.indexOf("TypeError: last"));
  });

  it("clips later oversized diagnostics before spending budget on progress context", async () => {
    const data = input();
    data.combinedText = data.combinedText.replace("progress 10", "Error: early warning")
      .replace("fatal: unique-needle src/problem.ts:99:8", `fatal: final-root-cause ${"details ".repeat(200)}`);
    const result = await reduceExecution(data, { maxInlineChars: 512, recordStats: false });
    expect(result.inlineText).toContain("Error: early warning");
    expect(result.inlineText).toContain("fatal: final-root-cause");
    expect(countTextChars(result.inlineText)).toBeLessThanOrEqual(512);
  });

  it("reserves space for a late root cause after an oversized early diagnostic", async () => {
    const data = input();
    data.combinedText = data.combinedText.replace("progress 10", `Error: ${"details ".repeat(200)}`);
    const result = await reduceExecution(data, { maxInlineChars: 512, recordStats: false });
    expect(result.inlineText).toContain("Error:");
    expect(result.inlineText).toContain("fatal: unique-needle src/problem.ts:99:8");
    expect(countTextChars(result.inlineText)).toBeLessThanOrEqual(512);
  });

  it("keeps every short diagnostic that fits before adding progress context", async () => {
    const data = input();
    const lines = data.combinedText.split("\n");
    for (let index = 0; index < 8; index++) lines[index * 10] = `Error: cause-${index}`;
    data.combinedText = lines.join("\n");
    const result = await reduceExecution(data, { maxInlineChars: 512, recordStats: false });
    for (let index = 0; index < 8; index++) expect(result.inlineText).toContain(`Error: cause-${index}`);
    expect(result.inlineText).toContain("fatal: unique-needle");
  });

  it("keeps all failed output when it fits", async () => {
    const data = input();
    const result = await reduceExecution(data, { maxInlineChars: 20_000, recordStats: false });
    expect(result.inlineText).toBe(`[exit 1]\n${data.combinedText}`);
    expect(result.compaction?.authoritative).toBe(false);
  });

  it("respects no-omission mode", async () => {
    const data = input();
    const result = await reduceExecution(data, { noOmit: true, maxInlineChars: 512, recordStats: false });
    expect(result.inlineText).toContain(data.combinedText);
    expect(result.compaction?.kinds).not.toContain("failure-signal-filter");
  });

  it("does not infer a failed command from diagnostic-looking successful output", async () => {
    const result = await reduceExecution(input(0), { maxInlineChars: 512, recordStats: false });
    expect(result.compaction?.kinds).not.toContain("failure-signal-filter");
  });
});
