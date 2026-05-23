import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorTraeRule,
  installTraeRule,
  uninstallTraeRule,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEX_HOME",
  "CONTINUE_PROJECT_DIR",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CURSOR_HOME",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GROK_BUILD_PROJECT_DIR",
  "HOME",
  "JUNIE_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "PLANDEX_PROJECT_DIR",
  "QODER_PROJECT_DIR",
  "QWEN_PROJECT_DIR",
  "ROO_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "TRAE_PROJECT_DIR",
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalCwd = process.cwd();

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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-trae-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("trae rule", () => {
  it("installs a host-specific marker-delimited project_rules.md rule block", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".trae", "rules", "project_rules.md");

    const result = await installTraeRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("<!-- tokenjuice:trae begin -->");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).toContain("When running terminal commands through Trae");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("preserves existing Trae project rules when adding its block", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".trae", "rules", "project_rules.md");
    await mkdir(join(home, ".trae", "rules"), { recursive: true });
    await writeFile(rulePath, "# project rules\n\n- preserve this rule\n", "utf8");

    const result = await installTraeRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("preserve this rule");
    expect(rule).toContain("preserve this rule");
    expect(rule).toContain("<!-- tokenjuice:trae begin -->");
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".trae", "rules", "project_rules.md");

    await installTraeRule(rulePath);
    const installed = await doctorTraeRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallTraeRule(rulePath);
    const disabled = await doctorTraeRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken rules with unmatched Trae tokenjuice markers", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".trae", "rules", "project_rules.md");
    await mkdir(join(home, ".trae", "rules"), { recursive: true });
    await writeFile(rulePath, "<!-- tokenjuice:trae begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorTraeRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken rules with nested Trae tokenjuice markers", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".trae", "rules", "project_rules.md");
    await mkdir(join(home, ".trae", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "<!-- tokenjuice:trae begin -->",
        "<!-- tokenjuice:trae begin -->",
        "## tokenjuice terminal output compaction",
        "- When running terminal commands through Trae, prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` when compaction should be skipped.",
        "<!-- tokenjuice:trae end -->",
        "<!-- tokenjuice:trae end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorTraeRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Trae rule has malformed tokenjuice markers");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
    await expect(installTraeRule(rulePath)).rejects.toThrow("cannot safely repair malformed tokenjuice markers");
    await expect(uninstallTraeRule(rulePath)).rejects.toThrow("cannot safely uninstall malformed tokenjuice markers");
  });

  it("uses TRAE_PROJECT_DIR for the default project_rules.md path", async () => {
    const home = await createTempDir();
    process.env.TRAE_PROJECT_DIR = home;

    const installed = await installTraeRule();
    const expectedRulePath = join(home, ".trae", "rules", "project_rules.md");
    const doctor = await doctorTraeRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("defaults to the git root project_rules.md from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installTraeRule();
    const root = await realpath(home);

    expect(installed.rulePath).toBe(join(root, ".trae", "rules", "project_rules.md"));
    await expect(readFile(join(root, ".trae", "rules", "project_rules.md"), "utf8")).resolves.toContain("Trae");
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installTraeRule(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.trae.rulePath).toBe(join(home, ".trae", "rules", "project_rules.md"));
    expect(report.integrations.trae.status).toBe("ok");
  });
});
