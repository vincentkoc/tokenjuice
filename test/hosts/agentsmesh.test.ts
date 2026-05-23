import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAgentsMeshRule,
  installAgentsMeshRule,
  uninstallAgentsMeshRule,
} from "../../src/index.js";
import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.AGENTSMESH_PROJECT_DIR;
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalProjectDir === undefined) {
    delete process.env.AGENTSMESH_PROJECT_DIR;
  } else {
    process.env.AGENTSMESH_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-agentsmesh-test-"));
  tempDirs.push(dir);
  return dir;
}

async function seedAgentsMeshProject(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, ".agentsmesh", "rules"), { recursive: true });
  await writeFile(join(projectDir, "agentsmesh.yaml"), "version: 1\ntargets: [codex-cli]\n", "utf8");
  await writeFile(join(projectDir, ".agentsmesh", "rules", "_root.md"), "# Project rules\n", "utf8");
}

describe("AgentsMesh rule", () => {
  it("installs an AgentsMesh source rule with generate guidance", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");

    const result = await installAgentsMeshRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(result.syncCommand).toBe("agentsmesh generate");
    expect(rule).toContain("# tokenjuice terminal output compaction");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).toContain("agentsmesh generate");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up existing source rules before replacing them", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");
    await installAgentsMeshRule(rulePath);
    await writeFile(rulePath, "custom local rule\n", "utf8");

    const result = await installAgentsMeshRule(rulePath);

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    expect(result.syncCommand).toBe("agentsmesh generate");
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("custom local rule\n");
    await expect(readFile(rulePath, "utf8")).resolves.toContain("agentsmesh generate");
  });

  it("does not overwrite an existing source rule backup", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agentsmesh", "rules"), { recursive: true });
    await writeFile(rulePath, "custom local rule\n", "utf8");
    await writeFile(`${rulePath}.bak`, "existing backup\n", "utf8");

    const result = await installAgentsMeshRule(rulePath);

    expect(result.backupPath).toBe(`${rulePath}.bak.1`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("existing backup\n");
    await expect(readFile(`${rulePath}.bak.1`, "utf8")).resolves.toBe("custom local rule\n");
  });

  it("does not create a backup for an idempotent reinstall", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");

    await installAgentsMeshRule(rulePath);
    const result = await installAgentsMeshRule(rulePath);

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(result.syncCommand).toBe("agentsmesh generate");
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");

    await installAgentsMeshRule(rulePath);
    const installed = await doctorAgentsMeshRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");
    expect(installed.advisories[0]).toContain("agentsmesh generate");

    const removed = await uninstallAgentsMeshRule(rulePath);
    const disabled = await doctorAgentsMeshRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(removed.syncCommand).toBe("agentsmesh generate");
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agentsmesh", "rules"), { recursive: true });
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

    const doctor = await doctorAgentsMeshRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured AgentsMesh rule file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured AgentsMesh rule file is missing generate guidance");
    expect(doctor.issues).toContain("configured AgentsMesh rule file still suggests the full escape hatch");
  });

  it("reports stale concrete full-output commands", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agentsmesh", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- After edits, run `agentsmesh generate`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentsMeshRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured AgentsMesh rule file still suggests the full escape hatch");
  });

  it("removes only the managed source rule file", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");
    const otherRulePath = join(home, ".agentsmesh", "rules", "_root.md");
    await mkdir(join(home, ".agentsmesh", "rules"), { recursive: true });
    await installAgentsMeshRule(rulePath);
    await writeFile(otherRulePath, "keep this\n", "utf8");

    const removed = await uninstallAgentsMeshRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(removed.syncCommand).toBe("agentsmesh generate");
    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(otherRulePath, "utf8")).resolves.toBe("keep this\n");
  });

  it("refuses to remove markerless user source rules", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agentsmesh", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom AgentsMesh rule\n\n- Leave this alone.\n", "utf8");

    await expect(uninstallAgentsMeshRule(rulePath)).rejects.toThrow("refusing to remove");
    await expect(readFile(rulePath, "utf8")).resolves.toContain("Leave this alone");
  });

  it("does not treat unrelated tokenjuice.md files as aggregate-installed", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agentsmesh", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom AgentsMesh rule\n\n- Leave this alone.\n", "utf8");

    const doctor = await doctorAgentsMeshRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    expect(doctor.issues).toContain("configured AgentsMesh rule file does not look like the tokenjuice rule");
  });

  it("uses AGENTSMESH_PROJECT_DIR for the default source rule", async () => {
    const home = await createTempDir();
    await seedAgentsMeshProject(home);
    process.env.AGENTSMESH_PROJECT_DIR = home;

    const installed = await installAgentsMeshRule();
    const expectedRulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");
    const doctor = await doctorAgentsMeshRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("prefers the nearest initialized AgentsMesh project over the git root", async () => {
    const repo = await createTempDir();
    const packageDir = join(repo, "packages", "api");
    const nestedCwd = join(packageDir, "src");
    await mkdir(join(repo, ".git"), { recursive: true });
    await seedAgentsMeshProject(packageDir);
    await mkdir(nestedCwd, { recursive: true });
    process.chdir(nestedCwd);

    const installed = await installAgentsMeshRule();
    const doctor = await doctorAgentsMeshRule();
    const expectedRulePath = join(await realpath(packageDir), ".agentsmesh", "rules", "tokenjuice.md");

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    await expect(access(join(repo, ".agentsmesh", "rules", "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses default install before AgentsMesh initializes the project", async () => {
    const home = await createTempDir();
    process.env.AGENTSMESH_PROJECT_DIR = home;

    await expect(installAgentsMeshRule()).rejects.toThrow("run agentsmesh init first");

    const doctor = await doctorAgentsMeshRule();
    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("AgentsMesh project is not initialized; run `agentsmesh init` before installing tokenjuice rules");
    expect(doctor.missingPaths).toEqual([join(home, "agentsmesh.yaml")]);
  });

  it("refuses default install when AgentsMesh disables the rules feature", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".agentsmesh", "rules"), { recursive: true });
    await writeFile(
      join(home, "agentsmesh.yaml"),
      [
        "version: 1",
        "targets: [codex-cli]",
        "features:",
        "  - commands",
        "  - mcp",
        "",
      ].join("\n"),
      "utf8",
    );
    process.env.AGENTSMESH_PROJECT_DIR = home;

    await expect(installAgentsMeshRule()).rejects.toThrow("disables the rules feature");

    const preinstallDoctor = await doctorAgentsMeshRule();
    expect(preinstallDoctor.status).toBe("broken");
    expect(preinstallDoctor.hasTokenjuiceMarker).toBe(false);
    expect(preinstallDoctor.issues).toContain("AgentsMesh rules feature is disabled in agentsmesh.yaml; add `rules` to features before running agentsmesh generate");
    expect(preinstallDoctor.fixCommand).toContain("features to include rules");

    expect(isInstalledHookIntegration(preinstallDoctor)).toBe(false);

    await writeFile(join(home, ".agentsmesh", "rules", "tokenjuice.md"), "# tokenjuice terminal output compaction\n", "utf8");
    const doctor = await doctorAgentsMeshRule();
    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(isInstalledHookIntegration(doctor)).toBe(true);
    expect(doctor.issues).toContain("AgentsMesh rules feature is disabled in agentsmesh.yaml; add `rules` to features before running agentsmesh generate");
  });

  it("warns when an AgentsMesh target override disables rules", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".agentsmesh", "rules"), { recursive: true });
    await writeFile(
      join(home, "agentsmesh.yaml"),
      [
        "version: 1",
        "targets: [codex-cli, cursor]",
        "features: [rules, commands]",
        "overrides:",
        "  cursor:",
        "    features: [commands]",
        "",
      ].join("\n"),
      "utf8",
    );
    process.env.AGENTSMESH_PROJECT_DIR = home;

    await installAgentsMeshRule();
    const doctor = await doctorAgentsMeshRule();

    expect(doctor.status).toBe("warn");
    expect(doctor.issues).toContain("AgentsMesh target override disables rules for cursor; generated config for that target will not receive tokenjuice guidance");
  });

  it("removes the default source rule file", async () => {
    const home = await createTempDir();
    await seedAgentsMeshProject(home);
    process.env.AGENTSMESH_PROJECT_DIR = home;
    const rulePath = join(home, ".agentsmesh", "rules", "tokenjuice.md");

    await installAgentsMeshRule();
    await uninstallAgentsMeshRule();

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
