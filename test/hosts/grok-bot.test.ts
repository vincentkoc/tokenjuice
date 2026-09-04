import { access, chmod, link, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  doctorGrokBotRule,
  doctorInstalledHooks,
  installGrokBotRule,
  uninstallGrokBotRule,
} from "../../src/index.js";
import { main } from "../../src/cli/main.js";
import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

const tempDirs: string[] = [];
const envKeys = [
  "ADAL_PROJECT_DIR",
  "AETHER_PROJECT_DIR",
  "AGENTINIT_PROJECT_DIR",
  "AGENT_LAYER_PROJECT_DIR",
  "AGENTLINK_PROJECT_DIR",
  "AGENTLOOM_PROJECT_DIR",
  "AGENTS_CLI_HOME",
  "AGENTS_MD_PROJECT_DIR",
  "AGENTSGE_PROJECT_DIR",
  "AGENTSMESH_PROJECT_DIR",
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "ANYWHERE_AGENTS_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "BOB_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
  "CAGENT_PROJECT_DIR",
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
  "DOCKER_AGENT_PROJECT_DIR",
  "DOT_AGENTS_HOME",
  "FACTORY_HOME",
  "FIREBASE_STUDIO_PROJECT_DIR",
  "GEMINI_HOME",
  "GITLAB_DUO_PROJECT_DIR",
  "GROK_BOT_PROJECT_DIR",
  "GROK_BUILD_PROJECT_DIR",
  "GPTME_PROJECT_DIR",
  "HOME",
  "JEAN2_PROJECT_DIR",
  "JETBRAINS_AI_PROJECT_DIR",
  "JULES_PROJECT_DIR",
  "JUNIE_PROJECT_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "MCP_AGENT_PROJECT_DIR",
  "MINI_SWE_AGENT_PROJECT_DIR",
  "MISTRAL_VIBE_PROJECT_DIR",
  "MUX_PROJECT_DIR",
  "ONA_PROJECT_DIR",
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
  "SWE_AGENT_PROJECT_DIR",
  "TABNINE_PROJECT_DIR",
  "TRAE_PROJECT_DIR",
  "UIPATH_PROJECT_DIR",
  "WARP_PROJECT_DIR",
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
  const dir = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-grok-bot-test-")));
  tempDirs.push(dir);
  return dir;
}

function rulePath(projectDir: string): string {
  return join(projectDir, ".cursor", "rules", "tokenjuice.mdc");
}

