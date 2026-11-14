import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorNanobotSkill, installNanobotSkill, uninstallNanobotSkill } from "../../src/hosts/nanobot/index.js";
import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

const directories: string[] = [];
const originalWorkspace = process.env.NANOBOT_WORKSPACE;
const originalHome = process.env.HOME;

afterEach(async () => {
  if (originalWorkspace === undefined) delete process.env.NANOBOT_WORKSPACE;
  else process.env.NANOBOT_WORKSPACE = originalWorkspace;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const path = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-nanobot-")));
  directories.push(path);
  return path;
}

const skillPath = (workspaceDir: string) => join(workspaceDir, "skills", "tokenjuice", "SKILL.md");

describe("nanobot skill", () => {
  it("installs native discovery frontmatter and preserves a custom skill across the lifecycle", async () => {
    const workspaceDir = await workspace();
    const path = skillPath(workspaceDir);
    await mkdir(join(workspaceDir, "skills", "tokenjuice"), { recursive: true });
    const original = "# custom skill\r\n\r\n  keep this  \r\n";
    await writeFile(path, original);
    const first = await installNanobotSkill(undefined, { workspaceDir });
    const installed = await readFile(path, "utf8");
    expect(installed.startsWith("---\nname: tokenjuice\n")).toBe(true);
    expect(installed).toContain("tokenjuice wrap --raw -- <command>");
    expect(installed).toContain("tokenjuice wrap --keep-failures -- <command>");
    expect(first.backupPath).toBeDefined();
    expect(await readFile(first.backupPath!, "utf8")).toBe(original);
    expect((await installNanobotSkill(undefined, { workspaceDir })).backupPath).toBeUndefined();
    expect(await readFile(path, "utf8")).toBe(installed);
    expect((await doctorNanobotSkill(undefined, { workspaceDir })).status).toBe("ok");
    await uninstallNanobotSkill(undefined, { workspaceDir });
    expect(await readFile(path, "utf8")).toBe(original);
    expect((await doctorNanobotSkill(undefined, { workspaceDir })).status).toBe("disabled");
  });

  it("uses the default initialized workspace and honors explicit overrides", async () => {
    const home = await workspace();
    process.env.HOME = home;
    delete process.env.NANOBOT_WORKSPACE;
    const defaultWorkspace = join(home, ".nanobot", "workspace");
    await mkdir(defaultWorkspace, { recursive: true });
    expect((await installNanobotSkill()).skillPath).toBe(skillPath(defaultWorkspace));
    const override = await workspace();
    process.env.NANOBOT_WORKSPACE = override;
    expect((await installNanobotSkill()).skillPath).toBe(skillPath(override));
    const explicit = await workspace();
    expect((await installNanobotSkill(undefined, { workspaceDir: explicit })).skillPath).toBe(skillPath(explicit));
  });

  it("removes a skill created only for tokenjuice and preserves unrelated skills", async () => {
    const workspaceDir = await workspace();
    await mkdir(join(workspaceDir, "skills", "custom"), { recursive: true });
    const custom = join(workspaceDir, "skills", "custom", "SKILL.md");
    await writeFile(custom, "keep me");
    await installNanobotSkill(undefined, { workspaceDir });
    expect((await uninstallNanobotSkill(undefined, { workspaceDir })).removed).toBe(true);
    await expect(access(skillPath(workspaceDir))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(custom, "utf8")).toBe("keep me");
  });

  it("reports incomplete managed guidance as broken", async () => {
    const workspaceDir = await workspace();
    await installNanobotSkill(undefined, { workspaceDir });
    await writeFile(skillPath(workspaceDir), "<!-- tokenjuice:nanobot-skill -->\n");
    expect((await doctorNanobotSkill(undefined, { workspaceDir })).status).toBe("broken");
  });

  it("rejects symlinked skills and leaves unrelated paths unmodified", async () => {
    const workspaceDir = await workspace();
    const outside = await workspace();
    const target = join(outside, "SKILL.md");
    await writeFile(target, "private\n");
    await mkdir(join(workspaceDir, "skills", "tokenjuice"), { recursive: true });
    await symlink(target, skillPath(workspaceDir));
    await expect(installNanobotSkill(undefined, { workspaceDir })).rejects.toThrow(/symlink/u);
    const report = await doctorNanobotSkill(undefined, { workspaceDir });
    expect(report.status).toBe("broken");
    expect(report.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(report)).toBe(false);
    await expect(installNanobotSkill(target, { workspaceDir })).rejects.toThrow(/outside/u);
    expect(await readFile(target, "utf8")).toBe("private\n");
  });

  it("rejects custom file locations inside the workspace", async () => {
    const workspaceDir = await workspace();
    const path = join(workspaceDir, "README.md");
    await writeFile(path, "keep me");
    await expect(installNanobotSkill(path, { workspaceDir })).rejects.toThrow(/only installs/u);
    expect(await readFile(path, "utf8")).toBe("keep me");
  });
});
