import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findGitRoot, hasGitMetadata } from "../../../src/hosts/shared/project-root.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-project-root-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("findGitRoot", () => {
  it.each(["directory", "file"])("finds a parent repository with a .git %s", async (kind) => {
    const dir = await createTempDir();
    const nested = join(dir, "src", "nested");
    await mkdir(nested, { recursive: true });
    if (kind === "directory") {
      await mkdir(join(dir, ".git"));
    } else {
      await writeFile(join(dir, ".git"), "gitdir: /example/worktrees/task\n");
    }

    expect(await findGitRoot(nested)).toBe(dir);
    expect(await findGitRoot(dir)).toBe(dir);
  });

  it("prefers the closest repository", async () => {
    const dir = await createTempDir();
    const nested = join(dir, "nested");
    await mkdir(join(dir, ".git"));
    await mkdir(join(nested, ".git"), { recursive: true });

    expect(await findGitRoot(nested)).toBe(nested);
  });

  it("returns undefined when no ancestor has Git metadata", async () => {
    const dir = await createTempDir();

    expect(await hasGitMetadata(dir)).toBe(false);
    expect(await findGitRoot(dir)).toBeUndefined();
  });
});
