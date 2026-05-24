import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorGitLabDuoRule,
  doctorInstalledHooks,
  installGitLabDuoRule,
  uninstallGitLabDuoRule,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();
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
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
  "ZENCODER_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-gitlab-duo-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("GitLab Duo custom rules", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:gitlab-duo begin -->/gu)?.length ?? 0;
  }

  it("installs a marker-delimited chat rules block", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".gitlab", "duo", "chat-rules.md");

    const result = await installGitLabDuoRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("<!-- tokenjuice:gitlab-duo begin -->");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("preserves existing chat rules and backs them up", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".gitlab", "duo", "chat-rules.md");
    await installGitLabDuoRule(rulePath);
    await writeFile(rulePath, "# Duo rules\n\n- keep this\n", "utf8");

    const result = await installGitLabDuoRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(rule).toContain("- keep this");
    expect(rule).toContain("<!-- tokenjuice:gitlab-duo begin -->");
  });

  it("does not overwrite an existing user backup when preserving chat rules", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".gitlab", "duo", "chat-rules.md");
    await mkdir(join(home, ".gitlab", "duo"), { recursive: true });
    await writeFile(rulePath, "# Duo rules\n\n- keep this\n", "utf8");
    await writeFile(`${rulePath}.bak`, "# user backup\n", "utf8");

    const result = await installGitLabDuoRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak.1`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("user backup");
    await expect(readFile(`${rulePath}.bak.1`, "utf8")).resolves.toContain("keep this");
    expect(rule).toContain("<!-- tokenjuice:gitlab-duo begin -->");
    expect(rule).toContain("- keep this");
  });

  it("reinstalls current tokenjuice blocks idempotently", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".gitlab", "duo", "chat-rules.md");

    await installGitLabDuoRule(rulePath);
    const result = await installGitLabDuoRule(rulePath);

    expect(result.backupPath).toBeUndefined();
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("replaces stale tokenjuice rules without duplicating the block", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".gitlab", "duo", "chat-rules.md");
    await mkdir(join(home, ".gitlab", "duo"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "# Duo rules",
        "",
        "- keep this",
        "",
        "<!-- tokenjuice:gitlab-duo begin -->",
        "stale tokenjuice block",
        "<!-- tokenjuice:gitlab-duo end -->",
      ].join("\n"),
      "utf8",
    );

    await installGitLabDuoRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(rule).toContain("- keep this");
    expect(rule).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(rule)).toBe(1);
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".gitlab", "duo", "chat-rules.md");

    await installGitLabDuoRule(rulePath);
    const installed = await doctorGitLabDuoRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("custom-rules based");

    const removed = await uninstallGitLabDuoRule(rulePath);
    const disabled = await doctorGitLabDuoRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".gitlab", "duo", "chat-rules.md");
    await mkdir(join(home, ".gitlab", "duo"), { recursive: true });
    await writeFile(rulePath, "<!-- tokenjuice:gitlab-duo begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorGitLabDuoRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
  });

  it("reports broken rules with nested GitLab Duo tokenjuice markers", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".gitlab", "duo", "chat-rules.md");
    await mkdir(join(home, ".gitlab", "duo"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "<!-- tokenjuice:gitlab-duo begin -->",
        "## tokenjuice terminal output compaction",
        "- When running terminal commands through GitLab Duo Agent Platform, prefer `tokenjuice wrap -- <command>`.",
        "<!-- tokenjuice:gitlab-duo begin -->",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "<!-- tokenjuice:gitlab-duo end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorGitLabDuoRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured GitLab Duo rule has malformed tokenjuice markers");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
    await expect(installGitLabDuoRule(rulePath)).rejects.toThrow("cannot safely repair malformed tokenjuice markers");
    await expect(uninstallGitLabDuoRule(rulePath)).rejects.toThrow("cannot safely uninstall malformed tokenjuice markers");
  });

  it("leaves unrelated chat rules untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".gitlab", "duo", "chat-rules.md");
    await mkdir(join(home, ".gitlab", "duo"), { recursive: true });
    await writeFile(rulePath, "# Duo rules\n\n- keep this\n", "utf8");

    const removed = await uninstallGitLabDuoRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(removed.removed).toBe(false);
    expect(rule).toBe("# Duo rules\n\n- keep this\n");
  });

  it("uses GITLAB_DUO_PROJECT_DIR for the default rule file", async () => {
    const home = await createTempDir();
    process.env.GITLAB_DUO_PROJECT_DIR = home;

    const installed = await installGitLabDuoRule();
    const expectedRulePath = join(home, ".gitlab", "duo", "chat-rules.md");
    const doctor = await doctorGitLabDuoRule();

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

    const installed = await installGitLabDuoRule();
    const expectedRulePath = join(await realpath(repo), ".gitlab", "duo", "chat-rules.md");
    const doctor = await doctorGitLabDuoRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
    await expect(access(join(nestedDir, ".gitlab", "duo", "chat-rules.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports gitlab-duo in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installGitLabDuoRule(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["gitlab-duo"].rulePath).toBe(join(home, ".gitlab", "duo", "chat-rules.md"));
    expect(report.integrations["gitlab-duo"].status).toBe("ok");
  });

  it("removes the default rule file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.GITLAB_DUO_PROJECT_DIR = home;
    const rulePath = join(home, ".gitlab", "duo", "chat-rules.md");

    await installGitLabDuoRule();
    await uninstallGitLabDuoRule(rulePath);

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
