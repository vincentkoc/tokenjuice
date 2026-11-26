import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctorMisterMorphSkill, installMisterMorphSkill, uninstallMisterMorphSkill } from "../../src/hosts/mister-morph/index.js";
import { main } from "../../src/cli/main.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "tokenjuice-mister-morph-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("MISTER_MORPH_FILE_STATE_DIR", "");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

describe("Mister Morph guidance skill", () => {
  it("uses the documented user discovery path and preserves foreign content", async () => {
    const result = await installMisterMorphSkill();
    expect(result.skillPath).toBe(join(home, ".morph", "skills", "tokenjuice", "SKILL.md"));
    expect(await readFile(result.skillPath, "utf8")).toContain("tokenjuice:mister-morph skill");
    expect(await readFile(result.skillPath, "utf8")).toContain("tokenjuice wrap --keep-failures -- <command>");
    expect((await installMisterMorphSkill()).backupPath).toBeUndefined();
    expect((await doctorMisterMorphSkill()).status).toBe("ok");
    expect((await uninstallMisterMorphSkill()).removed).toBe(true);
    expect((await doctorMisterMorphSkill()).status).toBe("disabled");
    await writeFile(result.skillPath, "foreign skill");
    await expect(installMisterMorphSkill()).rejects.toThrow("unowned skill");
    expect((await uninstallMisterMorphSkill()).removed).toBe(false);
  });

  it("honors Mister Morph's state-root override and explicit library option", async () => {
    const root = join(home, "custom");
    vi.stubEnv("MISTER_MORPH_FILE_STATE_DIR", root);
    expect((await installMisterMorphSkill()).skillPath).toBe(join(root, "skills", "tokenjuice", "SKILL.md"));
    expect((await installMisterMorphSkill({ stateDir: join(home, "explicit") })).skillPath)
      .toBe(join(home, "explicit", "skills", "tokenjuice", "SKILL.md"));
  });

  it("registers install, doctor and uninstall JSON CLI routes", async () => {
    const results = [];
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
      expect(await main([operation, "mister-morph", "--format", "json"])).toBe(0);
      spy.mockRestore();
      const result = JSON.parse(output);
      expect(result.skillPath).toBe(join(home, ".morph", "skills", "tokenjuice", "SKILL.md"));
      results.push(result);
    }
    expect(results[1].status).toBe("ok");
    expect(results[2].removed).toBe(true);
  });
});
