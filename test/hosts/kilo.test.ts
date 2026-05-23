import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorKiloRule, installKiloRule, uninstallKiloRule } from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.KILO_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.KILO_PROJECT_DIR;
  } else {
    process.env.KILO_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-kilo-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("kilo rules", () => {
  it("installs a workspace rule", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".kilo", "rules", "tokenjuice.md");

    const result = await installKiloRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).toContain("terminal commands through Kilo Code");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up an existing rule file before replacing it", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".kilo", "rules", "tokenjuice.md");
    await installKiloRule(rulePath);
    await writeFile(rulePath, "# local Kilo rule\n\n- keep this\n", "utf8");

    const result = await installKiloRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).not.toContain("keep this");
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".kilo", "rules", "tokenjuice.md");

    await installKiloRule(rulePath);
    const installed = await doctorKiloRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallKiloRule(rulePath);
    const disabled = await doctorKiloRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules missing tokenjuice guidance", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".kilo", "rules", "tokenjuice.md");
    await installKiloRule(rulePath);
    await writeFile(rulePath, "# project rules\n\n- no tokenjuice here\n", "utf8");

    const doctor = await doctorKiloRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Kilo Code rule file is missing tokenjuice wrap guidance");
  });

  it("uses KILO_PROJECT_DIR for the default rule file", async () => {
    const home = await createTempDir();
    process.env.KILO_PROJECT_DIR = home;

    const installed = await installKiloRule();
    const expectedRulePath = join(home, ".kilo", "rules", "tokenjuice.md");
    const doctor = await doctorKiloRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default rule file when uninstalling", async () => {
    const home = await createTempDir();
    process.env.KILO_PROJECT_DIR = home;
    const rulePath = join(home, ".kilo", "rules", "tokenjuice.md");

    await installKiloRule();
    await uninstallKiloRule(rulePath);

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
