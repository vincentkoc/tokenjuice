import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctorMuseCodeSkill, installMuseCodeSkill, uninstallMuseCodeSkill } from "../../src/hosts/muse-code/index.js";
import { getAvailableHookIntegrationNames } from "../../src/hosts/shared/hook-doctor.js";
import { main } from "../../src/cli/main.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "tokenjuice-muse-code-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("Muse Code project guidance skill", () => {
  it("uses the native project path, preserves siblings and installs idempotently", async () => {
    const result = await installMuseCodeSkill();
    expect(result.skillPath).toBe(join(root, ".agents", "skills", "tokenjuice", "SKILL.md"));
    const text = await readFile(result.skillPath, "utf8");
    expect(text).toContain("tokenjuice:muse-code skill");
    expect(text).toContain("--keep-failures");
    expect(text).toContain("--raw");
    expect(text).toContain("tokenjuice --version");
    expect(getAvailableHookIntegrationNames()).toContain("muse-code");
    expect((await doctorMuseCodeSkill()).status).toBe("ok");
    expect((await installMuseCodeSkill()).backupPath).toBeUndefined();
    const sibling = join(dirname(result.skillPath), "notes.md");
    await writeFile(sibling, "preserved");
    expect((await uninstallMuseCodeSkill()).removed).toBe(true);
    expect(await readFile(sibling, "utf8")).toBe("preserved");
    expect((await doctorMuseCodeSkill()).status).toBe("disabled");
  });

  it("honors explicit project roots and preserves foreign or modified content", async () => {
    const projectDir = join(root, "project");
    const result = await installMuseCodeSkill({ projectDir });
    expect(result.skillPath).toBe(join(projectDir, ".agents", "skills", "tokenjuice", "SKILL.md"));
    const text = await readFile(result.skillPath, "utf8");
    await writeFile(result.skillPath, text + "\ncustom guidance\n");
    expect((await doctorMuseCodeSkill({ projectDir })).status).toBe("warn");
    const refreshed = await installMuseCodeSkill({ projectDir });
    expect(await readFile(refreshed.backupPath!, "utf8")).toContain("custom guidance");
    await writeFile(result.skillPath, "foreign skill");
    await expect(installMuseCodeSkill({ projectDir })).rejects.toThrow("unowned skill");
    expect((await doctorMuseCodeSkill({ projectDir })).status).toBe("broken");
    expect((await uninstallMuseCodeSkill({ projectDir })).removed).toBe(false);
  });

  it("rejects a symlinked skill directory without changing its target", async () => {
    const target = join(root, "target");
    await mkdir(target);
    await symlink(target, join(root, ".agents"), "dir");
    await expect(installMuseCodeSkill()).rejects.toThrow("unsafe managed skill path");
    expect((await doctorMuseCodeSkill()).status).toBe("broken");
  });

  it("registers install, doctor and uninstall JSON CLI routes", async () => {
    const results = [];
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
      expect(await main([operation, "muse-code", "--format", "json"])).toBe(0);
      spy.mockRestore();
      results.push(JSON.parse(output));
    }
    expect(results[0].skillPath).toBe(join(root, ".agents", "skills", "tokenjuice", "SKILL.md"));
    expect(results[1].status).toBe("ok");
    expect(results[2].removed).toBe(true);
  });
});
