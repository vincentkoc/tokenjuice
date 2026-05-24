import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorCrushSkill,
  doctorInstalledHooks,
  installCrushSkill,
  uninstallCrushSkill,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "AMP_PROJECT_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEX_HOME",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CRUSH_PROJECT_DIR",
  "CURSOR_HOME",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GROK_HOME",
  "HOME",
  "OPENCODE_CONFIG_DIR",
  "PI_CODING_AGENT_DIR",
  "QWEN_PROJECT_DIR",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(async () => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-crush-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("crush skill", () => {
  it("installs a project skill with the tokenjuice escape hatch", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".crush", "skills", "tokenjuice", "SKILL.md");

    const result = await installCrushSkill(undefined, { projectDir: home });
    const skill = await readFile(skillPath, "utf8");

    expect(result.skillPath).toBe(skillPath);
    expect(result.backupPath).toBeUndefined();
    expect(skill).toContain("name: tokenjuice");
    expect(skill).toContain("tokenjuice terminal output compaction");
    expect(skill).toContain("tokenjuice wrap -- <command>");
    expect(skill).toContain("tokenjuice wrap --raw -- <command>");
    expect(skill).toContain("guidance-only");
    expect(skill).toContain("cd`, `export`, `source");
    expect(skill).not.toContain("wrap --full");
  });

  it("backs up an existing skill before replacing it", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".crush", "skills", "tokenjuice", "SKILL.md");
    await installCrushSkill(undefined, { projectDir: home });
    await writeFile(skillPath, "custom skill\n", "utf8");

    const result = await installCrushSkill(undefined, { projectDir: home });

    expect(result.backupPath).toBe(`${skillPath}.bak`);
    await expect(readFile(`${skillPath}.bak`, "utf8")).resolves.toBe("custom skill\n");
    await expect(readFile(skillPath, "utf8")).resolves.toContain("tokenjuice wrap --raw -- <command>");
  });

  it("does not create a backup for idempotent reinstalls", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".crush", "skills", "tokenjuice", "SKILL.md");

    await installCrushSkill(undefined, { projectDir: home });
    const result = await installCrushSkill(undefined, { projectDir: home });

    expect(result.backupPath).toBeUndefined();
    await expect(access(`${skillPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("backs up edited tokenjuice skill content before reinstalling", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".crush", "skills", "tokenjuice", "SKILL.md");
    await installCrushSkill(undefined, { projectDir: home });
    await writeFile(skillPath, "# tokenjuice terminal output compaction\n\ncustom tokenjuice edit\n", "utf8");

    const result = await installCrushSkill(undefined, { projectDir: home });

    expect(result.backupPath).toBe(`${skillPath}.bak`);
    await expect(readFile(`${skillPath}.bak`, "utf8")).resolves.toContain("custom tokenjuice edit");
    await expect(readFile(skillPath, "utf8")).resolves.toContain("tokenjuice wrap --raw -- <command>");
  });

  it("does not restore tokenjuice guidance with an edited marker on uninstall", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".crush", "skills", "tokenjuice", "SKILL.md");
    await installCrushSkill(undefined, { projectDir: home });
    await writeFile(skillPath, "---\nname: tokenjuice\n---\n\nuse `tokenjuice wrap -- <command>`\n", "utf8");
    await installCrushSkill(undefined, { projectDir: home });

    const removed = await uninstallCrushSkill(skillPath);

    expect(removed.removed).toBe(true);
    await expect(access(skillPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${skillPath}.bak`, "utf8")).resolves.toContain("tokenjuice wrap -- <command>");
  });

  it("restores a backed-up custom skill on uninstall", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".crush", "skills", "tokenjuice", "SKILL.md");
    await installCrushSkill(undefined, { projectDir: home });
    await writeFile(skillPath, "custom skill\n", "utf8");
    await installCrushSkill(undefined, { projectDir: home });
    await installCrushSkill(undefined, { projectDir: home });

    const removed = await uninstallCrushSkill(skillPath);

    expect(removed.removed).toBe(true);
    await expect(readFile(skillPath, "utf8")).resolves.toBe("custom skill\n");
    await expect(access(`${skillPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports installed and uninstalled skill health", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".crush", "skills", "tokenjuice", "SKILL.md");

    await installCrushSkill(undefined, { projectDir: home });
    const installed = await doctorCrushSkill(undefined, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.skillPath).toBe(skillPath);
    expect(installed.advisories[0]).toContain("skill-based");

    const removed = await uninstallCrushSkill(skillPath);
    const disabled = await doctorCrushSkill(undefined, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken skills when tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".crush", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".crush", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        "name: tokenjuice",
        "---",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- For noisy commands, use `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorCrushSkill(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Crush skill is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Crush skill still suggests the full escape hatch");
  });

  it("treats custom skills at the tokenjuice path as disabled", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".crush", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".crush", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, "---\nname: tokenjuice\n---\n\ncustom skill\n", "utf8");

    const doctor = await doctorCrushSkill(undefined, { projectDir: home });

    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("tokenjuice Crush skill is not installed");
  });

  it("does not remove an existing skill file without tokenjuice content", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".crush", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".crush", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, "---\nname: tokenjuice\n---\n\ncustom skill\n", "utf8");

    const removed = await uninstallCrushSkill(skillPath);

    expect(removed.removed).toBe(false);
    await expect(readFile(skillPath, "utf8")).resolves.toContain("custom skill");
  });

  it("uses CRUSH_PROJECT_DIR for the default skill file", async () => {
    const home = await createTempDir();
    process.env.CRUSH_PROJECT_DIR = home;

    const installed = await installCrushSkill();
    const expectedSkillPath = join(home, ".crush", "skills", "tokenjuice", "SKILL.md");
    const doctor = await doctorCrushSkill();

    expect(installed.skillPath).toBe(expectedSkillPath);
    expect(doctor.skillPath).toBe(expectedSkillPath);
    expect(doctor.status).toBe("ok");
  });

  it("passes projectDir through aggregate hook doctor", async () => {
    const home = await createTempDir();
    const configHome = join(home, "home");
    await installCrushSkill(undefined, { projectDir: home });
    process.env.HOME = configHome;
    process.env.FACTORY_HOME = join(configHome, ".factory");
    process.env.CODEX_HOME = join(configHome, ".codex");
    process.env.CLAUDE_CONFIG_DIR = join(configHome, ".claude");
    process.env.CODEBUDDY_CONFIG_DIR = join(configHome, ".codebuddy");
    process.env.CURSOR_HOME = join(configHome, ".cursor");
    process.env.GEMINI_HOME = join(configHome, ".gemini");
    process.env.GROK_HOME = join(configHome, ".grok");
    process.env.COPILOT_HOME = join(configHome, ".copilot");
    process.env.PI_CODING_AGENT_DIR = join(configHome, ".pi", "agent");
    process.env.OPENCODE_CONFIG_DIR = join(configHome, ".config", "opencode");
    process.env.AMP_PROJECT_DIR = join(configHome, "amp-project");
    process.env.QWEN_PROJECT_DIR = join(configHome, "qwen-project");

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.crush.status).toBe("ok");
    expect(report.integrations.crush.skillPath).toBe(join(home, ".crush", "skills", "tokenjuice", "SKILL.md"));
  });
});
