import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearRuleCache, reduceExecution } from "../../src/index.js";

const passingFiles = [
  "failover.test.ts",
  "passphrase.test.ts",
  "bypass.test.ts",
  ...Array.from({ length: 22 }, (_, index) => `feature-${index}.test.ts`),
];
const passingLines = passingFiles.map((file) => ` ✓ test/${file} (1 test) 2ms`);
const passingFileTotal = ` Test Files  ${passingFiles.length} passed (${passingFiles.length})`;
const passingTestTotal = `      Tests  ${passingFiles.length} passed (${passingFiles.length})`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "tokenjuice-wrapper-counters-"));
});

afterEach(async () => {
  clearRuleCache();
  await rm(cwd, { recursive: true, force: true });
});

describe.each(["npm", "pnpm", "yarn", "bun"])("%s test result counters", (manager) => {
  it("keeps runner totals without counting filename substrings as results", async () => {
    const result = await reduceExecution(
      {
        toolName: "exec",
        command: `${manager} test`,
        combinedText: [
          "> example@1.0.0 test",
          "> vitest run",
          " RUN  v3.0.0 /project",
          ...passingLines,
          passingFileTotal,
          passingTestTotal,
          "   Duration  1.00s",
        ].join("\n"),
        exitCode: 0,
      },
      { cwd, store: false, recordStats: false },
    );

    expect(result.classification.matchedReducer).toBe(`tests/${manager}-test`);
    expect(result.inlineText).toContain(passingFileTotal.trim());
    expect(result.inlineText).toContain(passingTestTotal.trim());
    expect(result.inlineText).toContain("omitted");
    expect(result.inlineText).not.toMatch(/^\d+ (?:failed|passed)(?:,.*)?$/m);
    expect(result.facts ?? {}).not.toHaveProperty("failed");
    expect(result.facts ?? {}).not.toHaveProperty("passed");
  });

  it("keeps genuine failure diagnostics, runner totals, and nonzero exit status", async () => {
    const failureLines = [
      " FAIL  test/arithmetic.test.ts > adds numbers",
      "AssertionError: expected 2 to be 1",
      "Error: arithmetic assertion failed",
      "Caused by: unexpected arithmetic result",
    ];
    const fileTotal = ` Test Files  1 failed | ${passingFiles.length} passed (${passingFiles.length + 1})`;
    const testTotal = `      Tests  1 failed | ${passingFiles.length} passed (${passingFiles.length + 1})`;
    const exitCode = 1;
    const result = await reduceExecution(
      {
        toolName: "exec",
        command: `${manager} test`,
        combinedText: [
          ...passingLines,
          " ❯ test/arithmetic.test.ts (1 test | 1 failed) 3ms",
          ...failureLines,
          fileTotal,
          testTotal,
          "   Duration  1.00s",
        ].join("\n"),
        exitCode,
      },
      { cwd, store: false, recordStats: false },
    );

    expect(result.classification.matchedReducer).toBe(`tests/${manager}-test`);
    expect(result.inlineText.startsWith(`exit ${exitCode}\n`)).toBe(true);
    for (const line of [...failureLines, fileTotal, testTotal]) {
      expect(result.inlineText).toContain(line.trim());
    }
    expect(result.inlineText).not.toMatch(/^\d+ (?:failed|passed)(?:,.*)?$/m);
    expect(result.facts ?? {}).not.toHaveProperty("failed");
    expect(result.facts ?? {}).not.toHaveProperty("passed");
  });
});
