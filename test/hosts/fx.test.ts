import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorFxInstructions, installFxInstructions, uninstallFxInstructions } from "../../src/hosts/fx/index.js";

import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

const directories: string[] = [];
const originalProjectDir = process.env.FX_PROJECT_DIR;
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalProjectDir === undefined) delete process.env.FX_PROJECT_DIR;
  else process.env.FX_PROJECT_DIR = originalProjectDir;
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const path = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-fx-")));
  directories.push(path);
  return path;
}

describe("fx instructions", () => {
  it("installs guidance and preserves custom instructions exactly through reinstall and uninstall", async () => {
    const projectDir = await workspace();
    const path = join(projectDir, "AGENTS.md");
    const original = "# project\r\n\r\n  keep spacing  \r\n\r\n";
    await writeFile(path, original);
    const first = await installFxInstructions(undefined, { projectDir });
    const installed = await readFile(path, "utf8");
    expect(installed).toContain("<!-- tokenjuice:fx begin -->");
    expect(installed).toContain("tokenjuice wrap --raw -- <command>");
    expect(installed).toContain("tokenjuice wrap --keep-failures -- <command>");
    expect(installed).toContain(original);
    expect(first.backupPath).toBeDefined();
    expect(await readFile(first.backupPath!, "utf8")).toBe(original);
    expect((await installFxInstructions(undefined, { projectDir })).backupPath).toBeUndefined();
    expect(await readFile(path, "utf8")).toBe(installed);
    expect((await doctorFxInstructions(undefined, { projectDir })).status).toBe("ok");
    await uninstallFxInstructions(undefined, { projectDir });
    expect(await readFile(path, "utf8")).toBe(original);
    expect((await doctorFxInstructions(undefined, { projectDir })).status).toBe("disabled");
  });

  it("honors an explicit workspace and the environment override", async () => {
    const projectDir = await workspace();
    const other = await workspace();
    process.env.FX_PROJECT_DIR = other;
    expect((await installFxInstructions(undefined, { projectDir })).instructionsPath).toBe(join(projectDir, "AGENTS.md"));
    expect((await installFxInstructions()).instructionsPath).toBe(join(other, "AGENTS.md"));
  });

  it("uses the nearest repository root from a nested directory", async () => {
    const projectDir = await workspace();
    delete process.env.FX_PROJECT_DIR;
    await mkdir(join(projectDir, ".git"));
    await mkdir(join(projectDir, "nested"));
    process.chdir(join(projectDir, "nested"));
    expect((await installFxInstructions()).instructionsPath).toBe(join(projectDir, "AGENTS.md"));
  });

  it("removes an instruction file created only for tokenjuice", async () => {
    const projectDir = await workspace();
    await installFxInstructions(undefined, { projectDir });
    expect((await uninstallFxInstructions(undefined, { projectDir })).removed).toBe(true);
    await expect(access(join(projectDir, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses malformed markers without changing the file", async () => {
    const projectDir = await workspace();
    const path = join(projectDir, "AGENTS.md");
    const original = "<!-- tokenjuice:fx begin -->\nkeep me\n";
    await writeFile(path, original);
    expect((await doctorFxInstructions(undefined, { projectDir })).status).toBe("broken");
    await expect(installFxInstructions(undefined, { projectDir })).rejects.toThrow(/malformed/u);
    await expect(uninstallFxInstructions(undefined, { projectDir })).rejects.toThrow(/malformed/u);
    expect(await readFile(path, "utf8")).toBe(original);
  });

  it("refuses symlinks and paths outside the selected workspace", async () => {
    const projectDir = await workspace();
    const outside = await workspace();
    const target = join(outside, "AGENTS.md");
    await writeFile(target, "private\n");
    await symlink(target, join(projectDir, "AGENTS.md"));
    await expect(installFxInstructions(undefined, { projectDir })).rejects.toThrow(/symlink/u);
    const report = await doctorFxInstructions(undefined, { projectDir });
    expect(report.status).toBe("broken");
    expect(report.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(report)).toBe(false);
    await expect(installFxInstructions(target, { projectDir })).rejects.toThrow(/outside/u);
    expect(await readFile(target, "utf8")).toBe("private\n");
  });
});
