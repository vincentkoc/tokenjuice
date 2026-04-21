import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getArtifact, listArtifactMetadata, listArtifacts, storeArtifact, storeArtifactMetadata } from "../../src/index.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-artifacts-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("artifacts", () => {
  it("rejects invalid artifact ids instead of reading arbitrary files", async () => {
    const storeDir = await createTempDir();

    expect(await getArtifact("../package", storeDir)).toBeNull();
    expect(await getArtifact("../../../etc/passwd", storeDir)).toBeNull();
  });

  it("ignores malformed artifact metadata filenames", async () => {
    const storeDir = await createTempDir();
    await writeFile(join(storeDir, "tj_invalid-xyz.json"), "{}", "utf8");
    await writeFile(join(storeDir, "not-an-artifact.json"), "{}", "utf8");
    await writeFile(join(storeDir, "tj_12345678-e29.json"), "{}", "utf8");

    const refs = await listArtifacts(storeDir);

    expect(refs.map((ref) => ref.id)).toEqual(["tj_12345678-e29"]);
  });

  it("stores raw artifacts under private file modes on unix-like systems", async () => {
    const storeDir = await createTempDir();
    const ref = await storeArtifact(
      {
        input: { toolName: "exec", command: "pnpm test", exitCode: 0 },
        rawText: "secret output",
        classification: { family: "test-results", confidence: 1, matchedReducer: "tests/pnpm-test" },
        stats: { rawChars: 13, reducedChars: 6, ratio: 0.46 },
      },
      storeDir,
    );

    if (process.platform === "win32") {
      expect(ref.id).toMatch(/^tj_/u);
      return;
    }

    const { stat } = await import("node:fs/promises");
    const rawMode = (await stat(ref.path)).mode & 0o777;
    const metadataMode = (await stat(ref.metadataPath)).mode & 0o777;

    expect(rawMode).toBe(0o600);
    expect(metadataMode).toBe(0o600);
  });

  it("ignores corrupted metadata files when loading artifact metadata", async () => {
    const storeDir = await createTempDir();
    await writeFile(join(storeDir, "tj_1234567-abcd.json"), JSON.stringify(["bad"]), "utf8");
    await writeFile(join(storeDir, "tj_1234567-abcd.txt"), "raw", "utf8");

    const refs = await listArtifacts(storeDir);
    expect(refs).toHaveLength(1);

    const metadata = await listArtifactMetadata(storeDir);
    expect(metadata).toEqual([]);

    const artifact = await getArtifact("tj_1234567-abcd", storeDir);
    expect(artifact).toBeNull();
  });

  it("tracks metadata-only entries without exposing them as raw artifacts", async () => {
    const storeDir = await createTempDir();

    const metadataRef = await storeArtifactMetadata(
      {
        input: { toolName: "exec", command: "pnpm test", exitCode: 0 },
        rawText: "test output",
        classification: { family: "test-results", confidence: 1, matchedReducer: "tests/pnpm-test" },
        stats: { rawChars: 11, reducedChars: 5, ratio: 0.45 },
      },
      storeDir,
    );

    const artifacts = await listArtifacts(storeDir);
    const metadata = await listArtifactMetadata(storeDir);

    expect(artifacts).toEqual([]);
    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.id).toBe(metadataRef.id);
    expect(metadata[0]?.path).toBeUndefined();
    expect(metadata[0]?.metadata.command).toBe("pnpm test");
  });
});
