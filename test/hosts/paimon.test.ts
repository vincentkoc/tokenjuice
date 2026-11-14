import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctorPaimonSkill, installPaimonSkill, uninstallPaimonSkill } from "../../src/hosts/paimon/index.js";
import { main } from "../../src/cli/main.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "tokenjuice-paimon-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("PAIMON_CONFIG_HOME", "");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

describe("Paimon guidance skill", () => {
  it("uses the documented user discovery path and preserves foreign content", async () => {
    const result = await installPaimonSkill();
    expect(result.skillPath).toBe(join(home, ".config", "paimon", "skills", "tokenjuice", "SKILL.md"));
    expect(await readFile(result.skillPath, "utf8")).toContain("tokenjuice:paimon skill");
    expect(await readFile(result.skillPath, "utf8")).toContain("tokenjuice wrap --keep-failures -- <command>");
    expect((await installPaimonSkill()).backupPath).toBeUndefined();
    expect((await doctorPaimonSkill()).status).toBe("ok");
    expect((await uninstallPaimonSkill()).removed).toBe(true);
    expect((await doctorPaimonSkill()).status).toBe("disabled");
    await writeFile(result.skillPath, "foreign skill");
    await expect(installPaimonSkill()).rejects.toThrow("unowned skill");
    expect((await uninstallPaimonSkill()).removed).toBe(false);
  });

  it("honors Paimon's configuration-root override and explicit library option", async () => {
    const root = join(home, "custom");
    vi.stubEnv("PAIMON_CONFIG_HOME", root);
    expect((await installPaimonSkill()).skillPath).toBe(join(root, "skills", "tokenjuice", "SKILL.md"));
    expect((await installPaimonSkill({ configDir: join(home, "explicit") })).skillPath)
      .toBe(join(home, "explicit", "skills", "tokenjuice", "SKILL.md"));
  });

  it("registers install, doctor and uninstall JSON CLI routes", async () => {
    const results = [];
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
      expect(await main([operation, "paimon", "--format", "json"])).toBe(0);
      spy.mockRestore();
      const result = JSON.parse(output);
      expect(result.skillPath).toBe(join(home, ".config", "paimon", "skills", "tokenjuice", "SKILL.md"));
      results.push(result);
    }
    expect(results[1].status).toBe("ok");
    expect(results[2].removed).toBe(true);
  });
});
