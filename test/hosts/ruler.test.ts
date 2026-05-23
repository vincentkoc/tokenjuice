import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorRulerRule,
  installRulerRule,
  uninstallRulerRule,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEX_HOME",
  "CONTINUE_PROJECT_DIR",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CRUSH_PROJECT_DIR",
  "CURSOR_HOME",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GOOSE_PROJECT_DIR",
  "GROK_HOME",
  "HOME",
  "JUNIE_PROJECT_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "QWEN_PROJECT_DIR",
  "ROO_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(async () => {
  process.chdir(originalCwd);
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-ruler-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("ruler rule", () => {
  it("installs a Ruler source rule with the tokenjuice escape hatch", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".ruler", "tokenjuice.md");

    const result = await installRulerRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("# tokenjuice terminal output compaction");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).toContain("ruler apply");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up an existing source rule before replacing it", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".ruler", "tokenjuice.md");
    await installRulerRule(rulePath);
    await writeFile(rulePath, "custom local rule\n", "utf8");

    const result = await installRulerRule(rulePath);

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("custom local rule\n");
    await expect(readFile(rulePath, "utf8")).resolves.toContain("tokenjuice wrap --raw -- <command>");
  });

  it("does not create a backup for idempotent reinstalls", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".ruler", "tokenjuice.md");

    await installRulerRule(rulePath);
    const result = await installRulerRule(rulePath);

    expect(result.backupPath).toBeUndefined();
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores a backed-up custom source rule on uninstall", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".ruler", "tokenjuice.md");
    await installRulerRule(rulePath);
    await writeFile(rulePath, "custom local rule\n", "utf8");
    await installRulerRule(rulePath);
    await installRulerRule(rulePath);

    const removed = await uninstallRulerRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(readFile(rulePath, "utf8")).resolves.toBe("custom local rule\n");
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores custom source rules that mention tokenjuice commands", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".ruler", "tokenjuice.md");
    await installRulerRule(rulePath);
    await writeFile(rulePath, "custom source rule: use `tokenjuice wrap -- <command>` when useful\n", "utf8");
    await installRulerRule(rulePath);

    const removed = await uninstallRulerRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(readFile(rulePath, "utf8")).resolves.toContain("custom source rule");
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".ruler", "tokenjuice.md");

    await installRulerRule(rulePath);
    const installed = await doctorRulerRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");
    expect(installed.advisories[0]).toContain("ruler apply");

    const removed = await uninstallRulerRule(rulePath);
    const disabled = await doctorRulerRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".ruler", "tokenjuice.md");
    await mkdir(join(home, ".ruler"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorRulerRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Ruler rule file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Ruler rule file still suggests the full escape hatch");
  });

  it("treats custom source rule files as disabled and does not remove them", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".ruler", "tokenjuice.md");
    await mkdir(join(home, ".ruler"), { recursive: true });
    await writeFile(rulePath, "custom local rule\n", "utf8");

    const doctor = await doctorRulerRule(rulePath);
    const removed = await uninstallRulerRule(rulePath);

    expect(doctor.status).toBe("disabled");
    expect(removed.removed).toBe(false);
    await expect(readFile(rulePath, "utf8")).resolves.toBe("custom local rule\n");
  });

  it("uses RULER_PROJECT_DIR for the default source rule", async () => {
    const home = await createTempDir();
    process.env.RULER_PROJECT_DIR = home;

    const installed = await installRulerRule();
    const expectedRulePath = join(home, ".ruler", "tokenjuice.md");
    const doctor = await doctorRulerRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("passes projectDir through aggregate hook doctor", async () => {
    const home = await createTempDir();
    const configHome = join(home, "home");
    await mkdir(configHome, { recursive: true });
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
    process.env.CLINE_HOOKS_DIR = join(configHome, "Cline", "Hooks");
    await installRulerRule(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.ruler.status).toBe("ok");
    expect(report.integrations.ruler.rulePath).toBe(join(home, ".ruler", "tokenjuice.md"));
  });

  it("installs into the git root when run from a nested directory", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installRulerRule();
    const expectedRulePath = join(await realpath(home), ".ruler", "tokenjuice.md");

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(await readFile(join(home, ".ruler", "tokenjuice.md"), "utf8")).toContain("tokenjuice wrap -- <command>");
    await expect(access(join(nestedDir, ".ruler", "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the default source rule file", async () => {
    const home = await createTempDir();
    process.env.RULER_PROJECT_DIR = home;
    const rulePath = join(home, ".ruler", "tokenjuice.md");

    await installRulerRule();
    await uninstallRulerRule();

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses projectDir when uninstalling the default source rule file", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".ruler", "tokenjuice.md");

    await installRulerRule(undefined, { projectDir: home });
    const removed = await uninstallRulerRule(undefined, { projectDir: home });

    expect(removed.rulePath).toBe(rulePath);
    expect(removed.removed).toBe(true);
    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
