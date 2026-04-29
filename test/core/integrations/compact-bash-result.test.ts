import { describe, expect, it } from "vitest";

import { compactBashResult } from "../../../src/core/integrations/compact-bash-result.js";

type CompactBashResultOutcome = Awaited<ReturnType<typeof compactBashResult>>;

function expectRewrite(outcome: CompactBashResultOutcome): Extract<CompactBashResultOutcome, { action: "rewrite" }> {
  expect(outcome.action).toBe("rewrite");
  if (outcome.action !== "rewrite") {
    throw new Error(`expected rewrite outcome, received ${outcome.action}`);
  }
  return outcome;
}

function expectKeep(outcome: CompactBashResultOutcome): Extract<CompactBashResultOutcome, { action: "keep" }> {
  expect(outcome.action).toBe("keep");
  if (outcome.action !== "keep") {
    throw new Error(`expected keep outcome, received ${outcome.action}`);
  }
  return outcome;
}

describe("compactBashResult", () => {
  it("uses trusted full text when provided", async () => {
    const outcome = await compactBashResult({
      source: "pi",
      command: "git status",
      visibleText: "truncated output",
      trustedFullText: [
        "On branch feature/demo",
        "",
        "Changes not staged for commit:",
        "\tmodified:   src/hosts/pi/index.ts",
        "\tmodified:   src/hosts/pi/extension/runtime.ts",
        "",
        "no changes added to commit",
      ].join("\n"),
      maxInlineChars: 1200,
      skipInspectionCommands: true,
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    const rewritten = expectRewrite(outcome);
    expect(rewritten.usedTrustedFullText).toBe(true);
    expect(rewritten.rawText).toContain("src/hosts/pi/index.ts");
    expect(rewritten.result.inlineText).toContain("M: src/hosts/pi/index.ts");
    expect(rewritten.result.inlineText).not.toContain("truncated output");
  });

  it("skips repository inspection commands before compaction when requested", async () => {
    const outcome = await compactBashResult({
      source: "pi",
      command: "find src/rules -maxdepth 2 -type f | head -n 20",
      visibleText: Array.from({ length: 20 }, (_, index) => `src/rules/example-${index + 1}.json`).join("\n"),
      skipInspectionCommands: true,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).toMatchObject({
      action: "keep",
      reason: "inspection-command",
    });
  });

  it("allows safe inventory compaction under the safe-inventory inspection policy", async () => {
    const outcome = await compactBashResult({
      source: "pi",
      command: "find src/rules -maxdepth 2 -type f | head -n 40",
      visibleText: Array.from({ length: 40 }, (_, index) => `src/rules/example-${index + 1}.json`).join("\n"),
      inspectionPolicy: "allow-safe-inventory",
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    const rewritten = expectRewrite(outcome);
    expect(rewritten.result.classification.matchedReducer).toBe("filesystem/find");
    expect(rewritten.result.inlineText).toContain("40 matches");
  });

  it("skips unsafe inventory pipelines under the safe-inventory inspection policy", async () => {
    const outcome = await compactBashResult({
      source: "pi",
      command: "git -C repo ls-files | jq -R .",
      visibleText: Array.from({ length: 40 }, (_, index) => JSON.stringify(`src/file-${index + 1}.ts`)).join("\n"),
      inspectionPolicy: "allow-safe-inventory",
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).toMatchObject({
      action: "keep",
      reason: "unsafe-inventory-pipeline",
    });
  });

  it("skips file content under the safe-inventory inspection policy", async () => {
    const outcome = await compactBashResult({
      source: "pi",
      command: "cat src/core/reduce.ts",
      visibleText: "export function reduceExecution() {}\n",
      inspectionPolicy: "allow-safe-inventory",
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).toMatchObject({
      action: "keep",
      reason: "file-content-inspection-command",
    });
  });

  it("treats git show blob reads as file content under the safe-inventory inspection policy", async () => {
    const outcome = await compactBashResult({
      source: "pi",
      command: "git show HEAD:src/core/reduce.ts",
      visibleText: "export function reduceExecution() {}\n",
      inspectionPolicy: "allow-safe-inventory",
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).toMatchObject({
      action: "keep",
      reason: "file-content-inspection-command",
    });
  });

  it("allows package-lock inspection through the summary reducer", async () => {
    const outcome = await compactBashResult({
      source: "pi",
      command: "jq . package-lock.json",
      visibleText: JSON.stringify({
        name: "tokenjuice",
        lockfileVersion: 3,
        packages: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`node_modules/pkg-${index}`, { version: "1.0.0" }])),
      }, null, 2),
      inspectionPolicy: "allow-safe-inventory",
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).toMatchObject({
      action: "rewrite",
      result: {
        classification: {
          matchedReducer: "generic/package-lock-summary",
        },
        inlineText: expect.stringContaining("packages: 80"),
      },
    });
  });

  it("allows large document-shaped file inspections through the summary reducer", async () => {
    const outcome = await compactBashResult({
      source: "pi",
      command: "sed -n '1,260p' notes.txt",
      visibleText: [
        "# Review",
        "intro",
        "## Evidence",
        ...Array.from({ length: 260 }, (_, index) => `paragraph ${index} ${"x".repeat(40)}`),
      ].join("\n"),
      inspectionPolicy: "allow-safe-inventory",
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).toMatchObject({
      action: "rewrite",
      result: {
        classification: {
          matchedReducer: "generic/large-document-summary",
        },
      },
    });
  });

  it("keeps tree output raw under the safe-inventory inspection policy", async () => {
    const outcome = await compactBashResult({
      source: "pi",
      command: "tree src",
      visibleText: Array.from({ length: 40 }, (_, index) => `src/file-${index + 1}.ts`).join("\n"),
      inspectionPolicy: "allow-safe-inventory",
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).toMatchObject({
      action: "keep",
      reason: "inspection-command",
    });
  });

  it("skips cd-prefixed file content under the safe-inventory inspection policy", async () => {
    const outcome = await compactBashResult({
      source: "pi",
      command: "cd /repo && cat src/core/reduce.ts",
      visibleText: Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join("\n"),
      inspectionPolicy: "allow-safe-inventory",
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).toMatchObject({
      action: "keep",
      reason: "file-content-inspection-command",
    });
  });

  it("rewrites cd-prefixed safe inventory through the inventory reducer", async () => {
    const outcome = await compactBashResult({
      source: "pi",
      command: "cd /repo && rg --files src/rules",
      visibleText: Array.from({ length: 40 }, (_, index) => `src/rules/example-${index + 1}.json`).join("\n"),
      inspectionPolicy: "allow-safe-inventory",
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    const rewritten = expectRewrite(outcome);
    expect(rewritten.result.classification.matchedReducer).toBe("filesystem/rg-files");
    expect(rewritten.result.inlineText).toContain("40 paths");
  });

  it("returns a keep decision for weak generic fallback compaction", async () => {
    const outcome = await compactBashResult({
      source: "codex",
      command: "custom-tool --emit-lines",
      visibleText: Array.from({ length: 18 }, (_, index) => `line ${index + 1} ${"x".repeat(24)}`).join("\n"),
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    const kept = expectKeep(outcome);
    expect(kept.reason).toBe("generic-weak-compaction");
    expect(kept.result?.classification.matchedReducer).toBe("generic/fallback");
  });

  it("compacts generic/fallback output when the command is only a cd-prefixed chain", async () => {
    // Regression: a leading `cd <dir> && <cmd>` is classified as compound by
    // `isCompoundShellCommand`, which trips `skipGenericFallbackForCompoundCommands`
    // and drops compaction to zero even though the effective command is a
    // single inspection. See tokenjuice phase 3 trial — 3/10 Pi runs went from
    // -25% to 0% solely because the model prefixed `cd <repo> && git log`.
    const longOutput = Array.from({ length: 30 }, (_, index) => `commit ${index + 1} ${"x".repeat(120)}`).join("\n");
    const outcome = await compactBashResult({
      source: "pi",
      command: "cd /home/clawdbot/repos/astro-portfolio && git log -30",
      visibleText: longOutput,
      maxInlineChars: 1200,
      skipInspectionCommands: true,
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    const rewritten = expectRewrite(outcome);
    expect(rewritten.result.inlineText.length).toBeLessThan(longOutput.length);
    expect(rewritten.result.classification.matchedReducer).toBe("generic/fallback");
  });

  it("still skips genuinely compound commands after stripping cd prefixes", async () => {
    // `cd X && foo | bar` is still compound after stripping the cd; the gate
    // should continue to apply to the residual pipeline.
    const outcome = await compactBashResult({
      source: "pi",
      command: "cd /repo && echo hi | head -c 4",
      visibleText: Array.from({ length: 18 }, (_, index) => `line ${index + 1} ${"x".repeat(24)}`).join("\n"),
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    const kept = expectKeep(outcome);
    expect(kept.reason).toBe("generic-compound-command");
  });

});
