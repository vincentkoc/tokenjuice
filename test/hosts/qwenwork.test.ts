import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctorQwenWorkSkill, installQwenWorkSkill, uninstallQwenWorkSkill } from "../../src/hosts/qwenwork/index.js";
import { main } from "../../src/cli/main.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "tokenjuice-qwenwork-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

describe("QwenWork guidance skill", () => {
  it("uses the documented user discovery path and preserves foreign content", async () => {
    const result = await installQwenWorkSkill();
    expect(result.skillPath).toBe(join(home, ".qwenwork", "skills", "tokenjuice", "SKILL.md"));
    expect(await readFile(result.skillPath, "utf8")).toContain("tokenjuice:qwenwork skill");
    expect((await doctorQwenWorkSkill()).status).toBe("ok");
    expect((await uninstallQwenWorkSkill()).removed).toBe(true);
    expect((await doctorQwenWorkSkill()).status).toBe("disabled");
    await writeFile(result.skillPath, "foreign skill");
    await expect(installQwenWorkSkill()).rejects.toThrow("unowned skill");
    expect((await uninstallQwenWorkSkill()).removed).toBe(false);
  });

  it("registers install, doctor and uninstall JSON CLI routes", async () => {
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
      expect(await main([operation, "qwenwork", "--format", "json"])).toBe(0);
      spy.mockRestore();
      const result = JSON.parse(output);
      expect(result.skillPath).toBe(join(home, ".qwenwork", "skills", "tokenjuice", "SKILL.md"));
      if (operation === "doctor") expect(result.status).toBe("ok");
      if (operation === "uninstall") expect(result.removed).toBe(true);
    }
  });
});
