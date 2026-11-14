import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { doctorCraftAgentsSkill, installCraftAgentsSkill, uninstallCraftAgentsSkill } from "../../src/hosts/craft-agents/index.js";
import { main } from "../../src/cli/main.js";

let home: string;
let workspace: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "tokenjuice-craft-agents-"));
  workspace = join(home, "workspaces", "selected");
  await mkdir(workspace, { recursive: true });
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("CRAFT_CONFIG_DIR", home);
  vi.stubEnv("TOKENJUICE_CRAFT_WORKSPACE", "");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

describe("Craft Agents workspace skill", () => {
  it("requires an explicit existing workspace and never guesses or creates one", async () => {
    expect((await doctorCraftAgentsSkill()).status).toBe("disabled");
    await expect(installCraftAgentsSkill()).rejects.toThrow("select an existing");
    await expect(installCraftAgentsSkill({ workspaceDir: join(home, "missing") })).rejects.toThrow();
    expect((await doctorCraftAgentsSkill({ workspaceDir: join(home, "missing") })).status).toBe("broken");
  });

  it("installs idempotently in the selected workspace and preserves unrelated files", async () => {
    const options = { workspaceDir: workspace };
    await writeFile(join(workspace, "config.json"), '{"name":"custom"}\n');
    const result = await installCraftAgentsSkill(options);
    expect(result.skillPath).toBe(join(workspace, "skills", "tokenjuice", "SKILL.md"));
    const text = await readFile(result.skillPath, "utf8");
    expect(text).toContain("tokenjuice:craft-agents skill");
    expect(text).not.toContain("alwaysAllow:");
    expect(text).toContain("--keep-failures");
    expect(await installCraftAgentsSkill(options)).toEqual({ skillPath: result.skillPath });
    expect((await doctorCraftAgentsSkill(options)).status).toBe("ok");
    expect((await uninstallCraftAgentsSkill(options)).removed).toBe(true);
    expect((await doctorCraftAgentsSkill(options)).status).toBe("disabled");
    expect(await readFile(join(workspace, "config.json"), "utf8")).toBe('{"name":"custom"}\n');
    await writeFile(result.skillPath, "custom skill");
    await expect(installCraftAgentsSkill(options)).rejects.toThrow("unowned skill");
    expect((await uninstallCraftAgentsSkill(options)).removed).toBe(false);
  });

  it("refuses workspace and skill symlinks", async () => {
    const alias = join(home, "alias");
    await symlink(workspace, alias, "dir");
    await expect(installCraftAgentsSkill({ workspaceDir: alias })).rejects.toThrow("non-symlink");
    expect((await doctorCraftAgentsSkill({ workspaceDir: alias })).status).toBe("broken");
    await mkdir(join(workspace, "skills"));
    await symlink(home, join(workspace, "skills", "tokenjuice"), "dir");
    await expect(installCraftAgentsSkill({ workspaceDir: workspace })).rejects.toThrow("unsafe managed skill path");
  });

  it("uses explicit CLI selection ahead of the environment for every lifecycle operation", async () => {
    vi.stubEnv("TOKENJUICE_CRAFT_WORKSPACE", join(home, "not-selected"));
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
      expect(await main([operation, "craft-agents", workspace, "--format", "json"])).toBe(0);
      spy.mockRestore();
      expect(JSON.parse(output).skillPath).toBe(join(workspace, "skills", "tokenjuice", "SKILL.md"));
    }
  });
});
