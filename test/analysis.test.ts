import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildAnalysisEntry, discoverCandidates, doctorArtifacts, listArtifactMetadata, normalizeCommandSignature, reduceExecution, statsArtifacts } from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-analysis-"));
  tempDirs.push(dir);
  return dir;
}

describe("analysis", () => {
  it("discovers missing rule candidates from generic artifacts", async () => {
    const storeDir = await createTempDir();
    await reduceExecution(
      {
        toolName: "exec",
        command: "custom-tool check",
        argv: ["custom-tool", "check"],
        combinedText: Array.from({ length: 40 }, (_, index) => `problem ${index + 1}`).join("\n"),
        exitCode: 1,
      },
      {
        store: true,
        storeDir,
      },
    );

    const metadata = await listArtifactMetadata(storeDir);
    const candidates = discoverCandidates(metadata);
    expect(candidates[0]?.kind).toBe("missing-rule");
    expect(candidates[0]?.signature).toBe("custom-tool");
  });

  it("reports weak matched reducers in doctor output", async () => {
    const storeDir = await createTempDir();
    await reduceExecution(
      {
        toolName: "exec",
        command: "grep TODO src",
        argv: ["grep", "TODO", "src"],
        combinedText: Array.from(
          { length: 8 },
          (_, index) => `src/file-${index + 1}.ts:${" very long todo".repeat(20)}`,
        ).join("\n"),
        exitCode: 0,
      },
      {
        store: true,
        storeDir,
        maxInlineChars: 5000,
      },
    );

    const metadata = await listArtifactMetadata(storeDir);
    const report = doctorArtifacts(metadata);
    expect(report.totals.entries).toBe(1);
    expect(report.health).toBe("poor");
    expect(report.topWeakReducers[0]?.matchedReducer).toBe("search/grep");
  });

  it("builds analysis entries from a direct reduction result", async () => {
    const result = await reduceExecution({
      toolName: "exec",
      command: "pnpm vitest",
      argv: ["pnpm", "vitest"],
      combinedText: "RUN  v3.2.4\nFAIL test/example.test.ts\n",
      exitCode: 1,
    });

    const entry = buildAnalysisEntry(
      {
        toolName: "exec",
        command: "pnpm vitest",
        exitCode: 1,
      },
      result,
    );

    expect(entry.metadata.classification.matchedReducer).toBe("tests/vitest");
    expect(entry.metadata.rawChars).toBeGreaterThan(0);
  });

  it("aggregates stats across stored artifacts", async () => {
    const storeDir = await createTempDir();
    await reduceExecution(
      {
        toolName: "exec",
        command: "pnpm tsc --noEmit",
        argv: ["pnpm", "tsc", "--noEmit"],
        combinedText: "src/index.ts(1,1): error TS2322: bad\nFound 1 error.\n",
        exitCode: 2,
      },
      {
        store: true,
        storeDir,
      },
    );
    await reduceExecution(
      {
        toolName: "exec",
        command: "grep TODO src",
        argv: ["grep", "TODO", "src"],
        combinedText: Array.from(
          { length: 20 },
          (_, index) => `src/file-${index + 1}.ts:${" TODO".repeat(20)}`,
        ).join("\n"),
        exitCode: 0,
      },
      {
        store: true,
        storeDir,
      },
    );

    const metadata = await listArtifactMetadata(storeDir);
    const report = statsArtifacts(metadata);
    expect(report.totals.entries).toBe(2);
    expect(report.totals.rawChars).toBeGreaterThan(report.totals.reducedChars);
    expect(report.reducers.length).toBeGreaterThan(0);
    expect(report.commands.length).toBeGreaterThan(0);
    expect(report.daily.length).toBe(1);
  });

  it("clamps expanded artifact ratios in stats and doctor output", () => {
    const entries = [
      {
        metadata: {
          createdAt: "2026-04-15T00:00:00.000Z",
          command: "node -e console.log('x')",
          classification: {
            family: "generic",
            confidence: 1,
            matchedReducer: "generic/fallback",
          },
          rawChars: 100,
          reducedChars: 250,
          ratio: 2.5,
        },
      },
      {
        metadata: {
          createdAt: "2026-04-15T00:01:00.000Z",
          command: "pnpm test",
          classification: {
            family: "tests",
            confidence: 1,
            matchedReducer: "tests/pnpm-test",
          },
          rawChars: 200,
          reducedChars: 50,
          ratio: 0.25,
        },
      },
    ];

    const stats = statsArtifacts(entries);
    const doctor = doctorArtifacts(entries);

    expect(stats.totals.rawChars).toBe(300);
    expect(stats.totals.reducedChars).toBe(150);
    expect(stats.totals.savedChars).toBe(150);
    expect(stats.totals.avgRatio).toBe(0.625);
    expect(stats.totals.savingsPercent).toBe(0.5);
    expect(stats.reducers.find((entry) => entry.reducer === "generic/fallback")?.savedChars).toBe(0);
    expect(doctor.totals.avgRatio).toBe(0.625);
  });

  it("normalizes command signatures to the initial binary only", () => {
    expect(normalizeCommandSignature("pnpm --help")).toBe("pnpm");
    expect(normalizeCommandSignature("node dist/cli/main.js stats")).toBe("node");
    expect(normalizeCommandSignature("/opt/homebrew/bin/git status --short")).toBe("git");
    expect(normalizeCommandSignature("stdin")).toBeNull();
  });

  it("derives ratios from reduced chars instead of trusting stale stored ratio fields", () => {
    const report = statsArtifacts([
      {
        metadata: {
          createdAt: "2026-04-15T00:00:00.000Z",
          command: "pnpm --help",
          classification: {
            family: "generic",
            confidence: 1,
            matchedReducer: "generic/fallback",
          },
          rawChars: 100,
          reducedChars: 25,
          ratio: 9.9,
        },
      },
    ]);

    expect(report.totals.avgRatio).toBe(0.25);
    expect(report.totals.savingsPercent).toBe(0.75);
    expect(report.commands[0]?.signature).toBe("pnpm");
  });
});
