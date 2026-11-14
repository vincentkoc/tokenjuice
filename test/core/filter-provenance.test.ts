import { describe, expect, it } from "vitest";

import { reduceExecution } from "../../src/core/reduce.js";

describe("rule filtering provenance", () => {
  const compilerOutput = [
    "src/index.ts(1,1): error TS2345: Argument is not assignable.",
    "Found 1 error.",
    "Files: 100",
    "Check time: 0.20s",
  ].join("\n");

  it("declares line filtering even when no head/tail clipping is needed", async () => {
    const result = await reduceExecution({
      toolName: "exec", command: "tsc --noEmit", combinedText: compilerOutput, exitCode: 2,
    });
    expect(result.inlineText).not.toContain("Check time:");
    expect(result.compaction?.kinds).toContain("rule-line-filter");
    expect(result.compaction?.authoritative).toBe(true);
  });

  it("does not claim filtering when no lines were removed", async () => {
    const result = await reduceExecution({
      toolName: "exec", command: "tsc --noEmit",
      combinedText: "src/index.ts(1,1): error TS2345: Argument is not assignable.", exitCode: 2,
    });
    expect(result.compaction?.authoritative).toBe(false);
  });

  it("does not filter or declare filtering in no-omission mode", async () => {
    const result = await reduceExecution({
      toolName: "exec", command: "tsc --noEmit", combinedText: compilerOutput, exitCode: 2,
    }, { noOmit: true });
    expect(result.inlineText).toContain("Check time:");
    expect(result.compaction?.kinds).not.toContain("rule-line-filter");
  });

  it("declares an output-match replacement", async () => {
    const result = await reduceExecution({
      toolName: "exec", command: "pnpm install",
      combinedText: "Lockfile is up to date, resolution step is skipped\nAlready up to date\nDone in 612ms", exitCode: 0,
    });
    expect(result.compaction?.kinds).toContain("rule-output-replacement");
  });
});
