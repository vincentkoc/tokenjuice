import { access, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorBitoGuidelines, doctorInstalledHooks, installBitoGuidelines, uninstallBitoGuidelines } from "../../src/index.js";

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
  "BITO_PROJECT_DIR",
  "BOB_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
  "CAGENT_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEBUFF_PROJECT_DIR",
  "CODEGEN_PROJECT_DIR",
  "CODER_AGENTS_PROJECT_DIR",
  "CODERABBIT_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-bito-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

describe("Bito guidelines", () => {
  it("installs .bito.yaml custom guidelines and a guideline file", async () => {
    const home = await createTempDir();

    const result = await installBitoGuidelines({ projectDir: home });
    const config = await readFile(join(home, ".bito.yaml"), "utf8");
    const guidelines = await readFile(join(home, ".bito", "tokenjuice.md"), "utf8");

    expect(result.configPath).toBe(join(home, ".bito.yaml"));
    expect(result.guidelinesPath).toBe(join(home, ".bito", "tokenjuice.md"));
    expect(config).toContain("# tokenjuice:bito begin");
    expect(config).toContain("custom_guidelines:");
    expect(config).toContain("./.bito/tokenjuice.md");
    expect(guidelines).toContain("tokenjuice terminal output compaction");
    expect(guidelines).toContain("tokenjuice wrap -- <command>");
    expect(guidelines).toContain("tokenjuice wrap --raw -- <command>");
    expect(guidelines).not.toContain("wrap --full");
  });

  it("preserves existing config without custom_guidelines and backs up both files", async () => {
    const home = await createTempDir();
    await writeFile(join(home, ".bito.yaml"), "suggestion_mode: essential\n", "utf8");
    await mkdir(join(home, ".bito"), { recursive: true });
    await writeFile(join(home, ".bito", "tokenjuice.md"), "old guideline\n", "utf8");

    const result = await installBitoGuidelines({ projectDir: home });
    const config = await readFile(join(home, ".bito.yaml"), "utf8");

    expect(result.configBackupPath).toBe(join(home, ".bito.yaml.bak"));
    expect(result.guidelinesBackupPath).toBe(join(home, ".bito", "tokenjuice.md.bak"));
    expect(config).toContain("suggestion_mode: essential");
    expect(config).toContain("# tokenjuice:bito begin");
    await expect(readFile(join(home, ".bito.yaml.bak"), "utf8")).resolves.toContain("suggestion_mode");
    await expect(readFile(join(home, ".bito", "tokenjuice.md.bak"), "utf8")).resolves.toContain("old guideline");
  });

  it("refuses user-owned custom_guidelines instead of duplicating them", async () => {
    const home = await createTempDir();
    await writeFile(
      join(home, ".bito.yaml"),
      '  custom_guidelines:\n    general:\n      - name: "Team Rules"\n        path: "./docs/rules.md"\n',
      "utf8",
    );

    await expect(installBitoGuidelines({ projectDir: home })).rejects.toThrow(/already defines custom_guidelines/u);
  });

  it("refuses custom_guidelines added outside the tokenjuice block", async () => {
    const home = await createTempDir();
    await installBitoGuidelines({ projectDir: home });
    const generated = await readFile(join(home, ".bito.yaml"), "utf8");
    await writeFile(
      join(home, ".bito.yaml"),
      `${generated}\ncustom_guidelines:\n  general:\n    - name: "Team Rules"\n      path: "./docs/rules.md"\n`,
      "utf8",
    );

    await expect(installBitoGuidelines({ projectDir: home })).rejects.toThrow(/already defines custom_guidelines/u);
  });

  it("reports installed and uninstalled health", async () => {
    const home = await createTempDir();

    await installBitoGuidelines({ projectDir: home });
    const installed = await doctorBitoGuidelines({ projectDir: home });
    const removed = await uninstallBitoGuidelines({ projectDir: home });
    const disabled = await doctorBitoGuidelines({ projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("custom-guidelines");
    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    await expect(access(join(home, ".bito.yaml"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(home, ".bito", "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("treats unrelated Bito config as disabled", async () => {
    const home = await createTempDir();
    await writeFile(join(home, ".bito.yaml"), "suggestion_mode: essential\n", "utf8");

    const doctor = await doctorBitoGuidelines({ projectDir: home });

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues).toContain("tokenjuice Bito custom guidelines are not installed");
  });

  it("preserves user-owned guideline files on uninstall", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".bito"), { recursive: true });
    await writeFile(join(home, ".bito.yaml"), "suggestion_mode: essential\n", "utf8");
    await writeFile(join(home, ".bito", "tokenjuice.md"), "team-owned guidelines\n", "utf8");

    const removed = await uninstallBitoGuidelines({ projectDir: home });
    const guidelines = await readFile(join(home, ".bito", "tokenjuice.md"), "utf8");

    expect(removed.removed).toBe(false);
    expect(guidelines).toBe("team-owned guidelines\n");
  });

  it("removes tokenjuice-owned guideline-only partial installs", async () => {
    const home = await createTempDir();
    await installBitoGuidelines({ projectDir: home });
    await rm(join(home, ".bito.yaml"));

    const removed = await uninstallBitoGuidelines({ projectDir: home });

    expect(removed.removed).toBe(true);
    await expect(access(join(home, ".bito", "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken partial installs", async () => {
    const home = await createTempDir();
    await installBitoGuidelines({ projectDir: home });
    await rm(join(home, ".bito", "tokenjuice.md"));

    const doctor = await doctorBitoGuidelines({ projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Bito guidelines file is missing");
  });

  it("uses BITO_PROJECT_DIR for the default project", async () => {
    const home = await createTempDir();
    process.env.BITO_PROJECT_DIR = home;

    const installed = await installBitoGuidelines();
    const doctor = await doctorBitoGuidelines();

    expect(installed.configPath).toBe(join(home, ".bito.yaml"));
    expect(doctor.guidelinesPath).toBe(join(home, ".bito", "tokenjuice.md"));
    expect(doctor.status).toBe("ok");
  });

  it("rejects symlinked config files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.BITO_PROJECT_DIR = home;
    await writeFile(join(outside, ".bito.yaml"), "suggestion_mode: essential\n", "utf8");
    await symlink(join(outside, ".bito.yaml"), join(home, ".bito.yaml"));

    await expect(installBitoGuidelines()).rejects.toThrow(/instruction symlinks/u);
    const doctor = await doctorBitoGuidelines();

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("instruction symlinks");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
  });

  it("rejects symlinked guidelines directories before writing", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await symlink(outside, join(home, ".bito"), "dir");

    await expect(installBitoGuidelines({ projectDir: home })).rejects.toThrow(/instruction symlinks/u);
    const doctor = await doctorBitoGuidelines({ projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("instruction symlinks");
  });

  it("keeps marker evidence when one installed Bito file becomes unsafe", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await installBitoGuidelines({ projectDir: home });
    await rm(join(home, ".bito", "tokenjuice.md"));
    await writeFile(join(outside, "tokenjuice.md"), "outside\n", "utf8");
    await symlink(join(outside, "tokenjuice.md"), join(home, ".bito", "tokenjuice.md"));

    const doctor = await doctorBitoGuidelines({ projectDir: home });
    for (const key of envKeys) {
      process.env[key] = home;
    }
    const aggregate = await doctorInstalledHooks({ projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(aggregate.integrations.bito.status).toBe("broken");
    expect(aggregate.integrations.bito.hasTokenjuiceMarker).toBe(true);
  });

  it("rejects symlinked project roots", async () => {
    const realProject = await createTempDir();
    const linkParent = await createTempDir();
    const linkedProject = join(linkParent, "project-link");
    await symlink(realProject, linkedProject, "dir");

    await expect(installBitoGuidelines({ projectDir: linkedProject })).rejects.toThrow(/instruction symlinks/u);
    await expect(doctorBitoGuidelines({ projectDir: linkedProject })).resolves.toMatchObject({
      status: "broken",
      hasTokenjuiceMarker: false,
      issues: [expect.stringContaining("instruction symlinks")],
    });
  });

  it("preflights backup symlinks before writing either Bito file", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await writeFile(join(home, ".bito.yaml"), "suggestion_mode: essential\n", "utf8");
    await writeFile(join(outside, ".bito.yaml.bak"), "outside\n", "utf8");
    await symlink(join(outside, ".bito.yaml.bak"), join(home, ".bito.yaml.bak"));

    await expect(installBitoGuidelines({ projectDir: home })).rejects.toThrow(/will not write through instruction symlinks/u);
    await expect(access(join(home, ".bito", "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(home, ".bito.yaml"), "utf8")).resolves.toBe("suggestion_mode: essential\n");
  });

  it("uses the current git root when no project dir is configured", async () => {
    const home = await createTempDir();
    const nested = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });
    process.chdir(nested);

    const installed = await installBitoGuidelines();
    const root = await realpath(home);

    expect(installed.configPath).toBe(join(root, ".bito.yaml"));
  });

  it("includes Bito in aggregate doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installBitoGuidelines({ projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.bito.configPath).toBe(join(home, ".bito.yaml"));
    expect(report.integrations.bito.status).toBe("ok");
    expect(report.integrations.bito.hasTokenjuiceMarker).toBe(true);
  });

  it("does not treat user-owned Bito config as aggregate installed", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await writeFile(join(home, ".bito.yaml"), "suggestion_mode: essential\n", "utf8");

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.bito.status).toBe("disabled");
    expect(report.integrations.bito.hasTokenjuiceMarker).toBe(false);
  });
});
