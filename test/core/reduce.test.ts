import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findMatchingRule, getArtifact, listArtifactMetadata, reduceExecution, statsArtifacts } from "../../src/index.js";
import { clipMiddleWithHash } from "../../src/core/reduce-utils.js";
import { countTextChars } from "../../src/core/text.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("clipMiddleWithHash", () => {
  it("clips on grapheme boundaries instead of splitting surrogate pairs", () => {
    const clipped = clipMiddleWithHash("😀".repeat(80), 42);
    const hasUnpairedSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(clipped);

    expect(hasUnpairedSurrogate).toBe(false);
  });
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
    expect(result.facts?.["modified file"]).toBe(1);
    expect(result.inlineText).toContain("Changes not staged:");
    expect(result.inlineText).toContain("M: src/index.ts");
    expect(result.inlineText).toContain("Untracked files:");
    expect(result.inlineText).toContain("?? new-file.ts");
  });

  it("reports working tree clean instead of collapsing to empty output", async () => {
    // Regression: every useful line in a clean long-form `git status` is
    // matched by skipPatterns (branch, tracking, "nothing to commit..."),
    // leaving zero lines. Without onEmpty, the reducer returns an empty
    // summary and the agent reports "(no output)" even though the tree is
    // clean. Observed in phase 2/3 tokenjuice trials — ~60% of runs
    // misreported the clean state.
    const result = await reduceExecution({
      toolName: "exec",
      command: "git status",
      argv: ["git", "status"],
      combinedText: [
        "On branch main",
        "Your branch is up to date with 'origin/main'.",
        "",
        "nothing to commit, working tree clean",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("git/status");
    expect(result.inlineText).toContain("working tree clean");
    expect(result.inlineText).not.toContain("(no output)");
  });


  it("derives argv from the command string when callers only pass command", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "git status",
      combinedText: [
        "On branch pr-65478-security-fix",
        "Your branch and 'origin/pr-65478-security-fix' have diverged,",
        "and have 8 and 642 different commits each, respectively.",
        "",
        "Changes not staged for commit:",
        "  modified:   src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts",
        "  modified:   src/agents/pi-embedded-runner/run/attempt.test.ts",
        "",
        "no changes added to commit",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("git/status");
    expect(result.inlineText).toContain("Changes not staged:");
    expect(result.inlineText).toContain("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts");
    expect(result.inlineText).not.toContain("and have 8 and 642");
  });

  it("counts short git status entries correctly", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "git status --short --branch",
      argv: ["git", "status", "--short", "--branch"],
      combinedText: [
        "## main...origin/main",
        " M src/index.ts",
        "A  src/new.ts",
        "D  src/old.ts",
        "?? scripts/live-smoke.mjs",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("git/status");
    expect(result.facts).toEqual({
      "modified file": 1,
      "new file": 1,
      "deleted file": 1,
      "untracked file": 1,
    });
    expect(result.inlineText).not.toContain("modified files");
    expect(result.inlineText).toContain("?? scripts/live-smoke.mjs");
    expect(result.stats.reducedChars).toBeLessThanOrEqual(result.stats.rawChars);
  });

  it("passes through small terse status output instead of rewriting columns", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "git status --short",
      argv: ["git", "status", "--short"],
      combinedText: " M src/index.ts\n?? test/new.test.ts\n",
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("git/status");
    expect(result.inlineText).toBe(" M src/index.ts\n?? test/new.test.ts");
    expect(result.inlineText).not.toContain("M:");
    expect(result.stats.ratio).toBeGreaterThan(0.75);
  });

  it("rewrites long git status output into compact branch and file summaries", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "git status",
      argv: ["git", "status"],
      combinedText: [
        "On branch pr-65478-security-fix",
        "Your branch and 'origin/pr-65478-security-fix' have diverged,",
        "and have 8 and 642 different commits each, respectively.",
        "",
        "Changes not staged for commit:",
        "  modified:   src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts",
        "  modified:   src/agents/pi-embedded-runner/run/attempt.test.ts",
        "",
        "no changes added to commit",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.facts?.["modified file"]).toBe(2);
    expect(result.inlineText).toContain("Your branch and 'origin/pr-65478-security-fix' have diverged,");
    expect(result.inlineText).toContain("Changes not staged:");
    expect(result.inlineText).toContain("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts");
    expect(result.inlineText).toContain("M: src/agents/pi-embedded-runner/run/attempt.test.ts");
    expect(result.inlineText).not.toContain("and have 8 and 642");
    expect(result.inlineText).not.toContain("no changes added to commit");
  });

  it("preserves help output instead of over-compacting command discovery text", async () => {
    const helpText = [
      "Usage: pnpm [command] [flags]",
      "",
      "Manage packages.",
      "",
      "Commands:",
      ...Array.from({ length: 30 }, (_, index) => `  cmd-${index + 1}   Description for command ${index + 1}`),
      "",
      "Flags:",
      "  --help     Show help",
      "  --version  Show version",
    ].join("\n");

    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm --help",
      argv: ["pnpm", "--help"],
      combinedText: helpText,
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("generic/help");
    expect(result.inlineText).toContain("Usage: pnpm [command] [flags]");
    expect(result.inlineText).toContain("cmd-1");
    expect(result.inlineText).toContain("--version");
    expect(result.inlineText).toContain("omitted");
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

  it("records stats metadata without storing raw output when requested", async () => {
    const storeDir = await createTempDir();
    await reduceExecution(
      {
        toolName: "exec",
        command: "git status",
        argv: ["git", "status"],
        combinedText: [
          "On branch main",
          "Changes not staged for commit:",
          "  modified: src/index.ts",
        ].join("\n"),
        exitCode: 0,
      },
      {
        recordStats: true,
        storeDir,
      },
    );

    const metadata = await listArtifactMetadata(storeDir);
    const stats = statsArtifacts(metadata.map((entry) => ({ metadata: entry.metadata })));

    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.path).toBeUndefined();
    expect(metadata[0]?.metadata.command).toBe("git status");
    expect(stats.daily).toHaveLength(1);
    expect(stats.daily[0]?.count).toBe(1);
  });

  it("supports a raw bypass that returns unaltered output", async () => {
    const rawText = "Usage: pnpm test\n\n  --watch  watch mode\n";
    const result = await reduceExecution(
      {
        toolName: "exec",
        command: "pnpm test --help",
        argv: ["pnpm", "test", "--help"],
        combinedText: rawText,
        exitCode: 0,
      },
      {
        raw: true,
        maxInlineChars: 10,
      },
    );

    expect(result.inlineText).toBe(rawText);
    expect(result.stats.ratio).toBe(1);
    expect(result.stats.reducedChars).toBe(result.stats.rawChars);
  });

  it("falls back cleanly for generic output", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "custom-tool check",
      combinedText: Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n"),
      exitCode: 0,
    });

    expect(result.classification.family).toBe("generic");
    expect(result.inlineText).toContain("lines omitted");
  });

  it("does not generic-compact file inspection output", async () => {
    const rawText = [
      "{",
      "  \"patterns\": [",
      "    \"AssertionError\",",
      "    \"TypeError\"",
      "  ]",
      "}",
    ].join("\n");

    const result = await reduceExecution({
      toolName: "exec",
      command: "sed -n '1,80p' src/rules/search/rg.json",
      argv: ["sed", "-n", "1,80p", "src/rules/search/rg.json"],
      stdout: rawText,
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("generic/fallback");
    expect(result.inlineText).toBe(rawText);
    expect(result.stats.ratio).toBe(1);
  });

  it.each([
    { label: "cat", command: "cat src/rules/search/rg.json", argv: ["cat", "src/rules/search/rg.json"] },
    { label: "head", command: "head -n 20 src/rules/search/rg.json", argv: ["head", "-n", "20", "src/rules/search/rg.json"] },
    { label: "tail", command: "tail -n 20 src/rules/search/rg.json", argv: ["tail", "-n", "20", "src/rules/search/rg.json"] },
    { label: "nl", command: "nl -ba src/rules/search/rg.json", argv: ["nl", "-ba", "src/rules/search/rg.json"] },
    { label: "jq", command: "jq '.patterns' src/rules/search/rg.json", argv: ["jq", ".patterns", "src/rules/search/rg.json"] },
  ])("keeps $label file inspection output verbatim under generic fallback", async ({ command, argv }) => {
    const rawText = [
      "{",
      "  \"patterns\": [",
      "    \"AssertionError\",",
      "    \"TypeError\"",
      "  ]",
      "}",
    ].join("\n");

    const result = await reduceExecution({
      toolName: "exec",
      command,
      argv,
      stdout: rawText,
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("generic/fallback");
    expect(result.inlineText).toBe(rawText);
    expect(result.stats.ratio).toBe(1);
  });

  it("still compacts filesystem inventory commands through their dedicated reducers", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "find src/rules -maxdepth 2 -type f",
      argv: ["find", "src/rules", "-maxdepth", "2", "-type", "f"],
      stdout: Array.from({ length: 60 }, (_, index) => `src/rules/example-${index + 1}.json`).join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("filesystem/find");
    expect(result.inlineText).toContain("60 matches");
    expect(result.stats.ratio).toBeLessThan(0.5);
  });

  it.each([
    {
      command: "rg --files src/rules",
      argv: ["rg", "--files", "src/rules"],
      reducer: "filesystem/rg-files",
    },
    {
      command: "git ls-files src",
      argv: ["git", "ls-files", "src"],
      reducer: "filesystem/git-ls-files",
    },
    {
      command: "git -C repo ls-files src",
      argv: ["git", "-C", "repo", "ls-files", "src"],
      reducer: "filesystem/git-ls-files",
    },
    {
      command: "fd codex src",
      argv: ["fd", "codex", "src"],
      reducer: "filesystem/fd",
    },
  ])("compacts $command through a filesystem inventory reducer", async ({ command, argv, reducer }) => {
    const result = await reduceExecution({
      toolName: "exec",
      command,
      argv,
      stdout: Array.from({ length: 60 }, (_, index) => `src/path-${index + 1}.ts`).join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe(reducer);
    expect(result.inlineText).toContain("60 paths");
    expect(result.stats.ratio).toBeLessThan(0.5);
  });

  it("does not treat unrelated git commands containing ls-files as git ls-files inventory", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "git grep ls-files src",
      combinedText: Array.from({ length: 30 }, (_, index) => `src/file-${index + 1}.ts:${index + 1}: mentions ls-files`).join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("search/git-grep");
  });

  it("does not route unsafe inventory pipelines into filesystem reducers without adapter gating", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "rg --files | rg TODO src",
      combinedText: Array.from({ length: 40 }, (_, index) => `src/file-${index + 1}.ts`).join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).not.toBe("filesystem/rg-files");
  });

  it("does not count normal rg --files paths containing error as errors", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "rg --files src",
      combinedText: "src/error.ts\nsrc/normal.ts\n",
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("filesystem/rg-files");
    expect(result.facts?.path).toBe(2);
    expect(result.facts?.error).toBe(0);
  });

  it("does not count normal fd paths containing error as errors", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "fd src",
      combinedText: "src/error.ts\nsrc/normal.ts\n",
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("filesystem/fd");
    expect(result.facts?.path).toBe(2);
    expect(result.facts?.error).toBe(0);
  });

  it("counts fd error-prefixed output as errors instead of paths", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "fd src",
      combinedText: "[fd error]: regex parse error\nsrc/normal.ts\n",
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("filesystem/fd");
    expect(result.facts?.path).toBe(1);
    expect(result.facts?.error).toBe(1);
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

  it("matches setup-wrapped swift test commands via the effective command", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "cd apps/macos && swift test --filter Foo",
      combinedText: [
        "Building for debugging...",
        "Test Case 'FooTests.testExample' failed (0.12 seconds).",
        "Executed 1 test, with 1 failure (0 unexpected) in 0.12 (0.12) seconds",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("tests/swift-test");
    expect(result.classification.matchedVia).toBe("effective");
    expect(result.classification.matchedCommand).toBe("swift test --filter Foo");
  });

  it("matches shell-wrapped pnpm test commands without falling back to generic", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "bash -lc 'cd repo && pnpm test'",
      combinedText: [
        "> tokenjuice@0.2.0 test /repo",
        "> vitest run",
        "",
        " RUN  v3.2.4 /repo",
        "",
        " FAIL  test/example.test.ts > example",
        " AssertionError: expected 1 to be 2",
        " Test Files  1 failed (1)",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("tests/pnpm-test");
    expect(result.classification.matchedVia).toBe("effective");
    expect(result.classification.matchedCommand).toBe("pnpm test");
  });

  it("matches shell wrappers that use clustered -c flags", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "sh -ceu 'cd repo && pnpm test'",
      combinedText: [
        "> tokenjuice@0.2.0 test /repo",
        "> vitest run",
        "",
        " FAIL  test/example.test.ts > example",
        " AssertionError: expected 1 to be 2",
        " Test Files  1 failed (1)",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("tests/pnpm-test");
    expect(result.classification.matchedVia).toBe("effective");
    expect(result.classification.matchedCommand).toBe("pnpm test");
  });

  it("matches env-prefixed swift build commands via the effective command", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "FOO=1 BAR=2 swift build",
      combinedText: [
        "Planning build",
        "Build complete! (1.23s)",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("build/swift-build");
    expect(result.classification.matchedVia).toBe("effective");
    expect(result.classification.matchedCommand).toBe("swift build");
  });

  it("matches argv-only env-prefixed swift build commands with spaced assignment values", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      argv: ["FOO=a b", "swift", "build"],
      combinedText: [
        "Planning build",
        "Build complete! (1.23s)",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("build/swift-build");
    expect(result.classification.matchedVia).toBe("effective");
    expect(result.classification.matchedCommand).toBe("swift build");
  });

  it("matches shell-wrapped xcodebuild commands via the effective command", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "bash -lc 'cd apps/ios && xcodebuild -project App.xcodeproj -scheme App build'",
      combinedText: [
        "Command line invocation:",
        "    /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -project App.xcodeproj -scheme App build",
        "",
        "Resolve Package Graph",
        "/repo/apps/ios/Sources/Foo.swift:17:12: error: cannot find 'missingSymbol' in scope",
        "The following build commands failed:",
        "\tSwiftCompile normal arm64 /repo/apps/ios/Sources/Foo.swift",
        "** BUILD FAILED **",
      ].join("\n"),
      exitCode: 65,
    });

    expect(result.classification.matchedReducer).toBe("build/xcodebuild");
    expect(result.classification.matchedVia).toBe("effective");
    expect(result.classification.matchedCommand).toBe("xcodebuild -project App.xcodeproj -scheme App build");
  });

  it("matches shell-wrapped xcodebuild commands directly from the shell body when no setup is present", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "bash -lc 'xcodebuild -project App.xcodeproj -scheme App build'",
      combinedText: [
        "Command line invocation:",
        "    /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -project App.xcodeproj -scheme App build",
        "** BUILD FAILED **",
      ].join("\n"),
      exitCode: 65,
    });

    expect(result.classification.matchedReducer).toBe("build/xcodebuild");
    expect(result.classification.matchedVia).toBe("shell-body");
    expect(result.classification.matchedCommand).toBe("xcodebuild -project App.xcodeproj -scheme App build");
  });

  it("matches wrapped cargo, npm, and yarn test commands", async () => {
    const cases = [
      {
        command: "source .env && cargo test",
        expectedReducer: "tests/cargo-test",
        expectedCommand: "cargo test",
        output: ["running 1 test", "test sample ... FAILED", "test result: FAILED. 0 passed; 1 failed;"].join("\n"),
      },
      {
        command: "cd repo && npm test",
        expectedReducer: "tests/npm-test",
        expectedCommand: "npm test",
        output: ["FAIL test/example.test.ts", "AssertionError: expected 1 to be 2", "Test Files  1 failed (1)"].join("\n"),
      },
      {
        command: "cd repo && yarn test",
        expectedReducer: "tests/yarn-test",
        expectedCommand: "yarn test",
        output: ["FAIL test/example.test.ts", "AssertionError: expected 1 to be 2", "Test Files  1 failed (1)"].join("\n"),
      },
    ] as const;

    for (const testCase of cases) {
      const result = await reduceExecution({
        toolName: "exec",
        command: testCase.command,
        combinedText: testCase.output,
        exitCode: 1,
      });

      expect(result.classification.matchedReducer).toBe(testCase.expectedReducer);
      expect(result.classification.matchedVia).toBe("effective");
      expect(result.classification.matchedCommand).toBe(testCase.expectedCommand);
    }
  });

  it("matches wrapped rg search commands and prefers the first substantive command in a chain", async () => {
    const searchResult = await reduceExecution({
      toolName: "exec",
      command: "pwd && rg -n AssertionError src",
      combinedText: "src/example.ts:12:throw new AssertionError('boom')",
      exitCode: 0,
    });

    expect(searchResult.classification.matchedReducer).toBe("search/rg");
    expect(searchResult.classification.matchedVia).toBe("effective");
    expect(searchResult.classification.matchedCommand).toBe("rg -n AssertionError src");

    const firstCommandWins = await reduceExecution({
      toolName: "exec",
      command: "cd repo && swift test && rg -n failure src",
      combinedText: [
        "Test Case 'FooTests.testExample' failed (0.12 seconds).",
        "Executed 1 test, with 1 failure (0 unexpected) in 0.12 (0.12) seconds",
      ].join("\n"),
      exitCode: 1,
    });

    expect(firstCommandWins.classification.matchedReducer).toBe("tests/swift-test");
    expect(firstCommandWins.classification.matchedVia).toBe("effective");
    expect(firstCommandWins.classification.matchedCommand).toBe("swift test");
  });

  it("keeps wrapped file inspection output verbatim under generic fallback", async () => {
    const rawText = [
      "# tokenjuice",
      "",
      "A tiny command-output reducer.",
    ].join("\n");

    const result = await reduceExecution({
      toolName: "exec",
      command: "cd repo && cat README.md",
      stdout: rawText,
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("generic/fallback");
    expect(result.inlineText).toBe(rawText);
    expect(result.stats.ratio).toBe(1);
  });

  it("keeps clustered shell-wrapped file inspection output verbatim under generic fallback", async () => {
    const rawText = [
      "# tokenjuice",
      "",
      "A tiny command-output reducer.",
    ].join("\n");

    const result = await reduceExecution({
      toolName: "exec",
      command: "bash -ec 'cat README.md'",
      stdout: rawText,
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("generic/fallback");
    expect(result.inlineText).toBe(rawText);
    expect(result.stats.ratio).toBe(1);
  });

  it("makes GitHub Actions multi-command shell failures actionable", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      combinedText: [
        "Run set -euo pipefail",
        "  set -euo pipefail",
        "  plugin-extension-boundary",
        "  lint:tmp:no-random-messaging",
        "  lint:tmp:channel-agnostic-boundaries",
        "  lint:tmp:tsgo-core-boundary",
        "  lint:tmp:no-raw-channel-fetch",
        "  lint:agent:ingress-owner",
        "  lint:plugins:no-register-http-handler",
        "  lint:plugins:no-monolithic-plugin-sdk-entry-imports",
        "  lint:plugins:no-extension-src-imports",
        "  lint:plugins:no-extension-test-core-imports",
        "  lint:plugins:plugin-sdk-subpaths-exported",
        "  deps:root-ownership:check",
        "  web-search-provider-boundary",
        "  web-fetch-provider-boundary",
        "  extension-src-outside-plugin-sdk-boundary",
        "  extension-plugin-sdk-internal-boundary",
        "  extension-relative-outside-package-boundary",
        "  lint:ui:no-raw-window-open",
        "  shell: /usr/bin/bash -e {0}",
        "Error: Process completed with exit code 1.",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("generic/fallback");
    expect(result.inlineText).toContain("GitHub Actions shell step failed (exit 1).");
    expect(result.inlineText).toContain("Failing command: not visible");
    expect(result.inlineText).toContain("this shell step ran 18 commands");
    expect(result.inlineText).toContain("- plugin-extension-boundary");
    expect(result.inlineText).toContain("- lint:ui:no-raw-window-open");
    expect(result.inlineText).not.toContain("- set -euo pipefail");
    expect(result.inlineText).toContain("Error: Process completed with exit code 1.");
  });

  it("finds the same wrapped rule match used by classification", async () => {
    const rule = await findMatchingRule({
      toolName: "exec",
      command: "set -euo pipefail && pnpm test",
    });

    expect(rule?.rule.id).toBe("tests/pnpm-test");
  });

  it("supports rule-level onEmpty fallbacks after filtering", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "tokenjuice-on-empty-"));
    tempDirs.push(cwd);
    const rulesDir = join(cwd, ".tokenjuice", "rules", "custom");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "empty-ok.json"),
      JSON.stringify({
        id: "custom/empty-ok",
        family: "custom",
        onEmpty: "custom: ok",
        match: {
          argv0: ["custom-tool"],
        },
        filters: {
          skipPatterns: ["^noise$"],
        },
        transforms: {
          trimEmptyEdges: true,
        },
      }, null, 2),
      "utf8",
    );

    const result = await reduceExecution({
      toolName: "exec",
      command: "custom-tool check",
      argv: ["custom-tool", "check"],
      combinedText: "noise\nnoise\n",
      exitCode: 0,
    }, { cwd });

    expect(result.classification.matchedReducer).toBe("custom/empty-ok");
    expect(result.inlineText).toBe("custom: ok");
  });

  it("supports rule-level matchOutput short-circuits before summarization", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "tokenjuice-match-output-"));
    tempDirs.push(cwd);
    const rulesDir = join(cwd, ".tokenjuice", "rules", "custom");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "match-output.json"),
      JSON.stringify({
        id: "custom/match-output",
        family: "custom",
        match: {
          argv0: ["custom-tool"],
        },
        matchOutput: [
          {
            pattern: "All checks passed",
            message: "custom: checks passed",
          },
        ],
        summarize: {
          head: 1,
          tail: 1,
        },
      }, null, 2),
      "utf8",
    );

    const result = await reduceExecution({
      toolName: "exec",
      command: "custom-tool check",
      argv: ["custom-tool", "check"],
      combinedText: [
        "Preparing workspace...",
        "All checks passed in 42ms",
        "Additional verbose line that should never matter",
      ].join("\n"),
      exitCode: 0,
    }, { cwd });

    expect(result.classification.matchedReducer).toBe("custom/match-output");
    expect(result.inlineText).toBe("custom: checks passed");
  });

  it("pretty-prints minified JSON before applying line-based reducers when enabled", async () => {
    const result = await reduceExecution({
      toolName: "sessions_history",
      combinedText: JSON.stringify({
        sessionKey: "agent:john:main",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Task complete. All tests passing, 12 of 12 green.",
              },
            ],
            api: "openai-codex-responses",
            provider: "openai-codex",
            model: "gpt-5.4",
            stopReason: "stop",
            timestamp: 1776296991381,
            responseId: "resp_0f53cb2184abb0830169e0241fec50819a85da550a72e23ebc",
            __openclaw: {
              id: "39b8bd8e",
              seq: 859,
            },
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "John - sprint status update needed.",
              },
            ],
            timestamp: 1776301782870,
            provenance: {
              kind: "inter_session",
              sourceSessionKey: "agent:josh:reef-s5b-watch",
              sourceTool: "sessions_send",
            },
            __openclaw: {
              id: "88b5e984",
              seq: 860,
            },
          },
          {
            role: "assistant",
            content: [
              {
                type: "thinking",
                thinking: "Let me check the current sprint state and prepare a status update...",
              },
              {
                type: "text",
                text: "Sprint 5B status: READY_FOR_ELI. All verification tests passing. Commit 8b048af frozen.",
              },
            ],
            api: "openai-codex-responses",
            provider: "openai-codex",
            model: "gpt-5.4",
            stopReason: "stop",
            timestamp: 1776301782888,
            responseId: "resp_0f53cb2184abb0830169e036d76100819abfe6de80a224e1e0",
            __openclaw: {
              id: "e7b08245",
              seq: 861,
            },
          },
        ],
        truncated: true,
        droppedMessages: false,
        contentTruncated: true,
        contentRedacted: false,
        bytes: 2840,
      }),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("openclaw/sessions-history");
    expect(result.inlineText).toContain("\"sourceSessionKey\": \"agent:josh:reef-s5b-watch\"");
    expect(result.inlineText).toContain("\"sourceTool\": \"sessions_send\"");
    expect(result.inlineText).toContain("\"truncated\": true");
    expect(result.inlineText).toContain("Sprint 5B status: READY_FOR_ELI");
    expect(result.inlineText).not.toContain("openai-codex-responses");
    expect(result.inlineText).not.toContain("gpt-5.4");
    expect(result.inlineText).not.toContain("resp_0f53cb2184");
    expect(result.inlineText).not.toContain("\"id\": \"39b8bd8e\"");
    expect(result.inlineText).not.toContain("Let me check the current sprint state");
    expect(result.facts).toEqual({
      message: 3,
      blocker: 0,
    });
    expect(result.stats.ratio).toBeLessThan(0.75);
  });

  it("uses builtin onEmpty for notice-only npm install output", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "npm install",
      argv: ["npm", "install"],
      combinedText: [
        "npm notice New major version of npm available! 10.0.0 -> 10.1.0",
        "npm notice Changelog: https://github.com/npm/cli/releases/tag/v10.1.0",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("install/npm-install");
    expect(result.inlineText).toBe("npm install: ok");
  });

  it("uses builtin matchOutput for up-to-date npm install output", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "npm install",
      argv: ["npm", "install"],
      combinedText: "up to date, audited 42 packages in 612ms\n",
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("install/npm-install");
    expect(result.inlineText).toBe("npm install: up to date");
  });

  it("uses builtin matchOutput for up-to-date npm ci output", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "npm ci",
      argv: ["npm", "ci"],
      combinedText: "up to date, audited 42 packages in 612ms\n",
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("install/npm-ci");
    expect(result.inlineText).toBe("npm ci: up to date");
  });

  it("uses pnpm build wrapper compaction when only lifecycle banners remain", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm build",
      argv: ["pnpm", "build"],
      combinedText: [
        "> tokenjuice@0.6.0 build /repo",
        "> rm -rf dist && pnpm generate:builtin-rules && tsc -p tsconfig.json",
        "",
        "> tokenjuice@0.6.0 generate:builtin-rules /repo",
        "> node scripts/generate-builtin-rules.mjs",
        "",
        "Done in 2.4s",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("build/pnpm-build");
    expect(result.inlineText).toBe("pnpm build: ok");
  });

  it.each([
    {
      label: "pnpm up to date",
      command: "pnpm install",
      argv: ["pnpm", "install"],
      combinedText: "Lockfile is up to date, resolution step is skipped\nAlready up to date\nDone in 612ms\n",
      expected: "pnpm install: up to date",
    },
    {
      label: "yarn up to date",
      command: "yarn install",
      argv: ["yarn", "install"],
      combinedText: "[1/4] Resolving packages...\nsuccess Already up-to-date.\nDone in 0.42s.\n",
      expected: "yarn install: up to date",
    },
    {
      label: "bun up to date",
      command: "bun install",
      argv: ["bun", "install"],
      combinedText: "bun install v1.1.0\nChecked 43 installs across 71 packages (no changes)\n",
      expected: "bun install: up to date",
    },
  ])("uses builtin $label matchOutput", async ({ command, argv, combinedText, expected }) => {
    const result = await reduceExecution({
      toolName: "exec",
      command,
      argv,
      combinedText,
      exitCode: 0,
    });

    expect(result.inlineText).toBe(expected);
  });

  it("does not prepend awkward pass counters for clean test output", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm test test/core/reduce.test.ts",
      argv: ["pnpm", "test", "test/core/reduce.test.ts"],
      combinedText: [
        "> tokenjuice@0.2.0 test /repo",
        "> vitest run test/core/reduce.test.ts",
        "",
        " RUN  v3.2.4 /repo",
        "",
        " ✓ test/core/reduce.test.ts (44 tests) 56ms",
        "",
        " Test Files  1 passed (1)",
        "      Tests  44 passed (44)",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("tests/pnpm-test");
    expect(result.inlineText).not.toContain("passeds");
    expect(result.stats.reducedChars).toBeLessThanOrEqual(result.stats.rawChars);
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
    expect(result.inlineText).toContain("TS2322");
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

  it("does not bloat already-short output with extra framing", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "git status --short --branch",
      argv: ["git", "status", "--short", "--branch"],
      combinedText: "## main...origin/main\n",
      exitCode: 0,
    });

    expect(result.inlineText).toBe("## main...origin/main");
    expect(result.stats.reducedChars).toBeLessThanOrEqual(result.stats.rawChars);
  });

  it("passes through short generic output when compaction would be longer", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "node dist/cli/main.js verify --fixtures",
      combinedText: "ok: 93 rules validated, 93 fixtures verified\n",
      exitCode: 0,
    });

    expect(result.inlineText).toBe("ok: 93 rules validated, 93 fixtures verified");
    expect(result.stats.reducedChars).toBeLessThan(result.stats.rawChars);
    expect(result.compaction?.authoritative).toBe(false);
  });

  it("marks head-tail summaries as authoritative compaction when lines were omitted", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "git log --oneline",
      argv: ["git", "log", "--oneline"],
      combinedText: Array.from({ length: 20 }, (_, index) => `${(index + 1).toString(16).padStart(7, "a")} feat: commit ${index}`).join("\n"),
      exitCode: 0,
    });

    expect(result.inlineText).toContain("commits");
    expect(result.inlineText).toContain("omitted");
    expect(result.compaction).toEqual({ authoritative: true, kinds: ["head-tail-omission"] });
  });

  it("does not mark rewritten-but-lossless output as authoritative compaction", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "git branch -d fix/cd-prefixed-raw-bypass-main 2>&1",
      combinedText: "Deleted branch fix/cd-prefixed-raw-bypass-main (was 76b6858).\n",
      exitCode: 0,
    });

    expect(result.inlineText).toBe("Deleted branch fix/cd-prefixed-raw-bypass-main (was 76b6858).");
    expect(result.stats.reducedChars).toBeLessThan(result.stats.rawChars);
    expect(result.compaction?.authoritative).toBe(false);
  });

  it("marks structured inspection summaries as authoritative compaction", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "sed -n '1,260p' notes.txt",
      argv: ["sed", "-n", "1,260p", "notes.txt"],
      combinedText: [
        "# Review",
        "intro",
        "## Evidence",
        ...Array.from({ length: 260 }, (_, index) => `paragraph ${index} ${"x".repeat(40)}`),
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("generic/large-document-summary");
    expect(result.compaction).toEqual({
      authoritative: true,
      kinds: ["inspection-large-document-summary", "head-tail-omission"],
    });
  });

  it("clears lossy compaction metadata when passthrough text wins", async () => {
    const rawText = `${Array.from({ length: 13 }, (_, index) => `v${index}`).join("\n")}\n`;
    const result = await reduceExecution({
      toolName: "exec",
      command: "custom-tool inspect",
      combinedText: rawText,
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("generic/fallback");
    expect(result.inlineText).toBe(rawText.trimEnd());
    expect(result.compaction?.authoritative).toBe(false);
  });

  it("keeps search output raw when the rewritten form would be longer but still fits inline", async () => {
    const rawText = [
      "src/hosts/claude-code/index.ts:101:1: recordStats option plumbing",
      "src/hosts/claude-code/index.ts:142:3: storeArtifactMetadata branch",
      "src/hosts/claude-code/index.ts:188:9: reduceExecution(input, options)",
      "src/hosts/claude-code/index.ts:220:7: inspection-command handling",
      "src/hosts/claude-code/index.ts:265:5: raw bypass preserve",
      "src/hosts/claude-code/index.ts:301:11: skipped low-savings-compaction",
      "src/hosts/claude-code/index.ts:344:13: writeHookDebug final record",
    ].join("\n");

    const result = await reduceExecution({
      toolName: "exec",
      command: "rg -n \"recordStats|storeArtifactMetadata|reduceExecution\\(|raw bypass|inspection-command|skip\" src/hosts/claude-code/index.ts",
      argv: ["rg", "-n", "recordStats|storeArtifactMetadata|reduceExecution\\(|raw bypass|inspection-command|skip", "src/hosts/claude-code/index.ts"],
      combinedText: rawText,
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("search/rg");
    expect(result.inlineText).toBe(rawText);
    expect(result.stats.ratio).toBe(1);
  });

  it("clips huge ripgrep match lines before selecting inline output", async () => {
    const longPayload = "x".repeat(4_000);
    const result = await reduceExecution({
      toolName: "exec",
      command: "rg -n payload fixtures",
      argv: ["rg", "-n", "payload", "fixtures"],
      combinedText: `fixtures/blob.json:1:${longPayload}`,
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("search/rg");
    expect(result.inlineText).toContain("fixtures/blob.json:1:");
    expect(result.inlineText).toContain("chars omitted");
    expect(result.inlineText).toContain("sha256:");
    expect(result.inlineText.length).toBeLessThan(900);
  });

  it("formats gh issue json-line output into compact issue summaries", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "gh issue list -R openclaw/openclaw --limit 2 --json number,title,url,comments,updatedAt,labels --jq '.[] | {number,title,url,comments:(.comments|length),updatedAt,labels:[.labels[].name]}'",
      argv: ["gh", "issue", "list", "--json", "number,title,url,comments,updatedAt,labels"],
      combinedText: [
        "{\"number\":67473,\"title\":\"[Bug]: Auto-compaction (threshold-based) never fires in embedded runner\",\"url\":\"https://github.com/openclaw/openclaw/issues/67473\",\"comments\":0,\"updatedAt\":\"2026-04-16T01:52:50Z\",\"labels\":[\"bug\",\"bug:behavior\"]}",
        "{\"number\":67469,\"title\":\"[Bug]: google-gemini-cli replies stop being persisted to OpenClaw session transcripts / WebUI history\",\"url\":\"https://github.com/openclaw/openclaw/issues/67469\",\"comments\":1,\"updatedAt\":\"2026-04-16T02:06:50Z\",\"labels\":[\"bug\",\"regression\"]}",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("cloud/gh");
    expect(result.inlineText).toContain("#67473");
    expect(result.inlineText).toContain("{bug, bug:behavior}");
    expect(result.inlineText).toContain("2026-04-16");
    expect(result.inlineText).not.toContain("\"number\":67473");
  });

  it("formats gh json arrays without requiring jq line mode", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "gh issue list -R openclaw/openclaw --limit 2 --json number,title,url,comments,updatedAt,labels",
      argv: ["gh", "issue", "list", "--json", "number,title,url,comments,updatedAt,labels"],
      combinedText: JSON.stringify([
        {
          number: 67473,
          title: "[Bug]: Auto-compaction (threshold-based) never fires in embedded runner",
          url: "https://github.com/openclaw/openclaw/issues/67473",
          comments: 0,
          updatedAt: "2026-04-16T01:52:50Z",
          labels: [{ name: "bug" }, { name: "bug:behavior" }],
        },
        {
          number: 67469,
          title: "[Bug]: google-gemini-cli replies stop being persisted to OpenClaw session transcripts / WebUI history",
          url: "https://github.com/openclaw/openclaw/issues/67469",
          comments: 1,
          updatedAt: "2026-04-16T02:06:50Z",
          labels: [{ name: "bug" }, { name: "regression" }],
        },
      ], null, 2),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("cloud/gh");
    expect(result.inlineText).toContain("#67473");
    expect(result.inlineText).toContain("{bug, bug:behavior}");
    expect(result.inlineText).not.toContain("\"labels\"");
  });

  it("formats gh review comments into compact body hashes", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "gh api repos/openclaw/openclaw/pulls/1/comments --paginate",
      argv: ["gh", "api", "repos/openclaw/openclaw/pulls/1/comments", "--paginate"],
      combinedText: JSON.stringify([
        {
          id: 123,
          user: { login: "reviewer" },
          path: "src/index.ts",
          line: 42,
          body: `Please fix this path. ${"details ".repeat(80)}`,
          created_at: "2026-04-20T12:00:00Z",
        },
      ]),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("cloud/gh");
    expect(result.inlineText).toContain("comment #123 @reviewer src/index.ts:42");
    expect(result.inlineText).toContain("sha256:");
    expect(result.inlineText).not.toContain("\"body\"");
    expect(result.compaction).toEqual({ authoritative: true, kinds: ["hashed-middle-clip"] });
  });

  it("clips large git diff hunks while keeping exact file and hunk headers", async () => {
    const changedLines = Array.from({ length: 30 }, (_, index) => `+const value${index} = "${"x".repeat(80)}";`);
    const result = await reduceExecution({
      toolName: "exec",
      command: "git diff -- src/index.ts",
      argv: ["git", "diff", "--", "src/index.ts"],
      combinedText: [
        "diff --git a/src/index.ts b/src/index.ts",
        "index 1111111..2222222 100644",
        "--- a/src/index.ts",
        "+++ b/src/index.ts",
        "@@ -1,3 +1,33 @@",
        "-const old = true;",
        ...changedLines,
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("git/diff");
    expect(result.inlineText).toContain("diff --git a/src/index.ts b/src/index.ts");
    expect(result.inlineText).toContain("@@ -1,3 +1,33 @@");
    expect(result.inlineText).toContain("hunk clipped");
    expect(result.inlineText).not.toContain("value29");
    expect(result.facts?.["added line"]).toBe(30);
  });

  it("summarizes package-lock JSON file inspection instead of replaying the whole lockfile", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "jq . package-lock.json",
      argv: ["jq", ".", "package-lock.json"],
      combinedText: JSON.stringify({
        name: "tokenjuice",
        version: "0.6.0",
        lockfileVersion: 3,
        packages: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`node_modules/pkg-${index}`, { version: "1.0.0" }])),
        dependencies: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`pkg-${index}`, { version: "1.0.0" }])),
      }, null, 2),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("generic/package-lock-summary");
    expect(result.inlineText).toContain("package-lock summary");
    expect(result.inlineText).toContain("packages: 80");
    expect(result.inlineText).not.toContain("\"node_modules/pkg-79\"");
  });

  it("summarizes large document-shaped file inspections without path allowlists", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "sed -n '1,260p' notes.txt",
      argv: ["sed", "-n", "1,260p", "notes.txt"],
      combinedText: [
        "# Review",
        "intro",
        "## Evidence",
        ...Array.from({ length: 260 }, (_, index) => `paragraph ${index} ${"x".repeat(40)}`),
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("generic/large-document-summary");
    expect(result.inlineText).toContain("large document summary");
    expect(result.inlineText).toContain("- # Review");
    expect(result.inlineText).toContain("- ## Evidence");
  });

  it("keeps large code-shaped file inspections raw", async () => {
    const code = Array.from({ length: 260 }, (_, index) => `export function value${index}() { return ${index}; }`).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "cat src/generated.ts",
      argv: ["cat", "src/generated.ts"],
      combinedText: code,
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("generic/fallback");
    expect(result.inlineText).toBe(code);
  });

  it("formats gh run json objects and nested jobs into compact summaries", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "gh run view 24524437739 --repo openclaw/openclaw --json createdAt,updatedAt,status,conclusion,jobs,url,displayTitle",
      argv: ["gh", "run", "view", "24524437739", "--json", "createdAt,updatedAt,status,conclusion,jobs,url,displayTitle"],
      combinedText: JSON.stringify({
        displayTitle: "checks: tighten tokenjuice reducers",
        status: "completed",
        conclusion: "success",
        createdAt: "2026-04-20T19:00:00Z",
        updatedAt: "2026-04-20T19:18:32Z",
        jobs: [
          {
            databaseId: 71690896188,
            name: "checks-node-core-security",
            status: "completed",
            conclusion: "success",
            startedAt: "2026-04-20T19:00:10Z",
            completedAt: "2026-04-20T19:05:25Z",
          },
          {
            databaseId: 71690896311,
            name: "checks-node-core-runtime",
            status: "completed",
            conclusion: "success",
            startedAt: "2026-04-20T19:00:20Z",
            completedAt: "2026-04-20T19:11:00Z",
          },
        ],
      }, null, 2),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("cloud/gh");
    expect(result.inlineText).toContain("checks: tighten tokenjuice reducers");
    expect(result.inlineText).toContain("#71690896188 checks-node-core-security");
    expect(result.inlineText).toContain("5m15s");
    expect(result.inlineText).toContain("#71690896311 checks-node-core-runtime");
    expect(result.inlineText).not.toContain("\"jobs\"");
  });

  it("formats gh table output into compact list lines", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "gh pr list",
      argv: ["gh", "pr", "list"],
      combinedText: [
        "123  feat: add tokenjuice cloud reducers        vincentkoc:main   OPEN",
        "122  fix: tighten fixture verification          vincentkoc:main   OPEN",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("cloud/gh");
    expect(result.inlineText).toContain("#123 feat: add tokenjuice cloud reducers [OPEN] (vincentkoc:main)");
    expect(result.inlineText).not.toContain("        ");
  });

  it("formats wrapped gh table output using the matched effective command", async () => {
    const wrappedTable = [
      "123  feat: add tokenjuice cloud reducers        vincentkoc:main   OPEN",
      "122  fix: tighten fixture verification          vincentkoc:main   OPEN",
    ].join("\n");

    const setupWrapped = await reduceExecution({
      toolName: "exec",
      command: "cd repo && gh pr list",
      combinedText: wrappedTable,
      exitCode: 0,
    });

    expect(setupWrapped.classification.matchedReducer).toBe("cloud/gh");
    expect(setupWrapped.classification.matchedVia).toBe("effective");
    expect(setupWrapped.inlineText).toContain("#123 feat: add tokenjuice cloud reducers [OPEN] (vincentkoc:main)");
    expect(setupWrapped.inlineText).not.toContain("        ");

    const shellWrapped = await reduceExecution({
      toolName: "exec",
      command: "bash -lc 'gh pr list'",
      combinedText: wrappedTable,
      exitCode: 0,
    });

    expect(shellWrapped.classification.matchedReducer).toBe("cloud/gh");
    expect(shellWrapped.classification.matchedVia).toBe("shell-body");
    expect(shellWrapped.inlineText).toContain("#123 feat: add tokenjuice cloud reducers [OPEN] (vincentkoc:main)");
    expect(shellWrapped.inlineText).not.toContain("        ");
  });

  it("formats gh actions log lines into compact job and step summaries", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "gh run view 24526018547 -R openclaw/openclaw --job 71696981540 --log",
      argv: ["gh", "run", "view", "24526018547", "--job", "71696981540", "--log"],
      combinedText: [
        "checks-node-core-security\tCheckout\t2026-04-20T19:00:10.000Z\tFetching the repository",
        "checks-node-core-security\tCheckout\t2026-04-20T19:00:11.000Z\tgit version 2.49.0",
        "checks-node-core-security\tRun Node test shard\t2026-04-20T19:04:00.000Z\terror: timed out talking to registry",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("cloud/gh");
    expect(result.inlineText).toContain("checks-node-core-security | Checkout | Fetching the repository");
    expect(result.inlineText).toContain("checks-node-core-security | Run Node test shard | error: timed out talking to registry");
    expect(result.inlineText).not.toContain("2026-04-20T19:00:10.000Z");
  });

  it("keeps middle gh actions error signals from long run logs", async () => {
    const filler = Array.from(
      { length: 80 },
      (_, index) =>
        `check-test-types\tRun check shard\t2026-04-28T06:34:${String(index % 60).padStart(2, "0")}.000Z\tprogress line ${index}`,
    );
    const result = await reduceExecution({
      toolName: "exec",
      command: "gh run view 25037757449 --repo openclaw/openclaw --log",
      argv: ["gh", "run", "view", "25037757449", "--log"],
      combinedText: [
        ...filler.slice(0, 40),
        "check-test-types\tRun check shard\t2026-04-28T06:35:06.000Z\t##[error]extensions/tokenjuice/tool-result-middleware.test.ts(89,19): error TS2345: Argument of type Mock is not assignable",
        "check-test-types\tRun check shard\t2026-04-28T06:35:07.000Z\tELIFECYCLE Command failed with exit code 2",
        ...filler.slice(40),
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("cloud/gh");
    expect(result.inlineText).toContain("error TS2345");
    expect(result.inlineText).toContain("ELIFECYCLE Command failed with exit code 2");
    expect(result.inlineText).toContain("non-signal log lines omitted");
    expect(result.inlineText).not.toContain("progress line 0");
    expect(result.inlineText).not.toContain("2026-04-28T06:35:06.000Z");
  });

  it("preserves emoji and CJK while stripping ANSI from user-facing output and stats", async () => {
    const visibleText = ["错误🔥", "修复🙂", "完了✅"].join("\n");
    const coloredText = [
      "\u001b[38;5;196m错误🔥\u001b[0m",
      "\u001b[38;2;120;200;255m修复🙂\u001b[0m",
      "\u001b]8;;https://openclaw.ai\u0007完了✅\u001b]8;;\u0007",
    ].join("\n");

    const result = await reduceExecution({
      toolName: "exec",
      command: "custom-tool unicode",
      combinedText: coloredText,
      exitCode: 0,
    });

    expect(result.inlineText).toContain("错误🔥");
    expect(result.inlineText).toContain("修复🙂");
    expect(result.inlineText).toContain("完了✅");
    expect(result.inlineText).not.toContain("\u001b");
    expect(result.stats.rawChars).toBe(countTextChars(visibleText));
    expect(result.stats.reducedChars).toBe(countTextChars(result.inlineText));
  });

  it("compresses noisy docker build output aggressively", async () => {
    const progress = Array.from(
      { length: 80 },
      (_, index) => `#7 ${index + 1}.23 downloading layer ${index + 1}/80`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "docker build .",
      argv: ["docker", "build", "."],
      combinedText: [
        "#1 [internal] load build definition from Dockerfile",
        "#1 DONE 0.0s",
        "#2 [2/5] RUN pnpm install",
        progress,
        "#2 DONE 18.2s",
        "#3 [3/5] RUN pnpm build",
        "#3 ERROR: process \"/bin/sh -c pnpm build\" did not complete successfully",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("devops/docker-build");
    expect(result.inlineText).toContain("#3 ERROR");
    expect(result.stats.ratio).toBeLessThan(0.5);
  });

  it("compresses noisy kubectl logs around warning and error lines", async () => {
    const info = Array.from(
      { length: 120 },
      (_, index) => `2026-04-14T12:00:${String(index).padStart(2, "0")}Z info request ${index} ok`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "kubectl logs api-123",
      argv: ["kubectl", "logs", "api-123"],
      combinedText: [
        info,
        "2026-04-14T12:02:00Z warn database latency above threshold",
        "2026-04-14T12:02:01Z error timeout talking to redis",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("devops/kubectl-logs");
    expect(result.inlineText).toContain("warn database latency above threshold");
    expect(result.inlineText).toContain("error timeout talking to redis");
    expect(result.stats.ratio).toBeLessThan(0.2);
  });

  it("compresses noisy vitest stack traces while keeping failure summary", async () => {
    const stack = Array.from(
      { length: 90 },
      (_, index) => `    at someDeepFrame${index} (/repo/node_modules/pkg/file${index}.js:${index + 1}:1)`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm vitest",
      argv: ["pnpm", "vitest"],
      combinedText: [
        "RUN  v3.2.4 /repo",
        " ❯ test/example.test.ts (2 tests | 1 failed)",
        "AssertionError: expected 1 to be 2",
        stack,
        " Test Files  1 failed (1)",
        "      Tests  1 failed | 1 passed (2)",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("tests/vitest");
    expect(result.inlineText).toContain("AssertionError: expected 1 to be 2");
    expect(result.inlineText).toContain("Test Files  1 failed (1)");
    expect(result.stats.ratio).toBeLessThan(0.25);
  });

  it("compresses noisy pytest output while keeping failure summary", async () => {
    const passed = Array.from(
      { length: 120 },
      (_, index) => `test_api.py::test_case_${index} PASSED`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "pytest",
      argv: ["pytest"],
      combinedText: [
        "platform darwin -- Python 3.12.0, pytest-8.3.0",
        "rootdir: /repo",
        passed,
        "__________________________ test_save __________________________",
        "test_api.py::test_save FAILED",
        "E   AssertionError: expected 201 == 200",
        "================ 1 failed, 120 passed in 1.20s ================",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("tests/pytest");
    expect(result.inlineText).toContain("test_api.py::test_save FAILED");
    expect(result.inlineText).toContain("1 failed, 120 passed");
    expect(result.facts).toEqual({
      "failed test": 1,
      "passed test": 120,
    });
    expect(result.stats.ratio).toBeLessThan(0.2);
  });

  it("compresses noisy rg output while keeping match lines", async () => {
    const matches = Array.from(
      { length: 180 },
      (_, index) => `src/file-${index}.ts:${index + 1}: TODO item ${index}`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "rg TODO src",
      argv: ["rg", "TODO", "src"],
      combinedText: matches,
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("search/rg");
    expect(result.inlineText).toContain("TODO item 0");
    expect(result.inlineText).toContain("lines omitted");
    expect(result.stats.ratio).toBeLessThan(0.2);
  });

  it("compresses noisy docker logs around failures", async () => {
    const info = Array.from(
      { length: 140 },
      (_, index) => `2026-04-14T12:00:${String(index).padStart(2, "0")}Z info worker ${index} ok`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "docker logs api",
      argv: ["docker", "logs", "api"],
      combinedText: [
        info,
        "2026-04-14T12:02:00Z warning: deprecated config",
        "2026-04-14T12:02:01Z error: failed to connect db",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("devops/docker-logs");
    expect(result.inlineText).toContain("warning: deprecated config");
    expect(result.inlineText).toContain("error: failed to connect db");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses noisy journalctl output around failures", async () => {
    const info = Array.from(
      { length: 140 },
      (_, index) => `Apr 14 api[123]: info processed request ${index}`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "journalctl -u api.service",
      argv: ["journalctl", "-u", "api.service"],
      combinedText: [
        info,
        "Apr 14 api[123]: warning: backlog growing",
        "Apr 14 api[123]: error: failed to bind port",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("service/journalctl");
    expect(result.inlineText).toContain("warning: backlog growing");
    expect(result.inlineText).toContain("error: failed to bind port");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses noisy go test output while keeping failing package details", async () => {
    const passing = Array.from(
      { length: 160 },
      (_, index) => `ok  github.com/example/pkg${index} 0.01${index % 10}s`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "go test ./...",
      argv: ["go", "test", "./..."],
      combinedText: [
        passing,
        "--- FAIL: TestSave (0.00s)",
        "    api_test.go:42: expected 200, got 500",
        "FAIL github.com/example/api 0.021s",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("tests/go-test");
    expect(result.inlineText).toContain("--- FAIL: TestSave");
    expect(result.inlineText).toContain("FAIL github.com/example/api 0.021s");
    expect(result.stats.ratio).toBeLessThan(0.1);
  });

  it("compresses large kubectl get tables while counting resource rows", async () => {
    const rows = Array.from(
      { length: 140 },
      (_, index) => `api-${index}   1/1   Running   0   ${index + 1}m`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "kubectl get pods",
      argv: ["kubectl", "get", "pods"],
      combinedText: [
        "NAME   READY   STATUS    RESTARTS   AGE",
        rows,
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("devops/kubectl-get");
    expect(result.facts?.resource).toBe(140);
    expect(result.inlineText).toContain("140 resources");
    expect(result.inlineText).toContain("NAME   READY   STATUS");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses large docker ps tables while counting containers", async () => {
    const rows = Array.from(
      { length: 130 },
      (_, index) => `c${index.toString().padStart(11, "0")}   api:${index}   "node server.js"   ${index + 1} hours ago   Up ${index + 1} hours   0.0.0.0:${3000 + index}->3000/tcp   api-${index}`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "docker ps",
      argv: ["docker", "ps"],
      combinedText: [
        "CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES",
        rows,
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("devops/docker-ps");
    expect(result.facts?.container).toBe(130);
    expect(result.inlineText).toContain("130 containers");
    expect(result.inlineText).toContain("CONTAINER ID   IMAGE");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses large docker images tables while counting image rows", async () => {
    const rows = Array.from(
      { length: 120 },
      (_, index) => `repo-${index}   latest   sha256:${index.toString().padStart(12, "0")}   ${index + 1} days ago   ${100 + index}MB`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "docker images",
      argv: ["docker", "images"],
      combinedText: [
        "REPOSITORY   TAG   IMAGE ID   CREATED   SIZE",
        rows,
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("devops/docker-images");
    expect(result.facts?.image).toBe(120);
    expect(result.inlineText).toContain("120 images");
    expect(result.inlineText).toContain("REPOSITORY   TAG");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses noisy eslint output while keeping diagnostics and summary", async () => {
    const noise = Array.from(
      { length: 120 },
      (_, index) => `src/file-${index}.ts\n  ${index + 1}:1  error  Unexpected any  @typescript-eslint/no-explicit-any`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm eslint src",
      argv: ["pnpm", "eslint", "src"],
      combinedText: [
        noise,
        "",
        "✖ 120 problems (120 errors, 0 warnings)",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("lint/eslint");
    expect(result.inlineText).toContain("✖ 120 problems");
    expect(result.inlineText).toContain("Unexpected any");
    expect(result.stats.ratio).toBeLessThan(0.2);
  });

  it("compresses noisy tsc output while keeping errors and summary", async () => {
    const errors = Array.from(
      { length: 90 },
      (_, index) => `src/file-${index}.ts(${index + 1},1): error TS2322: Type 'string' is not assignable to type 'number'.`,
    ).join("\n");
    const stats = [
      "Files:               918",
      "Lines of Library:  39012",
      "Memory used:      231000K",
      "Total time:         2.40s",
    ].join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm tsc --noEmit",
      argv: ["pnpm", "tsc", "--noEmit"],
      combinedText: [
        errors,
        stats,
        "Found 90 errors in 90 files.",
      ].join("\n"),
      exitCode: 2,
    });

    expect(result.classification.matchedReducer).toBe("build/tsc");
    expect(result.inlineText).toContain("TS2322");
    expect(result.inlineText).toContain("Found 90 errors in 90 files.");
    expect(result.inlineText).not.toContain("Memory used");
    expect(result.stats.ratio).toBeLessThan(0.2);
  });

  it("compresses noisy webpack output while keeping asset and error summaries", async () => {
    const assets = Array.from(
      { length: 70 },
      (_, index) => `asset chunk-${index}.js ${(index + 100)} KiB [emitted] [minimized]`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm webpack",
      argv: ["pnpm", "webpack"],
      combinedText: [
        assets,
        "Entrypoint main = runtime.js main.js",
        "ERROR in ./src/index.ts 12:4",
        "Module parse failed: Unexpected token (12:4)",
        "webpack 5.99.0 compiled with 1 error in 2143 ms",
      ].join("\n"),
      exitCode: 1,
    });

    expect(result.classification.matchedReducer).toBe("build/webpack");
    expect(result.inlineText).toContain("ERROR in ./src/index.ts 12:4");
    expect(result.inlineText).toContain("compiled with 1 error");
    expect(result.stats.ratio).toBeLessThan(0.2);
  });

  it("compresses large find output while counting matches", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "find . -name '*.ts'",
      argv: ["find", ".", "-name", "*.ts"],
      combinedText: Array.from({ length: 170 }, (_, index) => `./src/file-${index}.ts`).join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("filesystem/find");
    expect(result.facts?.match).toBe(170);
    expect(result.inlineText).toContain("170 matches");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses large ls output while counting items", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "ls -la",
      argv: ["ls", "-la"],
      combinedText: [
        "total 128",
        ...Array.from({ length: 160 }, (_, index) => `file-${index}.txt`),
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("filesystem/ls");
    expect(result.facts?.item).toBe(160);
    expect(result.inlineText).toContain("160 items");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses large du output while counting entries", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "du -sh .",
      argv: ["du", "-sh", "."],
      combinedText: Array.from({ length: 150 }, (_, index) => `${index + 1}M\t./dir-${index}`).join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("system/du");
    expect(result.facts?.entry).toBe(150);
    expect(result.inlineText).toContain("150 entries");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses large ps output while counting processes", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "ps aux",
      argv: ["ps", "aux"],
      combinedText: [
        "USER PID %CPU %MEM COMMAND",
        ...Array.from({ length: 150 }, (_, index) => `vincent ${1000 + index} 0.0 0.${index % 10} node server-${index}.js`),
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("system/ps");
    expect(result.facts?.process).toBe(150);
    expect(result.inlineText).toContain("150 processes");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses docker compose output while keeping service rows", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "docker compose ps",
      argv: ["docker", "compose", "ps"],
      combinedText: [
        "NAME          IMAGE        COMMAND         SERVICE   STATUS           PORTS",
        ...Array.from({ length: 120 }, (_, index) => `api-${index}      api:latest   "node server"   api       running(healthy) 0.0.0.0:${3000 + index}->3000/tcp`),
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("devops/docker-compose");
    expect(result.facts?.service).toBe(120);
    expect(result.inlineText).toContain("120 services");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses kubectl describe output around events and warnings", async () => {
    const info = Array.from({ length: 120 }, (_, index) => `  Normal  Pulled  ${index + 1}m  kubelet  Successfully pulled image layer ${index}`).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "kubectl describe pod api-123",
      argv: ["kubectl", "describe", "pod", "api-123"],
      combinedText: [
        "Name:         api-123",
        "Namespace:    default",
        "Status:       Running",
        "Events:",
        "  Type    Reason     Age   From     Message",
        info,
        "  Warning BackOff    1m    kubelet  Back-off restarting failed container",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("devops/kubectl-describe");
    expect(result.inlineText).toContain("Warning BackOff");
    expect(result.inlineText).toContain("Back-off restarting failed container");
    expect(result.stats.ratio).toBeLessThan(0.2);
  });

  it("compresses large systemctl status output around active state and failures", async () => {
    const noise = Array.from(
      { length: 120 },
      (_, index) => `Apr 14 12:00:${String(index).padStart(2, "0")} api[123]: info heartbeat ${index}`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "systemctl status api.service",
      argv: ["systemctl", "status", "api.service"],
      combinedText: [
        "● api.service - API service",
        "     Loaded: loaded (/etc/systemd/system/api.service; enabled)",
        "     Active: failed (Result: exit-code) since Tue 2026-04-14 12:00:00 UTC; 1min ago",
        noise,
        "     Process: 123 ExecStart=/usr/bin/api (code=exited, status=1/FAILURE)",
      ].join("\n"),
      exitCode: 3,
    });

    expect(result.classification.matchedReducer).toBe("service/systemctl-status");
    expect(result.inlineText).toContain("Active: failed");
    expect(result.inlineText).toContain("ExecStart=/usr/bin/api");
    expect(result.stats.ratio).toBeLessThan(0.2);
  });

  it("compresses large service output around status lines", async () => {
    const noise = Array.from(
      { length: 120 },
      (_, index) => `api worker ${index} heartbeat ok`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "service api status",
      argv: ["service", "api", "status"],
      combinedText: [
        "api is running",
        noise,
        "error: refused connection to upstream",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("service/service");
    expect(result.inlineText).toContain("api is running");
    expect(result.inlineText).toContain("refused connection");
    expect(result.stats.ratio).toBeLessThan(0.2);
  });

  it("compresses large launchctl tables while counting services", async () => {
    const rows = Array.from(
      { length: 140 },
      (_, index) => `${1000 + index}  0  com.example.service-${index}`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "launchctl list",
      argv: ["launchctl", "list"],
      combinedText: [
        "PID\tStatus\tLabel",
        rows,
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("service/launchctl");
    expect(result.facts?.service).toBe(140);
    expect(result.inlineText).toContain("140 services");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses large lsof tables while counting entries", async () => {
    const rows = Array.from(
      { length: 140 },
      (_, index) => `node  ${1000 + index} vincent  ${index}u  IPv4  0x${index.toString(16)}  0t0  TCP *:${3000 + index} (LISTEN)`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "lsof -i",
      argv: ["lsof", "-i"],
      combinedText: [
        "COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME",
        rows,
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("service/lsof");
    expect(result.facts?.entry).toBe(140);
    expect(result.inlineText).toContain("140 entries");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses large netstat output while counting sockets", async () => {
    const rows = Array.from(
      { length: 140 },
      (_, index) => `tcp        0      0 0.0.0.0:${3000 + index}      0.0.0.0:*      LISTEN`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "netstat -an",
      argv: ["netstat", "-an"],
      combinedText: [
        "Proto Recv-Q Send-Q Local Address           Foreign Address         State",
        rows,
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("service/netstat");
    expect(result.facts?.socket).toBe(140);
    expect(result.inlineText).toContain("140 sockets");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses large ss output while counting sockets", async () => {
    const rows = Array.from(
      { length: 140 },
      (_, index) => `tcp   LISTEN 0      128      0.0.0.0:${3000 + index}     0.0.0.0:*`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "ss -ltn",
      argv: ["ss", "-ltn"],
      combinedText: [
        "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port",
        rows,
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("service/ss");
    expect(result.facts?.socket).toBe(140);
    expect(result.inlineText).toContain("140 sockets");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });

  it("compresses large git show output while keeping commit summary and tail stat", async () => {
    const hunks = Array.from(
      { length: 120 },
      (_, index) => `@@ -${index + 1},1 +${index + 1},1 @@\n-console.log(${index})\n+console.info(${index})`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "git show HEAD",
      argv: ["git", "show", "HEAD"],
      combinedText: [
        "commit 1234567890abcdef",
        "Author: Vincent Koc <vincent@example.com>",
        "Date:   Tue Apr 14 12:00:00 2026 +0000",
        "",
        "    refactor logs",
        "",
        "diff --git a/src/index.ts b/src/index.ts",
        "index abcdef0..1234567 100644",
        "--- a/src/index.ts",
        "+++ b/src/index.ts",
        hunks,
        " 1 file changed, 120 insertions(+), 120 deletions(-)",
      ].join("\n"),
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("git/show");
    expect(result.inlineText).toContain("commit 1234567890abcdef");
    expect(result.inlineText).toContain("1 file changed, 120 insertions");
    expect(result.stats.ratio).toBeLessThan(0.2);
  });

  it("compresses large git log output while keeping commit counts", async () => {
    const lines = Array.from(
      { length: 180 },
      (_, index) => `${(index + 1).toString(16).padStart(7, "a")} feat: commit number ${index}`,
    ).join("\n");
    const result = await reduceExecution({
      toolName: "exec",
      command: "git log --oneline",
      argv: ["git", "log", "--oneline"],
      combinedText: lines,
      exitCode: 0,
    });

    expect(result.classification.matchedReducer).toBe("git/log-oneline");
    expect(result.facts?.commit).toBe(180);
    expect(result.inlineText).toContain("180 commits");
    expect(result.stats.ratio).toBeLessThan(0.15);
  });
});
