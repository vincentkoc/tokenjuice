import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorJetBrainsAiRule,
  installJetBrainsAiRule,
  uninstallJetBrainsAiRule,
} from "../../src/index.js";

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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-jetbrains-ai-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("JetBrains AI Assistant rules", () => {
  it("installs a project rules markdown file", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");

    const result = await installJetBrainsAiRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("<!-- tokenjuice:jetbrains-ai-rule -->");
    expect(rule).not.toContain("<!-- tokenjuice:jetbrains-ai-restore-backup=");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).toContain("JetBrains AI Assistant chat");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up an existing rule file before replacing it", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");
    await installJetBrainsAiRule(rulePath);
    await writeFile(rulePath, "# local JetBrains AI Assistant rule\n\n- keep this\n", "utf8");

    const result = await installJetBrainsAiRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(rule).toContain("<!-- tokenjuice:jetbrains-ai-restore-backup=.bak -->");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).not.toContain("keep this");
  });

  it("reinstalls tokenjuice-managed rule files idempotently", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");

    await installJetBrainsAiRule(rulePath);
    const result = await installJetBrainsAiRule(rulePath);

    expect(result.backupPath).toBeUndefined();
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");

    await installJetBrainsAiRule(rulePath);
    const installed = await doctorJetBrainsAiRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallJetBrainsAiRule(rulePath);
    const disabled = await doctorJetBrainsAiRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules missing tokenjuice guidance", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");
    await mkdir(join(home, ".aiassistant", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "<!-- tokenjuice:jetbrains-ai-rule -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorJetBrainsAiRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured JetBrains AI Assistant rule file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured JetBrains AI Assistant rule file still suggests the full escape hatch");
  });

  it("refuses to remove an existing rule file without tokenjuice ownership", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");
    await mkdir(join(home, ".aiassistant", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");

    await expect(uninstallJetBrainsAiRule(rulePath)).rejects.toThrow("does not look like the tokenjuice JetBrains AI Assistant rule");
    await expect(readFile(rulePath, "utf8")).resolves.toContain("custom local rule");
  });

  it("restores the pre-tokenjuice rule backup on uninstall", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");
    await mkdir(join(home, ".aiassistant", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");
    await installJetBrainsAiRule(rulePath);
    await expect(readFile(rulePath, "utf8")).resolves.toContain("<!-- tokenjuice:jetbrains-ai-restore-backup=.bak -->");

    const removed = await uninstallJetBrainsAiRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(readFile(rulePath, "utf8")).resolves.toContain("custom local rule");
  });

  it("restores legacy pre-tokenjuice backups on uninstall", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");
    await mkdir(join(home, ".aiassistant", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "<!-- tokenjuice:jetbrains-ai-rule -->",
        "<!-- tokenjuice:jetbrains-ai-restore-backup -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- When running terminal commands from JetBrains AI Assistant chat, prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` when exact output is required.",
      ].join("\n"),
      "utf8",
    );
    await writeFile(`${rulePath}.bak`, "# legacy custom rule\n", "utf8");

    const removed = await uninstallJetBrainsAiRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(readFile(rulePath, "utf8")).resolves.toContain("legacy custom rule");
  });

  it("does not restore a stale backup tokenjuice did not create", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");
    await mkdir(join(home, ".aiassistant", "rules"), { recursive: true });
    await writeFile(`${rulePath}.bak`, "# stale local rule\n", "utf8");
    await installJetBrainsAiRule(rulePath);

    const removed = await uninstallJetBrainsAiRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("stale local rule");
  });

  it("does not overwrite an existing user backup when preserving a rule file", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");
    await mkdir(join(home, ".aiassistant", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");
    await writeFile(`${rulePath}.bak`, "# user backup\n", "utf8");

    const result = await installJetBrainsAiRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.tokenjuice.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("user backup");
    await expect(readFile(`${rulePath}.tokenjuice.bak`, "utf8")).resolves.toContain("custom local rule");
    expect(rule).toContain("<!-- tokenjuice:jetbrains-ai-restore-backup=.tokenjuice.bak -->");

    const removed = await uninstallJetBrainsAiRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(readFile(rulePath, "utf8")).resolves.toContain("custom local rule");
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("user backup");
    await expect(access(`${rulePath}.tokenjuice.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("upgrades legacy restore markers without clobbering their backups", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");
    await mkdir(join(home, ".aiassistant", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "<!-- tokenjuice:jetbrains-ai-rule -->",
        "<!-- tokenjuice:jetbrains-ai-restore-backup -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- old generated guidance",
      ].join("\n"),
      "utf8",
    );
    await writeFile(`${rulePath}.bak`, "# legacy custom rule\n", "utf8");

    const result = await installJetBrainsAiRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.tokenjuice.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("legacy custom rule");
    await expect(readFile(`${rulePath}.tokenjuice.bak`, "utf8")).resolves.toContain("old generated guidance");
    expect(rule).toContain("<!-- tokenjuice:jetbrains-ai-restore-backup=.bak -->");
    expect(rule).not.toContain("<!-- tokenjuice:jetbrains-ai-restore-backup -->");
  });

  it("uses JETBRAINS_AI_PROJECT_DIR for the default rule file", async () => {
    const home = await createTempDir();
    process.env.JETBRAINS_AI_PROJECT_DIR = home;

    const installed = await installJetBrainsAiRule();
    const expectedRulePath = join(home, ".aiassistant", "rules", "tokenjuice.md");
    const doctor = await doctorJetBrainsAiRule();

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

    const installed = await installJetBrainsAiRule();
    const expectedRulePath = join(await realpath(repo), ".aiassistant", "rules", "tokenjuice.md");
    const doctor = await doctorJetBrainsAiRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
    await expect(access(join(nestedDir, ".aiassistant", "rules", "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installJetBrainsAiRule(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["jetbrains-ai"].rulePath).toBe(join(home, ".aiassistant", "rules", "tokenjuice.md"));
    expect(report.integrations["jetbrains-ai"].status).toBe("ok");
  });
});
