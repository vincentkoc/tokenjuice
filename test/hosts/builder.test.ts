import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorBuilderRule, doctorInstalledHooks, installBuilderRule, uninstallBuilderRule } from "../../src/index.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
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
  "JULES_PROJECT_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
  "OPENWEBUI_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "PLANDEX_PROJECT_DIR",
  "QWEN_PROJECT_DIR",
  "REPLIT_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-builder-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("builder rules", () => {
  it("installs a Builder workspace rule", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".builder", "rules", "tokenjuice.mdc");

    const result = await installBuilderRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("description: tokenjuice terminal output compaction");
    expect(rule).toContain("globs:");
    expect(rule).toContain("alwaysApply: true");
    expect(rule).toContain("<!-- tokenjuice:builder-rule -->");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).toContain("terminal commands through Builder Projects or Fusion");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up an existing rule file before replacing it", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".builder", "rules", "tokenjuice.mdc");
    await installBuilderRule(rulePath);
    await writeFile(rulePath, "# local Builder rule\n\n- keep this\n", "utf8");

    const result = await installBuilderRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).not.toContain("keep this");
  });

  it("restores a backed-up custom rule on uninstall", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".builder", "rules", "tokenjuice.mdc");
    await mkdir(join(home, ".builder", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");
    await installBuilderRule(rulePath);

    const removed = await uninstallBuilderRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(readFile(rulePath, "utf8")).resolves.toBe("# custom local rule\n");
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves a custom backup when repairing tokenjuice-owned rules", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".builder", "rules", "tokenjuice.mdc");
    await mkdir(join(home, ".builder", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");
    await installBuilderRule(rulePath);
    await writeFile(
      rulePath,
      [
        "---",
        "description: tokenjuice terminal output compaction",
        "globs:",
        "alwaysApply: false",
        "---",
        "",
        "<!-- tokenjuice:builder-rule -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const repaired = await installBuilderRule(rulePath);

    expect(repaired.backupPath).toBe(`${rulePath}.tokenjuice.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("# custom local rule\n");
    await expect(readFile(`${rulePath}.tokenjuice.bak`, "utf8")).resolves.toContain("wrap --full");
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".builder", "rules", "tokenjuice.mdc");

    await installBuilderRule(rulePath);
    const installed = await doctorBuilderRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallBuilderRule(rulePath);
    const disabled = await doctorBuilderRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules missing tokenjuice guidance", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".builder", "rules", "tokenjuice.mdc");
    await mkdir(join(home, ".builder", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "description: tokenjuice terminal output compaction",
        "globs:",
        "alwaysApply: false",
        "---",
        "",
        "<!-- tokenjuice:builder-rule -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorBuilderRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Builder rule file is missing alwaysApply metadata");
    expect(doctor.issues).toContain("configured Builder rule file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Builder rule file still suggests the full escape hatch");
  });

  it("treats unowned rule files as disabled", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".builder", "rules", "tokenjuice.mdc");
    await mkdir(join(home, ".builder", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");

    const doctor = await doctorBuilderRule(rulePath);

    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("tokenjuice Builder rule is not installed; existing rule file is not tokenjuice-managed");
  });

  it("refuses to remove a non-tokenjuice rule file", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".builder", "rules", "tokenjuice.mdc");
    await mkdir(join(home, ".builder", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");

    await expect(uninstallBuilderRule(rulePath)).rejects.toThrow(
      "does not look like the tokenjuice Builder rule",
    );

    await expect(readFile(rulePath, "utf8")).resolves.toBe("# custom local rule\n");
  });

  it("uses BUILDER_PROJECT_DIR for the default rule file", async () => {
    const home = await createTempDir();
    process.env.BUILDER_PROJECT_DIR = home;

    const installed = await installBuilderRule();
    const expectedRulePath = join(home, ".builder", "rules", "tokenjuice.mdc");
    const doctor = await doctorBuilderRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("uses the nearest git root for the default rule file", async () => {
    const repo = await createTempDir();
    const nestedDir = join(repo, "src", "nested");
    await mkdir(join(repo, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installBuilderRule();
    const expectedRulePath = join(await realpath(repo), ".builder", "rules", "tokenjuice.mdc");
    const doctor = await doctorBuilderRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
    await expect(access(join(nestedDir, ".builder", "rules", "tokenjuice.mdc"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the default rule file when uninstalling", async () => {
    const home = await createTempDir();
    process.env.BUILDER_PROJECT_DIR = home;
    const rulePath = join(home, ".builder", "rules", "tokenjuice.mdc");

    await installBuilderRule();
    await uninstallBuilderRule();

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installBuilderRule(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.builder.rulePath).toBe(join(home, ".builder", "rules", "tokenjuice.mdc"));
    expect(report.integrations.builder.status).toBe("ok");
  });
});
