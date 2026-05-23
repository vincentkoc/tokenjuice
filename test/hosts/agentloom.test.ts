import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAgentloomRule,
  installAgentloomRule,
  uninstallAgentloomRule,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.AGENTLOOM_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.AGENTLOOM_PROJECT_DIR;
  } else {
    process.env.AGENTLOOM_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-agentloom-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("Agentloom rule", () => {
  it("installs an Agentloom source rule with sync guidance", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");

    const result = await installAgentloomRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("---\nname: tokenjuice terminal output compaction");
    expect(rule).toContain("alwaysApply: true");
    expect(rule).toContain("# tokenjuice terminal output compaction");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).toContain("agentloom sync");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up an existing source rule before replacing it", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");
    await installAgentloomRule(rulePath);
    await writeFile(rulePath, "custom local rule\n", "utf8");

    const result = await installAgentloomRule(rulePath);

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("custom local rule\n");
    await expect(readFile(rulePath, "utf8")).resolves.toContain("agentloom sync");
  });

  it("does not overwrite an existing source rule backup", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(rulePath, "custom local rule\n", "utf8");
    await writeFile(`${rulePath}.bak`, "existing backup\n", "utf8");

    const result = await installAgentloomRule(rulePath);

    expect(result.backupPath).toBe(`${rulePath}.bak.1`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("existing backup\n");
    await expect(readFile(`${rulePath}.bak.1`, "utf8")).resolves.toBe("custom local rule\n");
  });

  it("does not create a backup for an idempotent reinstall", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");

    await installAgentloomRule(rulePath);
    const result = await installAgentloomRule(rulePath);

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");

    await installAgentloomRule(rulePath);
    const installed = await doctorAgentloomRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");
    expect(installed.advisories[0]).toContain("agentloom sync");

    const removed = await uninstallAgentloomRule(rulePath);
    const disabled = await doctorAgentloomRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(removed.syncCommand).toBe("agentloom sync");
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");
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

    const doctor = await doctorAgentloomRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Agentloom rule file is missing required name frontmatter");
    expect(doctor.issues).toContain("configured Agentloom rule file is missing description frontmatter");
    expect(doctor.issues).toContain("configured Agentloom rule file is missing alwaysApply frontmatter");
    expect(doctor.issues).toContain("configured Agentloom rule file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Agentloom rule file is missing sync guidance");
    expect(doctor.issues).toContain("configured Agentloom rule file still suggests the full escape hatch");
  });

  it("reports broken rules with frontmatter text outside frontmatter", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "name: tokenjuice terminal output compaction",
        "description: tokenjuice terminal output compaction",
        "alwaysApply: true",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- After edits, run `agentloom sync`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentloomRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Agentloom rule file is missing required name frontmatter");
    expect(doctor.issues).toContain("configured Agentloom rule file is missing description frontmatter");
    expect(doctor.issues).toContain("configured Agentloom rule file is missing alwaysApply frontmatter");
  });

  it("reports broken rules with nested frontmatter metadata", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "cursor:",
        "  name: tokenjuice terminal output compaction",
        "  description: tokenjuice terminal output compaction",
        "  alwaysApply: true",
        "---",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- After edits, run `agentloom sync`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentloomRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Agentloom rule file is missing required name frontmatter");
    expect(doctor.issues).toContain("configured Agentloom rule file is missing description frontmatter");
    expect(doctor.issues).toContain("configured Agentloom rule file is missing alwaysApply frontmatter");
  });

  it("reports stale concrete full-output commands", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "name: tokenjuice terminal output compaction",
        "description: tokenjuice terminal output compaction",
        "alwaysApply: true",
        "---",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- After edits, run `agentloom sync`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentloomRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Agentloom rule file still suggests the full escape hatch");
  });

  it("accepts CRLF frontmatter", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "name: tokenjuice terminal output compaction",
        "description: tokenjuice terminal output compaction",
        "alwaysApply: true",
        "---",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- After edits, run `agentloom sync`.",
      ].join("\r\n"),
      "utf8",
    );

    const doctor = await doctorAgentloomRule(rulePath);

    expect(doctor.status).toBe("ok");
  });

  it("removes only the managed source rule file", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");
    const otherRulePath = join(home, ".agents", "rules", "always-test.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(rulePath, "custom local rule\n", "utf8");
    await writeFile(otherRulePath, "keep this\n", "utf8");

    const removed = await uninstallAgentloomRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(removed.syncCommand).toBe("agentloom sync");
    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(otherRulePath, "utf8")).resolves.toBe("keep this\n");
  });

  it("uses AGENTLOOM_PROJECT_DIR for the default source rule", async () => {
    const home = await createTempDir();
    process.env.AGENTLOOM_PROJECT_DIR = home;

    const installed = await installAgentloomRule();
    const expectedRulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");
    const doctor = await doctorAgentloomRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default source rule file", async () => {
    const home = await createTempDir();
    process.env.AGENTLOOM_PROJECT_DIR = home;
    const rulePath = join(home, ".agents", "rules", "tokenjuice-agentloom.md");

    await installAgentloomRule();
    await uninstallAgentloomRule();

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
