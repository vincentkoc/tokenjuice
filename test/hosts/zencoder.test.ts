import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorInstalledHooks, doctorZencoderRule, installZencoderRule, uninstallZencoderRule } from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "BOB_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEBUFF_PROJECT_DIR",
  "CODEX_HOME",
  "CONTINUE_PROJECT_DIR",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CURSOR_HOME",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GROK_BUILD_PROJECT_DIR",
  "GPTME_PROJECT_DIR",
  "HOME",
  "JETBRAINS_AI_PROJECT_DIR",
  "JULES_PROJECT_DIR",
  "JUNIE_PROJECT_DIR",
  "KILO_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KIRO_PROJECT_DIR",
  "MISTRAL_VIBE_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPENWEBUI_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "PLANDEX_PROJECT_DIR",
  "QODER_PROJECT_DIR",
  "QWEN_PROJECT_DIR",
  "REPLIT_PROJECT_DIR",
  "ROO_PROJECT_DIR",
  "ROVO_DEV_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "TABNINE_PROJECT_DIR",
  "TRAE_PROJECT_DIR",
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
  "ZENCODER_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-zencoder-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("Zencoder rules", () => {
  it("installs an always-applied Zen Rule", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");

    const result = await installZencoderRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain('description: "Use tokenjuice for noisy terminal output"');
    expect(rule).toContain("alwaysApply: true");
    expect(rule).toContain("<!-- tokenjuice:zencoder-rule -->");
    expect(rule).not.toContain("<!-- tokenjuice:zencoder-restore-backup=");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).toContain("terminal commands through Zencoder");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up an existing rule file before replacing it", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");
    await installZencoderRule(rulePath);
    await writeFile(rulePath, "# local Zencoder rule\n\n- keep this\n", "utf8");

    const result = await installZencoderRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(rule).toContain("<!-- tokenjuice:zencoder-restore-backup=.bak -->");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).not.toContain("keep this");
  });

  it("does not overwrite an existing user backup on first install", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");
    await mkdir(join(home, ".zencoder", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");
    await writeFile(`${rulePath}.bak`, "# existing user backup\n", "utf8");

    const result = await installZencoderRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.tokenjuice.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("existing user backup");
    await expect(readFile(`${rulePath}.tokenjuice.bak`, "utf8")).resolves.toContain("custom local rule");
    expect(rule).toContain("<!-- tokenjuice:zencoder-restore-backup=.tokenjuice.bak -->");
  });

  it("reinstalls tokenjuice-managed Zen Rules idempotently", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");

    await installZencoderRule(rulePath);
    const result = await installZencoderRule(rulePath);

    expect(result.backupPath).toBeUndefined();
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");

    await installZencoderRule(rulePath);
    const installed = await doctorZencoderRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallZencoderRule(rulePath);
    const disabled = await doctorZencoderRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules missing tokenjuice guidance", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");
    await mkdir(join(home, ".zencoder", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        'description: "Tokenjuice guidance"',
        "alwaysApply: false",
        "---",
        "",
        "<!-- tokenjuice:zencoder-rule -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorZencoderRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Zencoder rule file is missing alwaysApply frontmatter");
    expect(doctor.issues).toContain("configured Zencoder rule file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Zencoder rule file still suggests the full escape hatch");
  });

  it("reports broken rules with alwaysApply text outside frontmatter", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");
    await mkdir(join(home, ".zencoder", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        'description: "Tokenjuice guidance"',
        "alwaysApply: false",
        "---",
        "",
        "<!-- tokenjuice:zencoder-rule -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "alwaysApply: true",
        "",
        "- tokenjuice wrap -- <command>",
        "- tokenjuice wrap --raw -- <command>",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorZencoderRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Zencoder rule file is missing alwaysApply frontmatter");
  });

  it("reports broken rules missing description frontmatter", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");
    await mkdir(join(home, ".zencoder", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "alwaysApply: true",
        "---",
        "",
        "<!-- tokenjuice:zencoder-rule -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- tokenjuice wrap -- <command>",
        "- tokenjuice wrap --raw -- <command>",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorZencoderRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Zencoder rule file is missing description frontmatter");
  });

  it("accepts CRLF alwaysApply frontmatter", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");
    await mkdir(join(home, ".zencoder", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        'description: "Use tokenjuice for noisy terminal output"',
        "alwaysApply: true",
        "---",
        "",
        "<!-- tokenjuice:zencoder-rule -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- tokenjuice wrap -- <command>",
        "- tokenjuice wrap --raw -- <command>",
      ].join("\r\n"),
      "utf8",
    );

    const doctor = await doctorZencoderRule(rulePath);

    expect(doctor.status).toBe("ok");
  });

  it("refuses to remove an existing rule file without tokenjuice ownership", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");
    await mkdir(join(home, ".zencoder", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");

    await expect(uninstallZencoderRule(rulePath)).rejects.toThrow("does not look like the tokenjuice Zencoder rule");
    await expect(readFile(rulePath, "utf8")).resolves.toContain("custom local rule");
  });

  it("restores the pre-tokenjuice rule backup on uninstall", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");
    await mkdir(join(home, ".zencoder", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");
    await installZencoderRule(rulePath);
    await expect(readFile(rulePath, "utf8")).resolves.toContain("<!-- tokenjuice:zencoder-restore-backup=.bak -->");

    const removed = await uninstallZencoderRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(readFile(rulePath, "utf8")).resolves.toContain("custom local rule");
  });

  it("does not restore a stale backup tokenjuice did not create", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".zencoder", "rules", "tokenjuice.md");
    await mkdir(join(home, ".zencoder", "rules"), { recursive: true });
    await writeFile(`${rulePath}.bak`, "# stale local rule\n", "utf8");
    await installZencoderRule(rulePath);

    const removed = await uninstallZencoderRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("stale local rule");
  });

  it("uses ZENCODER_PROJECT_DIR for the default rule file", async () => {
    const home = await createTempDir();
    process.env.ZENCODER_PROJECT_DIR = home;

    const installed = await installZencoderRule();
    const expectedRulePath = join(home, ".zencoder", "rules", "tokenjuice.md");
    const doctor = await doctorZencoderRule();

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

    const installed = await installZencoderRule();
    const expectedRulePath = join(await realpath(repo), ".zencoder", "rules", "tokenjuice.md");
    const doctor = await doctorZencoderRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
    await expect(access(join(nestedDir, ".zencoder", "rules", "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports zencoder in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installZencoderRule(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.zencoder.rulePath).toBe(join(home, ".zencoder", "rules", "tokenjuice.md"));
    expect(report.integrations.zencoder.status).toBe("ok");
  });
});
