import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAiderConvention,
  installAiderConvention,
  uninstallAiderConvention,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.AIDER_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.AIDER_PROJECT_DIR;
  } else {
    process.env.AIDER_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-aider-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("aider conventions", () => {
  it("installs a convention file with the tokenjuice escape hatch", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "CONVENTIONS.tokenjuice.md");

    const result = await installAiderConvention(conventionPath);
    const convention = await readFile(conventionPath, "utf8");

    expect(result.conventionPath).toBe(conventionPath);
    expect(result.backupPath).toBeUndefined();
    expect(convention).toContain("tokenjuice terminal output compaction");
    expect(convention).toContain("tokenjuice wrap -- <command>");
    expect(convention).toContain("tokenjuice wrap --raw -- <command>");
    expect(convention).toContain("aider --read CONVENTIONS.tokenjuice.md");
    expect(convention).not.toContain("wrap --full");
  });

  it("backs up an existing convention before replacing it", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "CONVENTIONS.tokenjuice.md");
    await installAiderConvention(conventionPath);
    await writeFile(conventionPath, "custom local convention\n", "utf8");

    const result = await installAiderConvention(conventionPath);

    expect(result.backupPath).toBe(`${conventionPath}.bak`);
    await expect(readFile(`${conventionPath}.bak`, "utf8")).resolves.toBe("custom local convention\n");
  });

  it("reports installed and uninstalled convention health", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "CONVENTIONS.tokenjuice.md");

    await installAiderConvention(conventionPath);
    const installed = await doctorAiderConvention(conventionPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("convention-based");

    const removed = await uninstallAiderConvention(conventionPath);
    const disabled = await doctorAiderConvention(conventionPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("uses AIDER_PROJECT_DIR for the default convention file", async () => {
    const home = await createTempDir();
    process.env.AIDER_PROJECT_DIR = home;

    const installed = await installAiderConvention();
    const expectedConventionPath = join(home, "CONVENTIONS.tokenjuice.md");
    const doctor = await doctorAiderConvention();

    expect(installed.conventionPath).toBe(expectedConventionPath);
    expect(doctor.conventionPath).toBe(expectedConventionPath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default convention file", async () => {
    const home = await createTempDir();
    process.env.AIDER_PROJECT_DIR = home;
    const conventionPath = join(home, "CONVENTIONS.tokenjuice.md");

    await installAiderConvention();
    await uninstallAiderConvention(conventionPath);

    await expect(access(conventionPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
