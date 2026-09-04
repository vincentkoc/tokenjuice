import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { WRAP_AUTHORITATIVE_FOOTER } from "../../src/core/compaction-metadata.js";
import { decorateWrapInlineText, formatStatsSources, isDirectModuleEntrypoint, parseArgs, resolveNoOmit } from "../../src/cli/main.js";
import { statsArtifacts } from "../../src/core/analysis.js";
import type { StatsSourceReport } from "../../src/core/analysis.js";
import type { CompactResult } from "../../src/types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-cli-main-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function statsSource(
  source: string,
  observed: { entries: number; rawChars: number; reducedChars: number },
): StatsSourceReport {
  const observedSavedChars = Math.max(observed.rawChars - observed.reducedChars, 0);
  return {
    source,
    totals: {
      observedEntries: observed.entries,
      captureTruncatedEntries: 0,
      observedRawChars: observed.rawChars,
      observedReducedChars: observed.reducedChars,
      observedSavedChars,
      observedAvgRatio: observed.rawChars > 0 ? observed.reducedChars / observed.rawChars : null,
      observedSavingsPercent: observed.rawChars > 0 ? observedSavedChars / observed.rawChars : null,
      entries: 1,
      rawChars: 10,
      reducedChars: 5,
      savedChars: 5,
      avgRatio: 0.5,
      savingsPercent: 0.5,
    },
    reducers: [],
    commands: [],
    daily: [],
  };
}

describe("parseArgs", () => {
  it("parses --no-omit for direct commands and explicit Codex hook policy", () => {
    expect(parseArgs(["reduce", "--no-omit"]).noOmit).toBe(true);
    expect(parseArgs(["wrap", "--no-omit", "--", "echo", "hi"]).noOmit).toBe(true);
    expect(parseArgs(["codex-post-tool-use", "--no-omit"]).noOmit).toBe(true);
    expect(parseArgs(["install", "codex", "--no-omit"]).noOmit).toBe(true);
    expect(parseArgs(["doctor", "codex", "--no-omit"]).noOmit).toBe(true);
  });

  it("limits the explicit omission override to the hook runtime", () => {
    expect(parseArgs(["codex-post-tool-use", "--allow-omit"]).allowOmit).toBe(true);
    expect(() => parseArgs(["install", "codex", "--allow-omit"]))
      .toThrow("Codex hooks honor the configured omission policy");
    expect(() => parseArgs(["doctor", "codex", "--allow-omit"]))
      .toThrow("Codex hooks honor the configured omission policy");
  });

  it("rejects conflicting omission policies", () => {
    expect(() => parseArgs(["codex-post-tool-use", "--no-omit", "--allow-omit"]))
      .toThrow("--no-omit and --allow-omit cannot be used together");
  });
});

describe("formatStatsSources", () => {
  it("ranks sources by observed cost with a stable source-name tie break", () => {
    const sources = [
      statsSource("unknown", { entries: 1, rawChars: 500, reducedChars: 250 }),
      statsSource("cursor", { entries: 2, rawChars: 2_000, reducedChars: 600 }),
      statsSource("codex", { entries: 3, rawChars: 2_000, reducedChars: 500 }),
    ];

    const output = formatStatsSources(sources);

    expect(output.indexOf("source codex:")).toBeLessThan(output.indexOf("source cursor:"));
    expect(output.indexOf("source cursor:")).toBeLessThan(output.indexOf("source unknown:"));
    expect(sources.map((source) => source.source)).toEqual(["unknown", "cursor", "codex"]);
  });

  it("sorts capture-truncated sources by observed cost while displaying exact totals", () => {
    const report = statsArtifacts([
      {
        metadata: {
          createdAt: "2026-09-04T00:00:00.000Z",
          source: "cursor",
          command: "large-tool",
          classification: {
            family: "generic",
            confidence: 1,
            matchedReducer: "generic/fallback",
          },
          rawChars: 5_000,
          reducedChars: 100,
          ratio: 0.02,
          captureTruncated: true,
        },
      },
      {
        metadata: {
          createdAt: "2026-09-04T00:01:00.000Z",
          source: "cursor",
          command: "rg TODO",
          classification: {
            family: "search",
            confidence: 1,
            matchedReducer: "search/rg",
          },
          rawChars: 100,
          reducedChars: 40,
          ratio: 0.4,
        },
      },
      {
        metadata: {
          createdAt: "2026-09-04T00:02:00.000Z",
          source: "codex",
          command: "pnpm test",
          classification: {
            family: "tests",
            confidence: 1,
            matchedReducer: "tests/pnpm-test",
          },
          rawChars: 500,
          reducedChars: 100,
          ratio: 0.2,
        },
      },
    ], { bySource: true });
    const sources = report.sources ?? [];

    expect(sources.map((source) => source.source)).toEqual(["codex", "cursor"]);
    expect(sources.find((source) => source.source === "cursor")?.totals).toMatchObject({
      observedRawChars: 5_100,
      rawChars: 100,
    });
    expect(sources.find((source) => source.source === "codex")?.totals).toMatchObject({
      observedRawChars: 500,
      rawChars: 500,
    });

    const output = formatStatsSources(sources);
    expect(output.indexOf("source cursor:")).toBeLessThan(output.indexOf("source codex:"));
    expect(output).toContain("source cursor: entries=1 raw=100 observedRaw=5.1k reduced=40 saved=60 avgRatio=40%");
    expect(output).toContain("source codex: entries=1 raw=500 reduced=100 saved=400 avgRatio=20%");
    expect(output).not.toContain("source codex: entries=1 raw=500 observedRaw=");

    const sourceTotals = sources.reduce(
      (totals, source) => ({
        entries: totals.entries + source.totals.entries,
        rawChars: totals.rawChars + source.totals.rawChars,
        reducedChars: totals.reducedChars + source.totals.reducedChars,
        savedChars: totals.savedChars + source.totals.savedChars,
      }),
      { entries: 0, rawChars: 0, reducedChars: 0, savedChars: 0 },
    );
    expect(sourceTotals).toEqual({
      entries: report.totals.entries,
      rawChars: report.totals.rawChars,
      reducedChars: report.totals.reducedChars,
      savedChars: report.totals.savedChars,
    });
  });

  it("does not substitute observed values into exact display metrics", () => {
    const output = formatStatsSources([
      statsSource("codex", { entries: 4, rawChars: 2_500, reducedChars: 1_000 }),
    ]);

    expect(output).toContain("source codex: entries=1 raw=10 reduced=5 saved=5 avgRatio=50%");
    expect(output).not.toContain("raw=2.5k");
    expect(output).not.toContain("observedRaw=");
  });

  it("describes unknown source metadata without guessing its origin", () => {
    const output = formatStatsSources([
      statsSource("unknown", { entries: 1, rawChars: 100, reducedChars: 50 }),
    ]);

    expect(output).toContain("source unknown means stored artifacts have missing or invalid source metadata.");
    expect(output).not.toContain("older");
  });
});

