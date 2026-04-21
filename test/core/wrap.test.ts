import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listArtifacts, runWrappedCommand } from "../../src/index.js";

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
});
