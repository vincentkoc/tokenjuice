import { access, chmod, lstat, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorQodoReviewConfig,
  installQodoReviewConfig,
  uninstallQodoReviewConfig,
} from "../../src/index.js";
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
  "BAZ_PROJECT_DIR",
  "BOB_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
  "CAGENT_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEBUFF_PROJECT_DIR",
  "CODEGEN_PROJECT_DIR",
  "CODER_AGENTS_PROJECT_DIR",
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
  "FORGECODE_PROJECT_DIR",
  "GEMINI_HOME",
  "GITLAB_DUO_PROJECT_DIR",
  "GREPTILE_PROJECT_DIR",
  "GROK_BUILD_PROJECT_DIR",
  "GPTME_PROJECT_DIR",
  "HOME",
  "JEAN2_PROJECT_DIR",
  "JETBRAINS_AI_PROJECT_DIR",
  "JULES_PROJECT_DIR",
  "JUNIE_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "LEANCTL_PROJECT_DIR",
  "MCP_AGENT_PROJECT_DIR",
  "MINI_SWE_AGENT_PROJECT_DIR",
  "MISTRAL_VIBE_PROJECT_DIR",
  "MUX_PROJECT_DIR",
  "KNOWNS_PROJECT_DIR",
  "NOVAKIT_PROJECT_DIR",
  "ONA_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPENWEBUI_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "PLANDEX_PROJECT_DIR",
  "QODER_PROJECT_DIR",
  "QODO_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-qodo-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