describe("decorateWrapInlineText", () => {
  it("keeps the authoritative footer for lossy summaries", () => {
    const result: CompactResult = {
      inlineText: "summary",
      compaction: {
        authoritative: true,
        kinds: ["head-tail-omission"],
      },
      stats: {
        rawChars: 4_000,
        reducedChars: 40,
        ratio: 0.01,
      },
      classification: {
        family: "generic",
        confidence: 0.9,
        matchedReducer: "generic/fallback",
      },
    };

    expect(decorateWrapInlineText(result, false)).toContain(WRAP_AUTHORITATIVE_FOOTER);
  });

  it("provides the raw-artifact recovery command when output is stored", () => {
    const result: CompactResult = {
      inlineText: "summary",
      compaction: {
        authoritative: true,
        kinds: ["head-tail-omission"],
      },
      rawRef: {
        id: "tj_0123456789ab",
        path: "/tmp/tokenjuice/raw.txt",
        metadataPath: "/tmp/tokenjuice/meta.json",
      },
      stats: {
        rawChars: 4_000,
        reducedChars: 40,
        ratio: 0.01,
      },
      classification: {
        family: "generic",
        confidence: 0.9,
        matchedReducer: "generic/fallback",
      },
    };

    expect(decorateWrapInlineText(result, false)).toContain("tokenjuice cat tj_0123456789ab");
  });

  it("suppresses the authoritative footer for lossless rewrites", () => {
    const result: CompactResult = {
      inlineText: "summary",
      compaction: {
        authoritative: false,
        kinds: ["no-omit-domain-passthrough"],
      },
      stats: {
        rawChars: 4_000,
        reducedChars: 40,
        ratio: 0.01,
      },
      classification: {
        family: "generic",
        confidence: 0.9,
        matchedReducer: "generic/fallback",
      },
    };

    expect(decorateWrapInlineText(result, false)).toBe("summary");
  });
});

describe("resolveNoOmit", () => {
  it("enables noOmit from TOKENJUICE_NO_OMISSION", () => {
    expect(resolveNoOmit(false, { TOKENJUICE_NO_OMISSION: "1" })).toBe(true);
  });

  it("keeps noOmit enabled when the CLI flag is set", () => {
    expect(resolveNoOmit(true, {})).toBe(true);
  });
});

describe("isDirectModuleEntrypoint", () => {
  it("matches a relative argv[1] path", async () => {
    const dir = await createTempDir();
    const modulePath = join(dir, "main.js");
    const cwd = join(dir, "cwd");
    const originalCwd = process.cwd();
    await writeFile(modulePath, "");
    await mkdir(cwd);
    process.chdir(cwd);

    try {
      await expect(isDirectModuleEntrypoint(pathToFileURL(modulePath), ["node", "../main.js"])).resolves.toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("matches a symlinked argv[1] path", async () => {
    const dir = await createTempDir();
    const modulePath = join(dir, "main.js");
    const symlinkPath = join(dir, "tokenjuice");
    await writeFile(modulePath, "");
    await symlink(modulePath, symlinkPath);

    await expect(isDirectModuleEntrypoint(pathToFileURL(modulePath), ["node", symlinkPath])).resolves.toBe(true);
  });
});
