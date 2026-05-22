import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { WRAP_AUTHORITATIVE_FOOTER } from "../../src/core/compaction-metadata.js";
import { decorateWrapInlineText, isDirectModuleEntrypoint, parseArgs } from "../../src/cli/main.js";
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

describe("parseArgs", () => {
  it("parses --no-omit for reduce and wrap", () => {
    expect(parseArgs(["reduce", "--no-omit"]).noOmit).toBe(true);
    expect(parseArgs(["wrap", "--no-omit", "--", "echo", "hi"]).noOmit).toBe(true);
  });
});

describe("decorateWrapInlineText", () => {
  it("suppresses the authoritative footer when noOmit is enabled", () => {
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

    expect(decorateWrapInlineText(result, false, false)).toContain(WRAP_AUTHORITATIVE_FOOTER);
    expect(decorateWrapInlineText(result, false, true)).toBe("summary");
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
