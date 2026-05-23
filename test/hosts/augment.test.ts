import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorAugmentRule, doctorInstalledHooks, installAugmentRule, uninstallAugmentRule } from "../../src/index.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
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
  "OPEN_INTERPRETER_PROJECT_DIR",
  "OPENWEBUI_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "PLANDEX_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-augment-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("augment rules", () => {
  it("installs an always-applied workspace rule", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");

    const result = await installAugmentRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("type: always_apply");
    expect(rule).toContain("<!-- tokenjuice:augment-rule -->");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).toContain("terminal commands through Augment or Auggie");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up an existing rule file before replacing it", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");
    await installAugmentRule(rulePath);
    await writeFile(rulePath, "# local Augment rule\n\n- keep this\n", "utf8");

    const result = await installAugmentRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).not.toContain("keep this");
  });

  it("restores a backed-up custom rule on uninstall", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");
    await mkdir(join(home, ".augment", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");
    await installAugmentRule(rulePath);

    const removed = await uninstallAugmentRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(readFile(rulePath, "utf8")).resolves.toBe("# custom local rule\n");
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves a custom backup when repairing tokenjuice-owned rules", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");
    await mkdir(join(home, ".augment", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");
    await installAugmentRule(rulePath);
    await writeFile(
      rulePath,
      [
        "---",
        "type: agent_requested",
        "---",
        "",
        "<!-- tokenjuice:augment-rule -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const repaired = await installAugmentRule(rulePath);

    expect(repaired.backupPath).toBe(`${rulePath}.tokenjuice.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("# custom local rule\n");
    await expect(readFile(`${rulePath}.tokenjuice.bak`, "utf8")).resolves.toContain("wrap --full");
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");

    await installAugmentRule(rulePath);
    const installed = await doctorAugmentRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallAugmentRule(rulePath);
    const disabled = await doctorAugmentRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules missing tokenjuice guidance", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");
    await mkdir(join(home, ".augment", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "type: agent_requested",
        "---",
        "",
        "<!-- tokenjuice:augment-rule -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAugmentRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Augment rule file is missing always_apply frontmatter");
    expect(doctor.issues).toContain("configured Augment rule file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Augment rule file still suggests the full escape hatch");
  });

  it("treats unowned rule files as disabled", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");
    await mkdir(join(home, ".augment", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");

    const doctor = await doctorAugmentRule(rulePath);

    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("tokenjuice Augment rule is not installed; existing rule file is not tokenjuice-managed");
  });

  it("refuses to remove a non-tokenjuice rule file", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");
    await mkdir(join(home, ".augment", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");

    await expect(uninstallAugmentRule(rulePath)).rejects.toThrow(
      "does not look like the tokenjuice Augment rule",
    );

    await expect(readFile(rulePath, "utf8")).resolves.toBe("# custom local rule\n");
  });

  it("does not claim custom rules that mention tokenjuice commands", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");
    await mkdir(join(home, ".augment", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom note\n\n- use tokenjuice wrap -- <command>\n", "utf8");

    const doctor = await doctorAugmentRule(rulePath);

    expect(doctor.status).toBe("disabled");
    await expect(uninstallAugmentRule(rulePath)).rejects.toThrow(
      "does not look like the tokenjuice Augment rule",
    );
    await expect(readFile(rulePath, "utf8")).resolves.toContain("custom note");
  });

  it("does not claim custom rules that use the tokenjuice heading", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");
    await mkdir(join(home, ".augment", "rules"), { recursive: true });
    await writeFile(rulePath, "# tokenjuice terminal output compaction\n\n- custom rule\n", "utf8");

    const doctor = await doctorAugmentRule(rulePath);

    expect(doctor.status).toBe("disabled");
    await expect(uninstallAugmentRule(rulePath)).rejects.toThrow(
      "does not look like the tokenjuice Augment rule",
    );
    await expect(readFile(rulePath, "utf8")).resolves.toContain("custom rule");
  });

  it("uses AUGMENT_PROJECT_DIR for the default rule file", async () => {
    const home = await createTempDir();
    process.env.AUGMENT_PROJECT_DIR = home;

    const installed = await installAugmentRule();
    const expectedRulePath = join(home, ".augment", "rules", "tokenjuice.md");
    const doctor = await doctorAugmentRule();

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
    await installAugmentRule(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.augment.status).toBe("ok");
    expect(report.integrations.augment.rulePath).toBe(join(home, ".augment", "rules", "tokenjuice.md"));
  });

  it("uses the nearest git root for the default rule file", async () => {
    const repo = await createTempDir();
    const nestedDir = join(repo, "src", "nested");
    await mkdir(join(repo, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installAugmentRule();
    const expectedRulePath = join(await realpath(repo), ".augment", "rules", "tokenjuice.md");
    const doctor = await doctorAugmentRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
    await expect(access(join(nestedDir, ".augment", "rules", "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the default rule file when uninstalling", async () => {
    const home = await createTempDir();
    process.env.AUGMENT_PROJECT_DIR = home;
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");

    await installAugmentRule();
    await uninstallAugmentRule();

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses projectDir when uninstalling the default rule file", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".augment", "rules", "tokenjuice.md");

    await installAugmentRule(undefined, { projectDir: home });
    const removed = await uninstallAugmentRule(undefined, { projectDir: home });

    expect(removed.rulePath).toBe(rulePath);
    expect(removed.removed).toBe(true);
    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
