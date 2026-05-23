import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorWindsurfRule, installWindsurfRule, uninstallWindsurfRule } from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.WINDSURF_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.WINDSURF_PROJECT_DIR;
  } else {
    process.env.WINDSURF_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-windsurf-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("windsurf rules", () => {
  it("installs an always-on workspace rule", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".windsurf", "rules", "tokenjuice.md");

    const result = await installWindsurfRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("trigger: always_on");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).toContain("terminal commands through Windsurf Cascade");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up an existing rule file before replacing it", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".windsurf", "rules", "tokenjuice.md");
    await installWindsurfRule(rulePath);
    await writeFile(rulePath, "# local Windsurf rule\n\n- keep this\n", "utf8");

    const result = await installWindsurfRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).not.toContain("keep this");
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".windsurf", "rules", "tokenjuice.md");

    await installWindsurfRule(rulePath);
    const installed = await doctorWindsurfRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallWindsurfRule(rulePath);
    const disabled = await doctorWindsurfRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules missing always-on activation", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".windsurf", "rules", "tokenjuice.md");
    await installWindsurfRule(rulePath);
    await writeFile(rulePath, "# tokenjuice terminal output compaction\n\n- tokenjuice wrap -- <command>\n", "utf8");

    const doctor = await doctorWindsurfRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Windsurf rule file is missing always-on activation");
  });

  it("uses WINDSURF_PROJECT_DIR for the default rule file", async () => {
    const home = await createTempDir();
    process.env.WINDSURF_PROJECT_DIR = home;

    const installed = await installWindsurfRule();
    const expectedRulePath = join(home, ".windsurf", "rules", "tokenjuice.md");
    const doctor = await doctorWindsurfRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default rule file when uninstalling", async () => {
    const home = await createTempDir();
    process.env.WINDSURF_PROJECT_DIR = home;
    const rulePath = join(home, ".windsurf", "rules", "tokenjuice.md");

    await installWindsurfRule();
    await uninstallWindsurfRule(rulePath);

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
