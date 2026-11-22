import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctorQoderWorkSkill, installQoderWorkSkill, uninstallQoderWorkSkill } from "../../src/hosts/qoderwork/index.js";
import { main } from "../../src/cli/main.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "tokenjuice-qoderwork-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

describe("QoderWork guidance skill", () => {
  it("uses the documented user discovery path and preserves foreign content", async () => {
    const result = await installQoderWorkSkill();
    expect(result.skillPath).toBe(join(home, ".qoderwork", "skills", "tokenjuice", "SKILL.md"));
    expect(await readFile(result.skillPath, "utf8")).toContain("tokenjuice:qoderwork skill");
    expect((await doctorQoderWorkSkill()).status).toBe("ok");
    expect((await uninstallQoderWorkSkill()).removed).toBe(true);
    expect((await doctorQoderWorkSkill()).status).toBe("disabled");
    await writeFile(result.skillPath, "foreign skill");
    await expect(installQoderWorkSkill()).rejects.toThrow("unowned skill");
    expect((await uninstallQoderWorkSkill()).removed).toBe(false);
  });

  it("registers install, doctor and uninstall JSON CLI routes", async () => {
    const results = [];
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
      expect(await main([operation, "qoderwork", "--format", "json"])).toBe(0);
      spy.mockRestore();
      const result = JSON.parse(output);
      expect(result.skillPath).toBe(join(home, ".qoderwork", "skills", "tokenjuice", "SKILL.md"));
      results.push(result);
    }
    expect(results[1].status).toBe("ok");
    expect(results[2].removed).toBe(true);
  });
});
