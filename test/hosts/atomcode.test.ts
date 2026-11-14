import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctorAtomCodeSkill, installAtomCodeSkill, uninstallAtomCodeSkill } from "../../src/hosts/atomcode/index.js";
import { main } from "../../src/cli/main.js";

let project: string;
beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "tokenjuice-atomcode-"));
  vi.stubEnv("HOME", project);
  vi.stubEnv("USERPROFILE", project);
  vi.stubEnv("ATOMCODE_PROJECT_DIR", project);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(project, { recursive: true, force: true });
});

describe("AtomCode project skill", () => {
  it("uses project skill discovery without changing project instructions", async () => {
    await writeFile(join(project, ".atomcode.md"), "custom instructions\n");
    const result = await installAtomCodeSkill();
    expect(result.skillPath).toBe(join(project, ".atomcode", "skills", "tokenjuice", "SKILL.md"));
    const text = await readFile(result.skillPath, "utf8");
    expect(text).toContain("tokenjuice:atomcode skill");
    expect(text).toContain("--keep-failures");
    expect(text).not.toContain("allowed-tools:");
    expect(await installAtomCodeSkill()).toEqual({ skillPath: result.skillPath });
    expect((await doctorAtomCodeSkill()).status).toBe("ok");
    expect((await uninstallAtomCodeSkill()).removed).toBe(true);
    expect((await doctorAtomCodeSkill()).status).toBe("disabled");
    expect(await readFile(join(project, ".atomcode.md"), "utf8")).toBe("custom instructions\n");
    await writeFile(result.skillPath, "custom skill");
    await expect(installAtomCodeSkill()).rejects.toThrow("unowned skill");
    expect((await uninstallAtomCodeSkill()).removed).toBe(false);
  });

  it("refuses symlinked skill directories", async () => {
    await mkdir(join(project, ".atomcode"));
    await symlink(project, join(project, ".atomcode", "skills"), "dir");
    await expect(installAtomCodeSkill()).rejects.toThrow("unsafe managed skill path");
    expect((await doctorAtomCodeSkill()).status).toBe("broken");
  });

  it("registers the JSON CLI lifecycle", async () => {
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
      expect(await main([operation, "atomcode", "--format", "json"])).toBe(0);
      spy.mockRestore();
      expect(JSON.parse(output).skillPath).toBe(join(project, ".atomcode", "skills", "tokenjuice", "SKILL.md"));
    }
  });
});
