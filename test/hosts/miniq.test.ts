import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctorMiniQSkill, installMiniQSkill, uninstallMiniQSkill } from "../../src/hosts/miniq/index.js";
import { main } from "../../src/cli/main.js";

let project: string;
const originalCwd = process.cwd();
beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "tokenjuice-miniq-"));
  process.chdir(project);
});
afterEach(async () => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(project, { recursive: true, force: true });
});

describe("miniQ workspace skill", () => {
  it("uses the native project path, preserves state and refuses foreign files", async () => {
    expect((await doctorMiniQSkill()).status).toBe("disabled");
    const result = await installMiniQSkill();
    expect(result.skillPath).toBe(join(process.cwd(), ".miniq", "skills", "tokenjuice", "SKILL.md"));
    const text = await readFile(result.skillPath, "utf8");
    expect(text).toContain("tokenjuice:miniq skill");
    expect(text).toContain("command -v tokenjuice");
    expect(text).toContain("tokenjuice wrap --raw -- <command>");
    const statePath = join(project, ".miniq", "skills-state.json");
    await writeFile(statePath, '{"disabled":["tokenjuice"]}');
    expect((await installMiniQSkill()).backupPath).toBeUndefined();
    expect((await doctorMiniQSkill()).status).toBe("ok");
    expect((await uninstallMiniQSkill()).removed).toBe(true);
    expect(await readFile(statePath, "utf8")).toBe('{"disabled":["tokenjuice"]}');
    await writeFile(result.skillPath, "foreign skill");
    await expect(installMiniQSkill()).rejects.toThrow("unowned skill");
    expect((await uninstallMiniQSkill()).removed).toBe(false);
  });

  it("supports an explicit workspace without changing cwd", async () => {
    const result = await installMiniQSkill({ projectDir: join(project, "other") });
    expect(result.skillPath).toBe(join(project, "other", ".miniq", "skills", "tokenjuice", "SKILL.md"));
    expect((await doctorMiniQSkill()).status).toBe("disabled");
  });

  it("checks the requested workspace through aggregate doctor", async () => {
    for (const key of Object.keys(process.env)) {
      if (key.endsWith("_HOME") || key.endsWith("_PROJECT_DIR") || key.endsWith("_CONFIG_DIR") || key.endsWith("_CODING_AGENT_DIR")) {
        vi.stubEnv(key, undefined);
      }
    }
    vi.stubEnv("HOME", project);
    vi.stubEnv("USERPROFILE", project);
    vi.resetModules();
    const { doctorInstalledHooks } = await import("../../src/hosts/shared/hook-doctor.js");
    const workspace = join(project, "other");
    const installed = await installMiniQSkill({ projectDir: workspace });
    const report = await doctorInstalledHooks({ projectDir: workspace, homeDir: project });
    expect(report.integrations.miniq.status).toBe("ok");
    expect(report.integrations.miniq.skillPath).toBe(installed.skillPath);
    expect((await doctorMiniQSkill()).status).toBe("disabled");
  });

  it("registers install, doctor and uninstall JSON CLI routes", async () => {
    const results = [];
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
      expect(await main([operation, "miniq", "--format", "json"])).toBe(0);
      spy.mockRestore();
      const result = JSON.parse(output);
      expect(result.skillPath).toBe(join(process.cwd(), ".miniq", "skills", "tokenjuice", "SKILL.md"));
      results.push(result);
    }
    expect(results[1].status).toBe("ok");
    expect(results[2].removed).toBe(true);
  });
});
