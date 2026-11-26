import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctorShelleySkill, installShelleySkill, uninstallShelleySkill } from "../../src/hosts/shelley/index.js";
import { main } from "../../src/cli/main.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "tokenjuice-shelley-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("XDG_CONFIG_HOME", join(home, "ignored-xdg"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

describe("Shelley guidance skill", () => {
  it("uses the documented user discovery path and preserves foreign content", async () => {
    const result = await installShelleySkill();
    expect(result.skillPath).toBe(join(home, ".config", "shelley", "tokenjuice", "SKILL.md"));
    expect(await readFile(result.skillPath, "utf8")).toContain("tokenjuice:shelley skill");
    expect(await readFile(result.skillPath, "utf8")).toContain("tokenjuice wrap --keep-failures -- <command>");
    expect((await installShelleySkill()).backupPath).toBeUndefined();
    expect((await doctorShelleySkill()).status).toBe("ok");
    expect((await uninstallShelleySkill()).removed).toBe(true);
    expect((await doctorShelleySkill()).status).toBe("disabled");
    await writeFile(result.skillPath, "foreign skill");
    await expect(installShelleySkill()).rejects.toThrow("unowned skill");
    expect((await uninstallShelleySkill()).removed).toBe(false);
  });

  it("uses the native home-relative directory even with an XDG override", async () => {
    expect((await installShelleySkill()).skillPath)
      .toBe(join(home, ".config", "shelley", "tokenjuice", "SKILL.md"));
    expect((await installShelleySkill({ homeDir: join(home, "explicit") })).skillPath)
      .toBe(join(home, "explicit", ".config", "shelley", "tokenjuice", "SKILL.md"));
  });

  it("registers install, doctor and uninstall JSON CLI routes", async () => {
    const results = [];
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
      expect(await main([operation, "shelley", "--format", "json"])).toBe(0);
      spy.mockRestore();
      const result = JSON.parse(output);
      expect(result.skillPath).toBe(join(home, ".config", "shelley", "tokenjuice", "SKILL.md"));
      results.push(result);
    }
    expect(results[1].status).toBe("ok");
    expect(results[2].removed).toBe(true);
  });
});
