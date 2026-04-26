import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listArtifactMetadata, listArtifacts, runWrappedCommand } from "../../src/index.js";
import { WRAP_AUTHORITATIVE_FOOTER } from "../../src/core/compaction-metadata.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-wrap-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("runWrappedCommand", () => {
  it("preserves the child exit code and produces a compact result", async () => {
    const wrapped = await runWrappedCommand([
      "node",
      "-e",
      "console.log('hello'); console.error('warning: noisy'); process.exit(3)",
    ]);

    expect(wrapped.exitCode).toBe(3);
    expect(wrapped.result.inlineText).toContain("exit 3");
    expect(wrapped.stderr).toContain("warning: noisy");
  });

  it("does not persist raw output unless storage is explicitly enabled", async () => {
    const storeDir = await createTempDir();

    await runWrappedCommand([
      "node",
      "-e",
      "console.log('secret token value');",
    ], {
      storeDir,
    });

    const refs = await listArtifacts(storeDir);
    expect(refs).toEqual([]);
  });

  it("caps captured output to avoid unbounded memory growth", async () => {
    const wrapped = await runWrappedCommand([
      "node",
      "-e",
      "process.stdout.write('a'.repeat(2000));",
    ], {
      maxCaptureBytes: 128,
    });

    expect(wrapped.stdout.length).toBeLessThan(300);
    expect(wrapped.stdout).toContain("[tokenjuice: output truncated]");
    expect(wrapped.result.inlineText).toContain("[tokenjuice: output truncated]");
  });

  it("records capture truncation state in stored metadata", async () => {
    const storeDir = await createTempDir();

    await runWrappedCommand([
      "node",
      "-e",
      "process.stdout.write('a'.repeat(2000));",
    ], {
      maxCaptureBytes: 128,
      store: true,
      storeDir,
    });

    const metadata = await listArtifactMetadata(storeDir);
    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.metadata.captureTruncated).toBe(true);
  });

  it("supports a raw bypass for wrapped commands", async () => {
    const wrapped = await runWrappedCommand([
      "node",
      "-e",
      "process.stdout.write('usage: cmd\\n\\nflag\\n');",
    ], {
      raw: true,
      maxInlineChars: 4,
    });

    expect(wrapped.result.inlineText).toBe("usage: cmd\n\nflag\n");
    expect(wrapped.result.stats.ratio).toBe(1);
  });

  it("records the requested source for wrapper stats", async () => {
    const storeDir = await createTempDir();

    await runWrappedCommand([
      "node",
      "-e",
      "console.log('source tagged output');",
    ], {
      source: "cursor",
      recordStats: true,
      storeDir,
    });

    const metadata = await listArtifactMetadata(storeDir);
    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.metadata.source).toBe("cursor");
  });

  it("does not flag lossless rewrites as authoritative compaction", async () => {
    const wrapped = await runWrappedCommand([
      "node",
      "-e",
      "process.stdout.write('Deleted branch fix/cd-prefixed-raw-bypass-main (was 76b6858).\\n');",
    ]);

    expect(wrapped.result.inlineText).toBe("Deleted branch fix/cd-prefixed-raw-bypass-main (was 76b6858).");
    expect(wrapped.result.compaction?.authoritative).toBe(false);
    expect(wrapped.result.inlineText).not.toContain(WRAP_AUTHORITATIVE_FOOTER);
  });

  it("flags omitted summaries as authoritative compaction", async () => {
    const wrapped = await runWrappedCommand([
      "node",
      "-e",
      "process.stdout.write(Array.from({ length: 40 }, (_, index) => `line ${index} ${'x'.repeat(80)}`).join('\\n'));",
    ]);

    expect(wrapped.result.inlineText).toContain("omitted");
    expect(wrapped.result.compaction?.authoritative).toBe(true);
  });
});
