import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listArtifactMetadata } from "../../../src/core/artifacts.js";
import { compactBashResult } from "../../../src/core/integrations/compact-bash-result.js";

type CompactBashResultOutcome = Awaited<ReturnType<typeof compactBashResult>>;
const originalNoOmissionEnv = process.env.TOKENJUICE_NO_OMISSION;

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
  afterEach(() => {
    if (originalNoOmissionEnv === undefined) {
      delete process.env.TOKENJUICE_NO_OMISSION;
      return;
    }
    process.env.TOKENJUICE_NO_OMISSION = originalNoOmissionEnv;
  });

  it.each([
    "tokenjuice wrap --raw -- find fixtures -type f",
    "/usr/local/bin/tokenjuice wrap --full -- find fixtures -type f",
    "node '/workspace/tokenjuice/dist/cli/main.js' wrap --raw -- find fixtures -type f",
    "env DEBUG=1 bash -lc 'tokenjuice wrap --raw -- find fixtures -type f'",
  ])("preserves explicit raw output after the tool executes: %s", async (command) => {
    const text = Array.from({ length: 80 }, (_, index) => `fixtures/example-${index}.json`).join("\n");
    const outcome = await compactBashResult({ source: "opencode", command, visibleText: text });
    expect(outcome).toMatchObject({ action: "keep", reason: "raw-bypass", rawText: text });
  });

  it.each([
    "tokenjuice wrap -- find fixtures --raw",
    "echo 'tokenjuice wrap --raw -- find fixtures'",
    "node /workspace/other.js wrap --raw -- find fixtures",
  ])("does not infer a raw bypass from command arguments: %s", async (command) => {
    const outcome = await compactBashResult({ source: "opencode", command, visibleText: "fixture output" });
    expect(outcome).not.toMatchObject({ reason: "raw-bypass" });
  });

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

  it.each([
    "rtk git status",
    "/usr/local/bin/rtk git status",
    "cd /repo && env DEBUG=1 rtk git status",
    "rtk git status | tee output.txt",
    "bash -lc 'rtk git status'",
    "env DEBUG=1 bash -lc 'rtk git status'",
    "cd /repo && bash -lc 'rtk git status'",
    "timeout 30 rtk git status",
    "timeout -- 30 rtk git status",
    "nice -n 10 rtk rg foo",
    "time -p rtk git status",
    "nohup rtk git status",
    "command rtk git status",
    "command -p -- rtk git status",
    "command rtk -v",
  ])("keeps configured commands raw: %s", async (command) => {
    const outcome = await compactBashResult({
      source: "pi",
      command,
      visibleText: Array.from({ length: 40 }, (_, index) => `line ${index + 1} ${"x".repeat(80)}`).join("\n"),
      skipCommandNames: ["rtk"],
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).toMatchObject({
      action: "keep",
      reason: "configured-command",
    });
  });

  it.each([
    "RTK git status",
    "rtk.exe git status",
    "/usr/local/bin/RTK.exe git status",
    "cd /repo && env DEBUG=1 RTK git status",
  ])("matches configured commands case-insensitively and with executable suffixes: %s", async (command) => {
    const outcome = await compactBashResult({
      source: "pi",
      command,
      visibleText: Array.from({ length: 40 }, (_, index) => `line ${index + 1} ${"x".repeat(80)}`).join("\n"),
      skipCommandNames: ["rtk"],
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).toMatchObject({
      action: "keep",
      reason: "configured-command",
    });
  });

  it.each([
    "rtk-helper git status",
    "echo rtk",
    "timeout 30 cat rtk",
    "nice -n 10 grep x rtk",
    "command -v rtk",
    "command -V rtk",
  ])("does not match non-command arguments: %s", async (command) => {
    const outcome = await compactBashResult({
      source: "pi",
      command,
      visibleText: Array.from({ length: 40 }, (_, index) => `line ${index + 1} ${"x".repeat(80)}`).join("\n"),
      skipCommandNames: ["rtk"],
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).not.toMatchObject({ reason: "configured-command" });
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

  it("keeps large document-shaped file inspections raw", async () => {
    const visibleText = [
      "# Review",
      "intro",
      "## Evidence",
      ...Array.from({ length: 260 }, (_, index) => `paragraph ${index} ${"x".repeat(40)}`),
    ].join("\n");
    const outcome = await compactBashResult({
      source: "pi",
      command: "sed -n '1,260p' notes.txt",
      visibleText,
      inspectionPolicy: "allow-safe-inventory",
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    expect(outcome).toMatchObject({
      action: "keep",
      reason: "file-content-inspection-command",
    });
    const kept = expectKeep(outcome);
    expect(kept.rawText).toContain("# Review");
    expect(kept.rawText).toContain("paragraph 0");
    expect(kept.rawText).toBe(visibleText);
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

  it("removes repeated emoji banners from Crabbox-like generic output", async () => {
    const outcome = await compactBashResult({
      source: "codex",
      command: "crabbox run inspect-model",
      visibleText: [
        "generated modeling_modernbert.py",
        "🚨".repeat(1_935),
        "inspection complete",
      ].join("\n"),
      maxInlineChars: 1_200,
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    const rewritten = expectRewrite(outcome);
    expect(rewritten.result.classification.matchedReducer).toBe("generic/fallback");
    expect(rewritten.result.inlineText).toContain("[repeated emoji banner omitted: U+1F6A8 x1935]");
    expect(rewritten.result.inlineText).not.toContain("🚨");
    expect(rewritten.result.compaction?.kinds).toContain("repeated-emoji-banner-omission");
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

  it("enables noOmit from the environment even when input.noOmit is false", async () => {
    process.env.TOKENJUICE_NO_OMISSION = "1";

    const outcome = await compactBashResult({
      source: "codex",
      command: "git status",
      visibleText: [
        "On branch main",
        "Changes not staged for commit:",
        ...Array.from({ length: 30 }, (_, index) => `  modified:   src/file-${index}.ts`),
        "",
        "no changes added to commit",
      ].join("\n"),
      maxInlineChars: 20_000,
      noOmit: false,
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    const rewritten = expectRewrite(outcome);
    expect(rewritten.result.inlineText).toContain("M: src/file-29.ts");
    expect(rewritten.result.inlineText).not.toContain("omitted");
    expect(rewritten.result.compaction?.authoritative).toBe(false);
  });

  it("enables noOmit from the input flag when the environment is unset", async () => {
    delete process.env.TOKENJUICE_NO_OMISSION;

    const outcome = await compactBashResult({
      source: "codex",
      command: "git status",
      visibleText: [
        "On branch main",
        "Changes not staged for commit:",
        ...Array.from({ length: 30 }, (_, index) => `  modified:   src/file-${index}.ts`),
        "",
        "no changes added to commit",
      ].join("\n"),
      maxInlineChars: 20_000,
      noOmit: true,
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    const rewritten = expectRewrite(outcome);
    expect(rewritten.result.inlineText).toContain("M: src/file-29.ts");
    expect(rewritten.result.inlineText).not.toContain("omitted");
    expect(rewritten.result.compaction?.authoritative).toBe(false);
  });

  it("allows a host-specific policy to override the no-omit environment", async () => {
    process.env.TOKENJUICE_NO_OMISSION = "1";

    const outcome = await compactBashResult({
      source: "codex",
      command: "git log --oneline",
      visibleText: Array.from(
        { length: 40 },
        (_, index) => `${(index + 1).toString(16).padStart(7, "a")} feat: commit ${index}`,
      ).join("\n"),
      allowOmit: true,
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    const rewritten = expectRewrite(outcome);
    expect(rewritten.result.inlineText).toContain("omitted");
    expect(rewritten.result.compaction?.authoritative).toBe(true);
  });

  it("keeps explicit no-omit enabled when both input policies are set", async () => {
    const outcome = await compactBashResult({
      source: "codex",
      command: "git status",
      visibleText: [
        "On branch main",
        "Changes not staged for commit:",
        ...Array.from({ length: 30 }, (_, index) => `  modified:   src/file-${index}.ts`),
      ].join("\n"),
      noOmit: true,
      allowOmit: true,
      maxInlineChars: 20_000,
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    });

    const rewritten = expectRewrite(outcome);
    expect(rewritten.result.inlineText).toContain("M: src/file-29.ts");
    expect(rewritten.result.inlineText).not.toContain("omitted");
  });

  it("stores raw bytes in storeDir only after a rewrite", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "tokenjuice-store-raw-"));
    const stray = new Set<string>();
    const rawText = [
      "On branch feat/pi-extension",
      "",
      "Changes not staged for commit:",
      "\tmodified:   src/hosts/pi/extension/runtime.ts",
      "\tmodified:   src/hosts/pi/index.ts",
      "",
      "no changes added to commit",
    ].join("\n");
    const noteStray = (outcome: CompactBashResultOutcome) => {
      const ref = outcome.result?.rawRef;
      if (!ref?.path || ref.path.startsWith(storeDir)) {
        return;
      }
      stray.add(ref.path);
      if (ref.metadataPath) {
        stray.add(ref.metadataPath);
      }
    };
    try {
      const outcome = await compactBashResult({
        source: "pi",
        command: "git status",
        visibleText: rawText,
        storeRaw: true,
        storeDir,
        maxInlineChars: 1200,
        inspectionPolicy: "allow-safe-inventory",
        minSavedCharsAny: 8,
        genericFallbackMinSavedChars: 120,
        genericFallbackMaxRatio: 0.75,
        skipGenericFallbackForCompoundCommands: true,
      });
      noteStray(outcome);

      const rewritten = expectRewrite(outcome);
      expect(rewritten.result.rawRef?.id).toMatch(/^tj_[0-9a-f-]{12}$/i);
      const id = rewritten.result.rawRef?.id ?? "";
      const rawPath = join(storeDir, `${id}.txt`);
      expect(rewritten.result.rawRef?.path).toBe(rawPath);
      expect(await readFile(rawPath, "utf8")).toBe(rawText);

      const namesBeforeKeep = (await readdir(storeDir)).sort();
      const statsIdsBeforeKeep = (await listArtifactMetadata(storeDir)).map((entry) => entry.id).sort();
      const keptOutcome = await compactBashResult({
        source: "pi",
        command: "cd /repo && echo hi | head -c 4",
        visibleText: Array.from({ length: 18 }, (_, index) => `line ${index + 1} ${"x".repeat(24)}`).join("\n"),
        storeRaw: true,
        storeDir,
        minSavedCharsAny: 8,
        genericFallbackMinSavedChars: 120,
        genericFallbackMaxRatio: 0.75,
        skipGenericFallbackForCompoundCommands: true,
      });
      noteStray(keptOutcome);
      const kept = expectKeep(keptOutcome);
      expect(kept.reason).toBe("generic-compound-command");
      expect(kept.result?.rawRef).toBeUndefined();
      const namesAfterKeep = (await readdir(storeDir)).sort();
      expect(namesAfterKeep).toEqual(namesBeforeKeep);
      // storeRaw keep: no raw stored, and no stats entry for this call.
      expect({
        statsIds: (await listArtifactMetadata(storeDir)).map((entry) => entry.id).sort(),
        rawTxt: namesAfterKeep.filter((name) => name.endsWith(".txt")),
      }).toEqual({
        statsIds: statsIdsBeforeKeep,
        rawTxt: namesBeforeKeep.filter((name) => name.endsWith(".txt")),
      });
    } finally {
      await Promise.all([...stray].map((path) => rm(path, { force: true })));
      await rm(storeDir, { recursive: true, force: true });
    }
  });

  it("stores nothing for a storeRaw caller when the output is kept", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "tokenjuice-store-raw-keep-"));
    const policy = {
      storeRaw: true,
      storeDir,
      inspectionPolicy: "allow-safe-inventory",
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    } as const;
    try {
      const exactRead = await compactBashResult({
        ...policy,
        source: "pi",
        command: "sed -n '1,260p' notes.txt",
        visibleText: [
          "# Review",
          "## Evidence",
          ...Array.from({ length: 260 }, (_, index) => `paragraph ${index} ${"x".repeat(40)}`),
        ].join("\n"),
      });
      expect(expectKeep(exactRead).reason).toBe("file-content-inspection-command");

      const lowSavings = await compactBashResult({
        ...policy,
        source: "pi",
        command: "git status",
        visibleText: ["On branch main", "", "nothing to commit, working tree clean"].join("\n"),
        minSavedCharsAny: 10_000,
      });
      expect(expectKeep(lowSavings).reason).toMatch(/^(no-compaction|low-savings-compaction)$/u);

      const weakGeneric = await compactBashResult({
        ...policy,
        source: "pi",
        command: "custom-tool --emit-lines",
        visibleText: Array.from({ length: 18 }, (_, index) => `line ${index + 1} ${"x".repeat(24)}`).join("\n"),
      });
      expect(expectKeep(weakGeneric).reason).toBe("generic-weak-compaction");

      expect(await readdir(storeDir)).toEqual([]);
      expect(await listArtifactMetadata(storeDir)).toEqual([]);
    } finally {
      await rm(storeDir, { recursive: true, force: true });
    }
  });

  it("keeps the stats policy for storeRaw rewrites and callers without storeRaw", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "tokenjuice-store-raw-stats-"));
    const rawText = [
      "On branch main",
      "Changes not staged for commit:",
      ...Array.from({ length: 30 }, (_, index) => `  modified:   src/file-${index}.ts`),
      "",
      "no changes added to commit",
    ].join("\n");
    const policy = {
      command: "git status",
      visibleText: rawText,
      storeDir,
      minSavedCharsAny: 8,
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
    } as const;
    try {
      const silentStore = expectRewrite(await compactBashResult({ ...policy, source: "pi", storeRaw: true, recordStats: false }));
      const silentId = silentStore.result.rawRef?.id ?? "";
      expect(silentId).toMatch(/^tj_[0-9a-f-]{12}$/iu);
      expect(await readFile(join(storeDir, `${silentId}.txt`), "utf8")).toBe(rawText);
      expect(await listArtifactMetadata(storeDir)).toEqual([]);

      const countedStore = expectRewrite(await compactBashResult({ ...policy, source: "pi", storeRaw: true, recordStats: true }));
      const countedId = countedStore.result.rawRef?.id ?? "";
      expect((await listArtifactMetadata(storeDir)).map((entry) => entry.id)).toEqual([countedId]);

      const metadataOnly = expectRewrite(await compactBashResult({ ...policy, source: "codex", recordStats: true }));
      expect(metadataOnly.result.rawRef).toBeUndefined();
      const ids = (await listArtifactMetadata(storeDir)).map((entry) => entry.id).sort();
      expect(ids).toHaveLength(2);
      expect(ids).toContain(countedId);
      expect((await readdir(storeDir)).filter((name) => name.endsWith(".txt")).sort()).toEqual([`${countedId}.txt`, `${silentId}.txt`].sort());
    } finally {
      await rm(storeDir, { recursive: true, force: true });
    }
  });

});