describe("Qodo review config", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/# tokenjuice:qodo begin/gu)?.length ?? 0;
  }

  it("installs marker-delimited review-agent guidelines", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");

    const result = await installQodoReviewConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(result.configPath).toBe(configPath);
    expect(result.backupPath).toBeUndefined();
    expect(config).toContain("[review_agent]");
    expect(config).toContain("# tokenjuice:qodo begin");
    expect(config).toContain("issues_user_guidelines");
    expect(config).toContain("compliance_user_guidelines");
    expect(config).toContain("tokenjuice terminal output compaction");
    expect(config).toContain("tokenjuice wrap -- <command>");
    expect(config).toContain("tokenjuice wrap --raw -- <command>");
    expect(config).not.toContain("wrap --full");
  });

  it("writes new configs with private permissions", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");

    await installQodoReviewConfig(configPath, { projectDir: home });

    expect((await lstat(configPath)).mode & 0o777).toBe(0o600);
  });

  it("preserves existing Qodo config and backs it up", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(configPath, '[github_app]\npr_commands = ["/agentic_review"]\n\n[review_agent]\ncomments_location_policy = "both"\n', "utf8");
    await chmod(configPath, 0o600);

    const result = await installQodoReviewConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(result.backupPath).toBe(`${configPath}.bak`);
    await expect(readFile(`${configPath}.bak`, "utf8")).resolves.toContain("comments_location_policy");
    expect((await lstat(configPath)).mode & 0o777).toBe(0o600);
    expect((await lstat(`${configPath}.bak`)).mode & 0o777).toBe(0o600);
    expect(config).toContain('[github_app]\npr_commands = ["/agentic_review"]');
    expect(config).toContain('comments_location_policy = "both"');
    expect(config).toContain("# tokenjuice:qodo begin");
  });

  it("replaces stale tokenjuice guidelines without duplicating the block", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(
      configPath,
      [
        "[review_agent]",
        'comments_location_policy = "both"',
        "",
        "# tokenjuice:qodo begin",
        "stale tokenjuice block",
        "# tokenjuice:qodo end",
      ].join("\n"),
      "utf8",
    );

    await installQodoReviewConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain('comments_location_policy = "both"');
    expect(config).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(config)).toBe(1);
  });

  it("refuses to overwrite user-owned review-agent guidelines", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(configPath, '[review_agent]\nissues_user_guidelines = "keep my review guidance"\n', "utf8");

    await expect(installQodoReviewConfig(configPath, { projectDir: home })).rejects.toThrow(/already defines review_agent user guidelines/u);
  });

  it("refuses inline review_agent tables before adding a table section", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(configPath, 'review_agent = { issues_user_guidelines = "keep my review guidance" }\n', "utf8");

    await expect(installQodoReviewConfig(configPath, { projectDir: home })).rejects.toThrow(/inline TOML table/u);
  });

  it("refuses quoted inline review_agent tables before adding a table section", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(configPath, '"review_agent" = { issues_user_guidelines = "keep my review guidance" }\n', "utf8");

    await expect(installQodoReviewConfig(configPath, { projectDir: home })).rejects.toThrow(/inline TOML table/u);
  });

  it("ignores table-looking text inside review-agent multiline strings", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(
      configPath,
      [
        "[review_agent]",
        'extra_instructions = """',
        "keep this string",
        "[example]",
        "still inside the string",
        '"""',
        "",
        "[github_app]",
        'pr_commands = ["/agentic_review"]',
      ].join("\n"),
      "utf8",
    );

    await installQodoReviewConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain("[example]\nstill inside the string\n\"\"\"");
    expect(config).toContain('"""\n\n# tokenjuice:qodo begin');
    expect(config).toContain('[github_app]\npr_commands = ["/agentic_review"]');
  });

  it("ignores guideline-looking text inside root multiline strings", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(
      configPath,
      [
        'notes = """',
        'review_agent.issues_user_guidelines = "not a real setting"',
        "[review_agent]",
        "still inside notes",
        '"""',
      ].join("\n"),
      "utf8",
    );

    await installQodoReviewConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain('review_agent.issues_user_guidelines = "not a real setting"');
    expect(config).toContain("\n[review_agent]\n# tokenjuice:qodo begin");
  });

  it("ignores marker-looking text inside TOML multiline strings", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    const original = [
      'notes = """',
      "# tokenjuice:qodo begin",
      "example marker text, not an installed block",
      "# tokenjuice:qodo end",
      '"""',
      "",
    ].join("\n");
    await writeFile(configPath, original, "utf8");

    const doctor = await doctorQodoReviewConfig(configPath, { projectDir: home });
    const uninstalled = await uninstallQodoReviewConfig(configPath, { projectDir: home });
    await installQodoReviewConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(uninstalled.removed).toBe(false);
    expect(config).toContain(original.trimEnd());
    expect(config.match(/# tokenjuice:qodo begin\nissues_user_guidelines/gu)?.length).toBe(1);
  });

  it("reports installed and uninstalled config health", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");

    await installQodoReviewConfig(configPath, { projectDir: home });
    const installed = await doctorQodoReviewConfig(configPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("review-guideline");

    const removed = await uninstallQodoReviewConfig(configPath, { projectDir: home });
    const disabled = await doctorQodoReviewConfig(configPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
  });

  it("reports duplicate user-owned guidelines outside tokenjuice markers", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");

    await installQodoReviewConfig(configPath, { projectDir: home });
    await writeFile(
      configPath,
      `${await readFile(configPath, "utf8")}\nissues_user_guidelines = "conflicting guidance"\n`,
      "utf8",
    );

    const doctor = await doctorQodoReviewConfig(configPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain(
      "configured Qodo review config has user-owned review-agent guidelines outside the tokenjuice block",
    );
    expect(doctor.fixCommand).toContain("remove duplicate review_agent guideline settings");
  });

  it("reports broken config with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(configPath, "# tokenjuice:qodo begin\nmissing end marker\n", "utf8");

    const doctor = await doctorQodoReviewConfig(configPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues[0]).toContain("unmatched or duplicate");
  });

  it("reports broken config with reversed tokenjuice markers", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(configPath, "# tokenjuice:qodo end\nstale block\n# tokenjuice:qodo begin\n", "utf8");

    await expect(installQodoReviewConfig(configPath, { projectDir: home })).rejects.toThrow(/malformed tokenjuice Qodo markers/u);
    const doctor = await doctorQodoReviewConfig(configPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues[0]).toContain("unmatched or duplicate");
  });

  it("reports broken config when the tokenjuice block is outside review_agent", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(
      configPath,
      [
        "# tokenjuice:qodo begin",
        'issues_user_guidelines = """',
        "tokenjuice wrap -- <command>",
        "tokenjuice wrap --raw -- <command>",
        '"""',
        'compliance_user_guidelines = """',
        "tokenjuice wrap -- <command>",
        "tokenjuice wrap --raw -- <command>",
        '"""',
        "# tokenjuice:qodo end",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorQodoReviewConfig(configPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured Qodo tokenjuice block is outside the [review_agent] table");
  });

  it("reports broken config when guideline keys are only marker-delimited text", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(
      configPath,
      [
        "[review_agent]",
        "# tokenjuice:qodo begin",
        'notes = """',
        'issues_user_guidelines = "tokenjuice wrap -- <command> and tokenjuice wrap --raw -- <command>"',
        'compliance_user_guidelines = "tokenjuice wrap -- <command> and tokenjuice wrap --raw -- <command>"',
        '"""',
        "# tokenjuice:qodo end",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorQodoReviewConfig(configPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured Qodo tokenjuice block is missing review-agent guideline settings");
  });

  it("leaves unrelated config untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(configPath, '[github_app]\npr_commands = ["/agentic_review"]\n', "utf8");

    const removed = await uninstallQodoReviewConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(config).toBe('[github_app]\npr_commands = ["/agentic_review"]\n');
  });

  it("uses QODO_PROJECT_DIR for the default config file", async () => {
    const home = await createTempDir();
    process.env.QODO_PROJECT_DIR = home;

    const installed = await installQodoReviewConfig();
    const expectedConfigPath = join(home, ".pr_agent.toml");
    const doctor = await doctorQodoReviewConfig();

    expect(installed.configPath).toBe(expectedConfigPath);
    expect(doctor.configPath).toBe(expectedConfigPath);
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it("rejects symlinked config files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.QODO_PROJECT_DIR = home;
    await writeFile(join(outside, "private.toml"), "[review_agent]\n", "utf8");
    await symlink(join(outside, "private.toml"), join(home, ".pr_agent.toml"));

    await expect(installQodoReviewConfig()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, ".pr_agent.toml.bak"))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorQodoReviewConfig();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
    await expect(doctorQodoReviewConfig(join(home, ".pr_agent.toml"), { projectDir: home })).resolves.toMatchObject({
      status: "broken",
      hasTokenjuiceMarker: false,
      issues: [expect.stringContaining("will not read or write through instruction symlinks")],
    });
  });

  it("rejects sidecar symlinks before installing configs", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(configPath, "[review_agent]\n", "utf8");
    await writeFile(join(outside, "private-bak.toml"), "# private backup\n", "utf8");
    await writeFile(join(outside, "private-tmp.toml"), "# private temp\n", "utf8");

    await symlink(join(outside, "private-bak.toml"), `${configPath}.bak`);
    await expect(installQodoReviewConfig(undefined, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await rm(`${configPath}.bak`);

    await symlink(join(outside, "private-tmp.toml"), `${configPath}.tmp`);
    await expect(installQodoReviewConfig(undefined, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );

    await expect(readFile(join(outside, "private-bak.toml"), "utf8")).resolves.toBe("# private backup\n");
    await expect(readFile(join(outside, "private-tmp.toml"), "utf8")).resolves.toBe("# private temp\n");
  });

  it("constrains explicit config paths to the project boundary", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideConfigPath = join(outside, ".pr_agent.toml");

    process.chdir(home);
    await expect(installQodoReviewConfig(outsideConfigPath)).rejects.toThrow(/outside/u);
    await expect(installQodoReviewConfig(outsideConfigPath, { projectDir: home })).rejects.toThrow(/outside/u);
    await expect(uninstallQodoReviewConfig(outsideConfigPath, { projectDir: home })).rejects.toThrow(/outside/u);

    const doctor = await doctorQodoReviewConfig(outsideConfigPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("outside");
    expect(doctor.fixCommand).toContain("project-local .pr_agent.toml path");
    await expect(access(outsideConfigPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects arbitrary in-project explicit config paths", async () => {
    const home = await createTempDir();
    const readmePath = join(home, "README.md");
    await writeFile(readmePath, "# keep me\n", "utf8");

    await expect(installQodoReviewConfig(readmePath, { projectDir: home })).rejects.toThrow(
      /only installs the project-local \.pr_agent\.toml config/u,
    );

    const doctor = await doctorQodoReviewConfig(readmePath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.fixCommand).toContain("project-local .pr_agent.toml path");
    await expect(readFile(readmePath, "utf8")).resolves.toBe("# keep me\n");
  });

  it("rejects explicit config paths under symlinked parents inside or outside projectDir", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const linkedOutsideDir = join(home, "linked-outside");
    const linkedInsideTarget = join(home, "redirected");
    const linkedInsideDir = join(home, "linked-inside");
    await mkdir(linkedInsideTarget, { recursive: true });
    await symlink(outside, linkedOutsideDir);
    await symlink(linkedInsideTarget, linkedInsideDir);

    await expect(installQodoReviewConfig(join(linkedOutsideDir, ".pr_agent.toml"), { projectDir: home })).rejects.toThrow(
      /outside/u,
    );
    await expect(installQodoReviewConfig(join(linkedInsideDir, ".pr_agent.toml"), { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(outside, ".pr_agent.toml"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(linkedInsideTarget, ".pr_agent.toml"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked project roots before writing default configs", async () => {
    const home = await createTempDir();
    const links = await createTempDir();
    const linkedProjectDir = join(links, "project");
    await symlink(home, linkedProjectDir);

    await expect(installQodoReviewConfig(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(home, ".pr_agent.toml"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked project parent directories before writing default configs", async () => {
    const realParent = await createTempDir();
    const links = await createTempDir();
    const realProjectDir = join(realParent, "project");
    const linkedParent = join(links, "linked-parent");
    const linkedProjectDir = join(linkedParent, "project");
    await mkdir(realProjectDir, { recursive: true });
    await symlink(realParent, linkedParent);

    await expect(installQodoReviewConfig(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(realProjectDir, ".pr_agent.toml"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not count markerless user-owned configs as installed", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".pr_agent.toml");
    await writeFile(configPath, "[review_agent]\n", "utf8");

    const doctor = await doctorQodoReviewConfig(undefined, { projectDir: home });

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    await expect(readFile(configPath, "utf8")).resolves.toBe("[review_agent]\n");
  });

  it("does not follow unsafe config symlinks to collect marker evidence", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await writeFile(join(outside, "private.toml"), "# tokenjuice:qodo begin\n", "utf8");
    await symlink(join(outside, "private.toml"), join(home, ".pr_agent.toml"));

    const doctor = await doctorQodoReviewConfig(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("uses the current git root when no project dir is configured", async () => {
    const home = await createTempDir();
    const nested = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });
    process.chdir(nested);

    const installed = await installQodoReviewConfig();
    const root = await realpath(home);

    expect(installed.configPath).toBe(join(root, ".pr_agent.toml"));
  });

  it("includes Qodo in aggregate doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installQodoReviewConfig(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.qodo.configPath).toBe(join(home, ".pr_agent.toml"));
    expect(report.integrations.qodo.status).toBe("ok");
    expect(report.integrations.qodo.hasTokenjuiceMarker).toBe(true);
  });

  it("removes the default config file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.QODO_PROJECT_DIR = home;
    const configPath = join(home, ".pr_agent.toml");

    await installQodoReviewConfig();
    await uninstallQodoReviewConfig(configPath, { projectDir: home });

    await expect(access(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps default config under the real project path", async () => {
    const home = await createTempDir();
    process.env.QODO_PROJECT_DIR = home;
    await installQodoReviewConfig();

    const expectedConfigPath = join(await realpath(home), ".pr_agent.toml");

    expect(await realpath(join(home, ".pr_agent.toml"))).toBe(expectedConfigPath);
  });
});
