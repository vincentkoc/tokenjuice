import { describe, expect, it } from "vitest";
import { reduceExecution } from "../../src/core/reduce.js";

const installers = [
  { command: "npm install", success: "up to date, audited 42 packages in 614ms\nfound 0 vulnerabilities" },
  { command: "npm ci", success: "up to date, audited 42 packages in 614ms\nfound 0 vulnerabilities" },
  { command: "pnpm install", success: "Lockfile is up to date, resolution step is skipped\nAlready up to date\nDone in 612ms" },
  { command: "yarn install", success: "[1/4] Resolving packages...\nsuccess Already up-to-date.\nDone in 0.42s." },
  { command: "bun install", success: "bun install v1.1.0\nChecked 43 installs across 71 packages (no changes)" },
];

describe("install success shortcuts", () => {
  it.each(installers)("preserves extra warnings for $command", async ({ command, success }) => {
    const result = await reduceExecution({ command, combinedText: `${success}\nwarning: unique-peer-dependency`, exitCode: 0 }, { recordStats: false });
    expect(result.inlineText).toContain("unique-peer-dependency");
  });

  it.each(installers)("does not summarize a failed $command as success", async ({ command, success }) => {
    const result = await reduceExecution({ command, combinedText: `${success}\nerror: unique-lifecycle-failure`, exitCode: 1 }, { recordStats: false });
    expect(result.inlineText).toContain("unique-lifecycle-failure");
    expect(result.previewText).not.toBe(`${command}: up to date`);
  });

  it("preserves positive npm vulnerability counts", async () => {
    const result = await reduceExecution({ command: "npm install", combinedText: "up to date, audited 42 packages in 614ms\n3 high severity vulnerabilities", exitCode: 0 }, { recordStats: false });
    expect(result.inlineText).toContain("3 high severity vulnerabilities");
  });

  it("requires a known successful exit even when the entire output matches", async () => {
    for (const exitCode of [1, undefined]) {
      const result = await reduceExecution({ command: "pnpm install", combinedText: "Already up to date", exitCode }, { recordStats: false });
      expect(result.previewText).not.toBe("pnpm install: up to date");
    }
  });
});
