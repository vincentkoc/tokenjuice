import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverCandidates, doctorArtifacts, listArtifactMetadata, reduceExecution } from "../src/index.js";

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
    expect(report.totals.artifacts).toBe(1);
    expect(report.topWeakReducers[0]?.matchedReducer).toBe("search/grep");
  });
});
