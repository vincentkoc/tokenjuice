import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorContinueRule,
  installContinueRule,
  uninstallContinueRule,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.CONTINUE_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.CONTINUE_PROJECT_DIR;
  } else {
    process.env.CONTINUE_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-continue-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("continue rules", () => {
  it("installs a workspace rule with the tokenjuice escape hatch", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".continue", "rules", "tokenjuice.md");

    const result = await installContinueRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("name: tokenjuice terminal output compaction");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up an existing rule before replacing it", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".continue", "rules", "tokenjuice.md");
    await installContinueRule(rulePath);
    await writeFile(rulePath, "custom local rule\n", "utf8");

    const result = await installContinueRule(rulePath);

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("custom local rule\n");
    await expect(readFile(rulePath, "utf8")).resolves.toContain("tokenjuice wrap --raw -- <command>");
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".continue", "rules", "tokenjuice.md");

    await installContinueRule(rulePath);
    const installed = await doctorContinueRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallContinueRule(rulePath);
    const disabled = await doctorContinueRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".continue", "rules", "tokenjuice.md");
    await mkdir(join(home, ".continue", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "name: tokenjuice terminal output compaction",
        "---",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorContinueRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Continue rule file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Continue rule file still suggests the full escape hatch");
  });

  it("removes an existing rule file without requiring tokenjuice content", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".continue", "rules", "tokenjuice.md");
    await mkdir(join(home, ".continue", "rules"), { recursive: true });
    await writeFile(rulePath, "custom local rule\n", "utf8");

    const removed = await uninstallContinueRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses CONTINUE_PROJECT_DIR for the default workspace rule", async () => {
    const home = await createTempDir();
    process.env.CONTINUE_PROJECT_DIR = home;

    const installed = await installContinueRule();
    const expectedRulePath = join(home, ".continue", "rules", "tokenjuice.md");
    const doctor = await doctorContinueRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default rule file", async () => {
    const home = await createTempDir();
    process.env.CONTINUE_PROJECT_DIR = home;
    const rulePath = join(home, ".continue", "rules", "tokenjuice.md");

    await installContinueRule();
    await uninstallContinueRule(rulePath);

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
