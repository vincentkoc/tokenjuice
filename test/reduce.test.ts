import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getArtifact, reduceExecution } from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("reduceExecution", () => {
  it("uses the git status rule when argv matches", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "git status",
      argv: ["git", "status"],
      combinedText: [
        "On branch main",
        "Changes not staged for commit:",
        "  modified: src/index.ts",
        "",
        "Untracked files:",
        "  new-file.ts",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("git/status");
    expect(result.inlineText).toContain("1 modified");
    expect(result.inlineText).toContain("src/index.ts");
  });

  it("stores raw artifacts when requested", async () => {
    const storeDir = await createTempDir();
    const result = await reduceExecution(
      {
        toolName: "exec",
        command: "rg TODO src",
        argv: ["rg", "TODO", "src"],
        combinedText: "src/a.ts:1:// TODO one\nsrc/b.ts:2:// TODO two\n",
        exitCode: 0,
      },
      {
        store: true,
        storeDir,
      },
    );

    expect(result.rawRef?.id).toMatch(/^tj_/u);
    const artifact = await getArtifact(result.rawRef!.id, storeDir);
    expect(artifact?.rawText).toContain("TODO one");
  });

  it("falls back cleanly for generic output", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm test",
      combinedText: Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n"),
      exitCode: 0,
    });

    expect(result.classification.family).toBe("generic");
    expect(result.inlineText).toContain("lines omitted");
  });

  it("matches pnpm test runs to the test reducer family", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm test",
      argv: ["pnpm", "test"],
      combinedText: [
        "RUN  v3.2.4 /repo",
        "❯ test/example.test.ts (2 tests | 1 failed)",
        "AssertionError: expected 1 to be 2",
        "Test Files  1 failed (1)",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("tests/pnpm-test");
    expect(result.inlineText).toContain("exit 1");
  });

  it("matches tsc output to the TypeScript build reducer", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm tsc --noEmit",
      argv: ["pnpm", "tsc", "--noEmit"],
      combinedText: [
        "src/index.ts(4,1): error TS2322: Type 'string' is not assignable to type 'number'.",
        "Found 1 error in src/index.ts:4",
      ].join("\n"),
      exitCode: 2,
    });

    expect(result.classification.matchedReducer).toBe("build/tsc");
    expect(result.inlineText).toContain("typescript error");
  });

  it("matches eslint output to the lint reducer", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm eslint src",
      argv: ["pnpm", "eslint", "src"],
      combinedText: [
        "src/index.ts",
        "  4:10  error  Unexpected any  @typescript-eslint/no-explicit-any",
        "  8:1   warning  Unexpected console statement  no-console",
        "",
        "✖ 2 problems (1 error, 1 warning)",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("lint/eslint");
    expect(result.inlineText).toContain("warning");
  });
});
