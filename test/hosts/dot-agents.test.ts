import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorDotAgentsRule,
  doctorInstalledHooks,
  installDotAgentsRule,
  uninstallDotAgentsRule,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "ADAL_PROJECT_DIR",
  "AGENTLINK_PROJECT_DIR",
  "AGENTLOOM_PROJECT_DIR",
  "AGENT_LAYER_PROJECT_DIR",
  "AGENTS_CLI_HOME",
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "ANYWHERE_AGENTS_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "BOB_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEBUFF_PROJECT_DIR",
  "CODEGEN_PROJECT_DIR",
  "CODEX_HOME",
  "CONTINUE_PROJECT_DIR",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CURSOR_HOME",
  "DEEPAGENTS_PROJECT_DIR",
  "DOT_AGENTS_HOME",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GITLAB_DUO_PROJECT_DIR",
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
  "MUX_PROJECT_DIR",
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
  "UIPATH_PROJECT_DIR",
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
  "ZENCODER_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-dot-agents-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("dot-agents rule", () => {
  it("installs a global dot-agents rules block with the tokenjuice escape hatch", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");

    const result = await installDotAgentsRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.syncCommand).toBe("dot-agents sync");
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("alwaysApply: true");
    expect(rule).toContain("<!-- tokenjuice:dot-agents begin -->");
    expect(rule).toContain("# tokenjuice terminal output compaction");
    expect(rule).toContain("dot-agents propagates this global rule");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).toContain("dot-agents sync");
    expect(rule).not.toContain("wrap --full");
  });

  it("preserves existing global rules and backs the file up", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");
    await mkdir(join(home, "rules", "global"), { recursive: true });
    await writeFile(rulePath, "custom local rule\n", "utf8");

    const result = await installDotAgentsRule(rulePath);

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("custom local rule\n");
    const rule = await readFile(rulePath, "utf8");
    expect(rule).toContain("custom local rule");
    expect(rule).not.toContain("alwaysApply: true");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
  });

  it("does not rewrite or back up an already current global rule", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");

    await installDotAgentsRule(rulePath);
    const before = await readFile(rulePath, "utf8");
    const result = await installDotAgentsRule(rulePath);
    const after = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBeUndefined();
    expect(after).toBe(before);
    await expect(readFile(`${rulePath}.bak`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves existing MDC frontmatter applicability", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");
    await mkdir(join(home, "rules", "global"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "description: shared dot-agents rules",
        "alwaysApply: false",
        "---",
        "",
        "# Existing global rules",
      ].join("\n"),
      "utf8",
    );

    await installDotAgentsRule(rulePath);
    const rule = await readFile(rulePath, "utf8");
    const doctor = await doctorDotAgentsRule(rulePath);

    expect(rule.match(/^---$/gmu)).toHaveLength(2);
    expect(rule).toContain("description: shared dot-agents rules");
    expect(rule).toContain("alwaysApply: false");
    expect(rule).toContain("# Existing global rules");
    expect(doctor.status).toBe("ok");
  });

  it("does not use body text as frontmatter metadata", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");
    await mkdir(join(home, "rules", "global"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "description: shared dot-agents rules",
        "---",
        "",
        "This body text mentions alwaysApply: true but is not frontmatter.",
        "---",
        "",
        "# Existing global rules",
      ].join("\n"),
      "utf8",
    );

    await installDotAgentsRule(rulePath);
    const rule = await readFile(rulePath, "utf8");
    const doctor = await doctorDotAgentsRule(rulePath);

    expect(rule).toMatch(/^---\ndescription: shared dot-agents rules\n---/u);
    expect(rule).toContain("This body text mentions alwaysApply: true but is not frontmatter.");
    expect(doctor.status).toBe("ok");
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");

    await installDotAgentsRule(rulePath);
    const installed = await doctorDotAgentsRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.syncCommand).toBe("dot-agents sync");
    expect(installed.advisories[0]).toContain("rule-based");
    expect(installed.advisories[0]).toContain("dot-agents sync");

    const removed = await uninstallDotAgentsRule(rulePath);
    const disabled = await doctorDotAgentsRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(removed.syncCommand).toBe("dot-agents sync");
    expect(disabled.status).toBe("disabled");
    expect(disabled.syncCommand).toBe("dot-agents sync");
  });

  it("backs up preserved user rules when uninstall removes tokenjuice guidance", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");
    await mkdir(join(home, "rules", "global"), { recursive: true });
    await writeFile(rulePath, "# user rule\n", "utf8");

    await installDotAgentsRule(rulePath);
    const installed = await readFile(rulePath, "utf8");
    const removed = await uninstallDotAgentsRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(readFile(`${rulePath}.bak.1`, "utf8")).resolves.toBe(installed);
    await expect(readFile(rulePath, "utf8")).resolves.toBe("# user rule\n");
  });

  it("preserves pre-existing frontmatter-only user rules on uninstall", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");
    await mkdir(join(home, "rules", "global"), { recursive: true });
    await writeFile(rulePath, "---\nalwaysApply: true\n---\n", "utf8");

    await installDotAgentsRule(rulePath);
    const removed = await uninstallDotAgentsRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(readFile(rulePath, "utf8")).resolves.toBe("---\nalwaysApply: true\n---\n");
  });

  it("reports broken rules with nested tokenjuice markers", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");
    await mkdir(join(home, "rules", "global"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "alwaysApply: true",
        "---",
        "",
        "<!-- tokenjuice:dot-agents begin -->",
        "outer guidance",
        "<!-- tokenjuice:dot-agents begin -->",
        "inner guidance",
        "<!-- tokenjuice:dot-agents end -->",
        "<!-- tokenjuice:dot-agents end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorDotAgentsRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain(
      "configured dot-agents global rules have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install dot-agents",
    );
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("refuses to install or uninstall malformed nested tokenjuice markers", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");
    await mkdir(join(home, "rules", "global"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "alwaysApply: true",
        "---",
        "",
        "<!-- tokenjuice:dot-agents begin -->",
        "outer guidance",
        "<!-- tokenjuice:dot-agents begin -->",
        "inner guidance",
        "<!-- tokenjuice:dot-agents end -->",
        "<!-- tokenjuice:dot-agents end -->",
      ].join("\n"),
      "utf8",
    );

    await expect(installDotAgentsRule(rulePath)).rejects.toThrow(/cannot safely repair malformed tokenjuice markers/u);
    await expect(uninstallDotAgentsRule(rulePath)).rejects.toThrow(/cannot safely uninstall malformed tokenjuice markers/u);
  });

  it("reports broken rules when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");
    await mkdir(join(home, "rules", "global"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "alwaysApply: true",
        "---",
        "",
        "<!-- tokenjuice:dot-agents begin -->",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
        "<!-- tokenjuice:dot-agents end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorDotAgentsRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured dot-agents rule file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured dot-agents rule file is missing sync guidance");
    expect(doctor.issues).toContain("configured dot-agents rule file still suggests the full escape hatch");
  });

  it("reports ok when user frontmatter is absent but tokenjuice guidance is current", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");
    await installDotAgentsRule(rulePath);
    const rule = await readFile(rulePath, "utf8");
    await writeFile(rulePath, rule.replace("---\nalwaysApply: true\n---\n\n", ""), "utf8");

    const doctor = await doctorDotAgentsRule(rulePath);

    expect(doctor.status).toBe("ok");
  });

  it("leaves unrelated global rules untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const rulePath = join(home, "rules", "global", "rules.mdc");
    await mkdir(join(home, "rules", "global"), { recursive: true });
    await writeFile(rulePath, "custom local rule\n", "utf8");

    const removed = await uninstallDotAgentsRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(removed.removed).toBe(false);
    expect(rule).toBe("custom local rule\n");
  });

  it("uses DOT_AGENTS_HOME for the default global rules", async () => {
    const home = await createTempDir();
    process.env.DOT_AGENTS_HOME = home;

    const installed = await installDotAgentsRule();
    const expectedRulePath = join(home, "rules", "global", "rules.mdc");
    const doctor = await doctorDotAgentsRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("uses configDir options for the default global rules", async () => {
    const home = await createTempDir();

    const installed = await installDotAgentsRule(undefined, { configDir: home });
    const expectedRulePath = join(home, "rules", "global", "rules.mdc");
    const doctor = await doctorDotAgentsRule(undefined, { configDir: home });

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("reports dot-agents in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installDotAgentsRule(undefined, { configDir: home });
    const report = await doctorInstalledHooks({ configDir: home });

    expect(report.integrations["dot-agents"].rulePath).toBe(join(home, "rules", "global", "rules.mdc"));
    expect(report.integrations["dot-agents"].status).toBe("ok");
  });
});