describe("Grok Bot rule", () => {
  it("installs an always-applied Cursor workspace rule", async () => {
    const projectDir = await createTempDir();

    const result = await installGrokBotRule(undefined, { projectDir });
    const rule = await readFile(rulePath(projectDir), "utf8");

    expect(result.rulePath).toBe(rulePath(projectDir));
    expect(result.backupPath).toBeUndefined();
    expect(rule).toMatch(/^---\ndescription: "Use tokenjuice for noisy terminal output in Grok Bot workspaces\."\nalwaysApply: true\n---/u);
    expect(rule).toContain("<!-- tokenjuice:grok-bot-rule -->");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("does not mutate shared AGENTS.md guidance", async () => {
    const projectDir = await createTempDir();
    const agentsPath = join(projectDir, "AGENTS.md");
    const original = "<!-- tokenjuice:grok-build begin -->\nkeep Grok Build\n<!-- tokenjuice:grok-build end -->\n";
    await writeFile(agentsPath, original, "utf8");

    await installGrokBotRule(undefined, { projectDir });

    await expect(readFile(agentsPath, "utf8")).resolves.toBe(original);
    await expect(readFile(rulePath(projectDir), "utf8")).resolves.toContain("tokenjuice:grok-bot-rule");
  });

  it("backs up and restores an existing custom rule", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    await mkdir(join(projectDir, ".cursor", "rules"), { recursive: true });
    await writeFile(path, "---\nalwaysApply: false\n---\ncustom rule\n", "utf8");

    const installed = await installGrokBotRule(undefined, { projectDir });
    const removed = await uninstallGrokBotRule(undefined, { projectDir });

    expect(installed.backupPath).toBe(`${path}.bak`);
    expect(removed).toEqual({ rulePath: path, removed: true, restoredBackup: true });
    await expect(readFile(path, "utf8")).resolves.toBe("---\nalwaysApply: false\n---\ncustom rule\n");
    await expect(access(`${path}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves rule permissions on backups despite the process umask", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    await mkdir(join(projectDir, ".cursor", "rules"), { recursive: true });
    await writeFile(path, "private rule\n", { mode: 0o660 });
    await chmod(path, 0o660);

    const previousUmask = process.umask(0o027);
    let result;
    try {
      result = await installGrokBotRule(undefined, { projectDir });
    } finally {
      process.umask(previousUmask);
    }

    expect((await stat(result.backupPath!)).mode & 0o777).toBe(0o660);
    await chmod(path, 0o644);
    await uninstallGrokBotRule(undefined, { projectDir });
    expect((await stat(path)).mode & 0o777).toBe(0o660);
  });

  it("does not overwrite an existing backup", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    await mkdir(join(projectDir, ".cursor", "rules"), { recursive: true });
    await writeFile(path, "custom rule\n", "utf8");
    await writeFile(`${path}.bak`, "older backup\n", "utf8");

    const result = await installGrokBotRule(undefined, { projectDir });

    expect(result.backupPath).toBe(`${path}.bak.1`);
    await expect(readFile(`${path}.bak`, "utf8")).resolves.toBe("older backup\n");
  });

  it("is idempotent", async () => {
    const projectDir = await createTempDir();
    await installGrokBotRule(undefined, { projectDir });

    const result = await installGrokBotRule(undefined, { projectDir });

    expect(result.backupPath).toBeUndefined();
    await expect(access(`${rulePath(projectDir)}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("repairs a modified managed rule without orphaning a backup", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    await installGrokBotRule(undefined, { projectDir });
    const rule = await readFile(path, "utf8");
    await writeFile(path, rule.replace("tokenjuice wrap -- <command>", "tokenjuice wrap --changed -- <command>"), "utf8");

    const result = await installGrokBotRule(undefined, { projectDir });

    expect(result.backupPath).toBeUndefined();
    await expect(readFile(path, "utf8")).resolves.toBe(rule);
    await expect(access(`${path}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes a freshly installed owned rule", async () => {
    const projectDir = await createTempDir();
    await installGrokBotRule(undefined, { projectDir });

    const result = await uninstallGrokBotRule(undefined, { projectDir });

    expect(result).toEqual({ rulePath: rulePath(projectDir), removed: true, restoredBackup: false });
    await expect(access(rulePath(projectDir))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not overwrite a pre-existing removal sidecar", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    const sidecarPath = `${path}.tokenjuice-remove`;
    await installGrokBotRule(undefined, { projectDir });
    await writeFile(sidecarPath, "keep recovery evidence\n", "utf8");

    await uninstallGrokBotRule(undefined, { projectDir });

    await expect(readFile(sidecarPath, "utf8")).resolves.toBe("keep recovery evidence\n");
  });

  it("reports installed, broken, and disabled rule health", async () => {
    const projectDir = await createTempDir();
    await installGrokBotRule(undefined, { projectDir });
    const installed = await doctorGrokBotRule(undefined, { projectDir });
    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);

    const path = rulePath(projectDir);
    const rule = await readFile(path, "utf8");
    await writeFile(path, rule.replace("alwaysApply: true", "alwaysApply: false"), "utf8");
    const broken = await doctorGrokBotRule(undefined, { projectDir });
    expect(broken.status).toBe("broken");
    expect(broken.issues).toContain("configured Grok Bot rule is missing alwaysApply frontmatter");

    await rm(path);
    const disabled = await doctorGrokBotRule(undefined, { projectDir });
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
  });

  it("validates alwaysApply only in leading frontmatter", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    await installGrokBotRule(undefined, { projectDir });
    const rule = await readFile(path, "utf8");
    await writeFile(
      path,
      rule.replace("alwaysApply: true", "alwaysApply: false")
        .replace("# tokenjuice terminal output compaction", "# tokenjuice terminal output compaction\n\nalwaysApply: true"),
      "utf8",
    );

    const report = await doctorGrokBotRule(undefined, { projectDir });

    expect(report.status).toBe("broken");
    expect(report.issues).toContain("configured Grok Bot rule is missing alwaysApply frontmatter");
  });

  it("rejects conflicting frontmatter keys", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    await installGrokBotRule(undefined, { projectDir });
    const rule = await readFile(path, "utf8");
    await writeFile(path, rule.replace("alwaysApply: true", "alwaysApply: true\nalwaysApply: false"), "utf8");

    const report = await doctorGrokBotRule(undefined, { projectDir });

    expect(report.status).toBe("broken");
    expect(report.issues).toContain("configured Grok Bot rule has invalid or duplicate frontmatter");
    expect(report.issues).toContain("configured Grok Bot rule is missing alwaysApply frontmatter");
  });

  it("reports a missing restore backup as broken", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    await mkdir(join(projectDir, ".cursor", "rules"), { recursive: true });
    await writeFile(path, "custom rule\n", "utf8");
    await installGrokBotRule(undefined, { projectDir });
    await rm(`${path}.bak`);

    const report = await doctorGrokBotRule(undefined, { projectDir });

    expect(report.status).toBe("broken");
    expect(report.issues).toContain(`configured Grok Bot rule references missing restore backup ${path}.bak`);
  });

  it("refuses to uninstall a non-tokenjuice rule", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    await mkdir(join(projectDir, ".cursor", "rules"), { recursive: true });
    await writeFile(path, "custom rule\n", "utf8");

    await expect(uninstallGrokBotRule(undefined, { projectDir })).rejects.toThrow("is not the tokenjuice Grok Bot rule");
  });

  it("does not claim a custom rule that merely mentions the ownership marker", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    const customRule = `custom documentation for <!-- tokenjuice:grok-bot-rule -->\n`;
    await mkdir(join(projectDir, ".cursor", "rules"), { recursive: true });
    await writeFile(path, customRule, "utf8");

    const installed = await installGrokBotRule(undefined, { projectDir });
    const removed = await uninstallGrokBotRule(undefined, { projectDir });

    expect(installed.backupPath).toBe(`${path}.bak`);
    expect(removed.restoredBackup).toBe(true);
    await expect(readFile(path, "utf8")).resolves.toBe(customRule);
  });

  it("fails closed on a malformed restore marker", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    const siblingPath = `${path}.private`;
    await installGrokBotRule(undefined, { projectDir });
    await writeFile(siblingPath, "private sibling\n", "utf8");
    const rule = await readFile(path, "utf8");
    await writeFile(
      path,
      rule.replace(
        "<!-- tokenjuice:grok-bot-rule -->",
        "<!-- tokenjuice:grok-bot-rule -->\n<!-- tokenjuice:grok-bot-restore-backup=.private -->",
      ),
      "utf8",
    );

    const report = await doctorGrokBotRule(undefined, { projectDir });
    expect(report.status).toBe("broken");
    expect(report.issues).toContain("configured Grok Bot rule has a malformed or duplicated restore backup marker");
    await expect(uninstallGrokBotRule(undefined, { projectDir })).rejects.toThrow(/marker is malformed or duplicated/u);
    await expect(readFile(siblingPath, "utf8")).resolves.toBe("private sibling\n");
    await expect(access(path)).resolves.toBeUndefined();
  });

  it("fails closed on duplicate restore markers", async () => {
    const projectDir = await createTempDir();
    const path = rulePath(projectDir);
    await mkdir(join(projectDir, ".cursor", "rules"), { recursive: true });
    await writeFile(path, "custom rule\n", "utf8");
    await installGrokBotRule(undefined, { projectDir });
    const rule = await readFile(path, "utf8");
    await writeFile(
      path,
      rule.replace(
        "<!-- tokenjuice:grok-bot-rule -->",
        "<!-- tokenjuice:grok-bot-rule -->\n<!-- tokenjuice:grok-bot-restore-backup=.bak.1 -->",
      ),
      "utf8",
    );

    await expect(installGrokBotRule(undefined, { projectDir })).rejects.toThrow(/marker is malformed or duplicated/u);
    await expect(uninstallGrokBotRule(undefined, { projectDir })).rejects.toThrow(/marker is malformed or duplicated/u);
    await expect(readFile(`${path}.bak`, "utf8")).resolves.toBe("custom rule\n");
  });

  it("uses GROK_BOT_PROJECT_DIR for the default rule path", async () => {
    const projectDir = await createTempDir();
    process.env.GROK_BOT_PROJECT_DIR = projectDir;

    const installed = await installGrokBotRule();
    const doctor = await doctorGrokBotRule();

    expect(installed.rulePath).toBe(rulePath(projectDir));
    expect(doctor.rulePath).toBe(rulePath(projectDir));
    expect(doctor.status).toBe("ok");
  });

  it("rejects symlinked and hard-linked rule files", async () => {
    const projectDir = await createTempDir();
    const outside = await createTempDir();
    const path = rulePath(projectDir);
    const outsidePath = join(outside, "private.mdc");
    await mkdir(join(projectDir, ".cursor", "rules"), { recursive: true });
    await writeFile(outsidePath, "private\n", "utf8");
    await symlink(outsidePath, path);
    await expect(installGrokBotRule(undefined, { projectDir })).rejects.toThrow(/symlinks/u);

    await rm(path);
    await link(outsidePath, path);
    await expect(installGrokBotRule(undefined, { projectDir })).rejects.toThrow(/hard-linked/u);
  });

  it("constrains explicit rules to a real project-local path", async () => {
    const projectDir = await createTempDir();
    const outside = await createTempDir();
    await expect(installGrokBotRule(join(outside, "tokenjuice.mdc"), { projectDir })).rejects.toThrow(/outside/u);

    const target = join(projectDir, "real-rules");
    const linked = join(projectDir, ".cursor");
    await mkdir(target);
    await symlink(target, linked);
    await expect(installGrokBotRule(undefined, { projectDir })).rejects.toThrow(/symlinks/u);
  });

  it("reports unsafe and non-regular rule paths as broken without installation evidence", async () => {
    const projectDir = await createTempDir();
    const outside = await createTempDir();
    const path = rulePath(projectDir);
    await mkdir(join(projectDir, ".cursor", "rules"), { recursive: true });
    await writeFile(join(outside, "private.mdc"), "<!-- tokenjuice:grok-bot-rule -->\n", "utf8");
    await symlink(join(outside, "private.mdc"), path);

    const unsafe = await doctorGrokBotRule(undefined, { projectDir });
    expect(unsafe.status).toBe("broken");
    expect(unsafe.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(unsafe)).toBe(false);

    await rm(path);
    await mkdir(path);
    const nonRegular = await doctorGrokBotRule(undefined, { projectDir });
    expect(nonRegular.status).toBe("broken");
    expect(nonRegular.hasTokenjuiceMarker).toBe(false);
  });

  it("defaults to the git root from nested directories", async () => {
    const projectDir = await createTempDir();
    await mkdir(join(projectDir, ".git"));
    const nestedDir = join(projectDir, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installGrokBotRule();

    expect(installed.rulePath).toBe(rulePath(projectDir));
  });

  it("is included in aggregate doctor output", async () => {
    const projectDir = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = projectDir;
    }
    await installGrokBotRule(undefined, { projectDir });

    const report = await doctorInstalledHooks();

    expect(report.integrations["grok-bot"].status).toBe("ok");
    expect(report.integrations["grok-bot"].rulePath).toBe(rulePath(projectDir));
  });

  it("routes grok-bot and grokbot without claiming the ambiguous grok target", async () => {
    const projectDir = await createTempDir();
    process.env.GROK_BOT_PROJECT_DIR = projectDir;
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      await expect(main(["install", "grok-bot", "--format", "json"])).resolves.toBe(0);
      await expect(main(["doctor", "grokbot", "--format", "json"])).resolves.toBe(0);
      await expect(main(["uninstall", "grokbot", "--format", "json"])).resolves.toBe(0);
      await expect(main(["install", "grok"])).rejects.toThrow("install currently supports");
    } finally {
      stdout.mockRestore();
    }
  });
});
