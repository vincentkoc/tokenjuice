import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAgentsGeRule,
  installAgentsGeRule,
  uninstallAgentsGeRule,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.AGENTSGE_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.AGENTSGE_PROJECT_DIR;
  } else {
    process.env.AGENTSGE_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-agentsge-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("agents.ge rule", () => {
  it("installs an agents.ge source rule with sync guidance", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentsge.md");

    const result = await installAgentsGeRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("# tokenjuice terminal output compaction");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).toContain("agents sync");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up an existing source rule before replacing it", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentsge.md");
    await installAgentsGeRule(rulePath);
    await writeFile(rulePath, "custom local rule\n", "utf8");

    const result = await installAgentsGeRule(rulePath);

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("custom local rule\n");
    await expect(readFile(rulePath, "utf8")).resolves.toContain("agents sync");
  });

  it("does not overwrite an existing source rule backup", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentsge.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(rulePath, "custom local rule\n", "utf8");
    await writeFile(`${rulePath}.bak`, "user backup\n", "utf8");

    const result = await installAgentsGeRule(rulePath);

    expect(result.backupPath).toBe(`${rulePath}.bak.1`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("user backup\n");
    await expect(readFile(`${rulePath}.bak.1`, "utf8")).resolves.toBe("custom local rule\n");
  });

  it("does not create a backup for idempotent reinstall", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentsge.md");
    await installAgentsGeRule(rulePath);

    const result = await installAgentsGeRule(rulePath);

    expect(result.backupPath).toBeUndefined();
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentsge.md");

    await installAgentsGeRule(rulePath);
    const installed = await doctorAgentsGeRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");
    expect(installed.advisories[0]).toContain("agents sync");

    const removed = await uninstallAgentsGeRule(rulePath);
    const disabled = await doctorAgentsGeRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentsge.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentsGeRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured agents.ge rule file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured agents.ge rule file is missing sync guidance");
    expect(doctor.issues).toContain("configured agents.ge rule file still suggests the full escape hatch");
  });

  it("reports stale concrete full-output commands", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentsge.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- After edits, run `agents sync`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentsGeRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured agents.ge rule file still suggests the full escape hatch");
  });

  it("removes only the managed source rule file", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentsge.md");
    const otherRulePath = join(home, ".agents", "rules", "_capture.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(rulePath, "custom local rule\n", "utf8");
    await writeFile(otherRulePath, "keep this\n", "utf8");

    const removed = await uninstallAgentsGeRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(otherRulePath, "utf8")).resolves.toBe("keep this\n");
  });

  it("uses AGENTSGE_PROJECT_DIR for the default source rule", async () => {
    const home = await createTempDir();
    process.env.AGENTSGE_PROJECT_DIR = home;

    const installed = await installAgentsGeRule();
    const expectedRulePath = join(home, ".agents", "rules", "tokenjuice-agentsge.md");
    const doctor = await doctorAgentsGeRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default source rule file", async () => {
    const home = await createTempDir();
    process.env.AGENTSGE_PROJECT_DIR = home;
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentsge.md");

    await installAgentsGeRule();
    await uninstallAgentsGeRule();

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
