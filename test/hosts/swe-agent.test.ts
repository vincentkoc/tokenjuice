import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorSweAgentConfig,
  installSweAgentConfig,
  uninstallSweAgentConfig,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "ADAL_PROJECT_DIR",
  "AGENTS_CLI_HOME",
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
  "CODEGEN_PROJECT_DIR",
  "CODEX_HOME",
  "CONTINUE_PROJECT_DIR",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CURSOR_HOME",
  "DEEPAGENTS_PROJECT_DIR",
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
  "MINI_SWE_AGENT_PROJECT_DIR",
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
  "SWE_AGENT_PROJECT_DIR",
  "TABNINE_PROJECT_DIR",
  "TRAE_PROJECT_DIR",
  "UIPATH_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-swe-agent-test-"));
  tempDirs.push(dir);
  return dir;
}

async function expectSamePath(receivedPath: string, expectedPath: string): Promise<void> {
  expect(await realpath(receivedPath)).toBe(await realpath(expectedPath));
}

describe("SWE-agent config", () => {
  it("installs a truncated-observation config fragment with tokenjuice retry guidance", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".swe-agent", "tokenjuice.yaml");

    const result = await installSweAgentConfig(configPath);
    const config = await readFile(configPath, "utf8");

    expect(result.configPath).toBe(configPath);
    expect(result.backupPath).toBeUndefined();
    expect(config).toContain("tokenjuice SWE-agent observation compaction guidance");
    expect(config).toContain("agent:");
    expect(config).toContain("templates:");
    expect(config).toContain("next_step_truncated_observation_template");
    expect(config).toContain("tokenjuice wrap -- <command>");
    expect(config).toContain("tokenjuice wrap --raw -- <command>");
    expect(config).toContain("sweagent run --config config/default.yaml --config .swe-agent/tokenjuice.yaml");
    expect(config).not.toContain("wrap --full");
  });

  it("backs up an existing config fragment before replacing it", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".swe-agent", "tokenjuice.yaml");
    await installSweAgentConfig(configPath);
    await writeFile(configPath, "custom swe config\n", "utf8");

    const result = await installSweAgentConfig(configPath);
    const config = await readFile(configPath, "utf8");

    expect(result.backupPath).toBe(`${configPath}.bak`);
    await expect(readFile(`${configPath}.bak`, "utf8")).resolves.toBe("custom swe config\n");
    expect(config).toContain("tokenjuice wrap --raw -- <command>");
    expect(config).toContain("# tokenjuice:swe-agent-restore-backup=.bak");
  });

  it("restores a backed-up custom config fragment on uninstall", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".swe-agent", "tokenjuice.yaml");
    await mkdir(join(home, ".swe-agent"), { recursive: true });
    await writeFile(configPath, "custom swe config\n", "utf8");
    await installSweAgentConfig(configPath);

    const removed = await uninstallSweAgentConfig(configPath);

    expect(removed.removed).toBe(true);
    await expect(readFile(configPath, "utf8")).resolves.toBe("custom swe config\n");
    await expect(access(`${configPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores the backup created by install when an older backup already exists", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".swe-agent", "tokenjuice.yaml");
    await mkdir(join(home, ".swe-agent"), { recursive: true });
    await writeFile(configPath, "active custom swe config\n", "utf8");
    await writeFile(`${configPath}.bak`, "older unrelated backup\n", "utf8");

    const installed = await installSweAgentConfig(configPath);
    const config = await readFile(configPath, "utf8");
    const removed = await uninstallSweAgentConfig(configPath);

    expect(installed.backupPath).toBe(`${configPath}.bak.1`);
    expect(config).toContain("# tokenjuice:swe-agent-restore-backup=.bak.1");
    expect(removed.removed).toBe(true);
    await expect(readFile(configPath, "utf8")).resolves.toBe("active custom swe config\n");
    await expect(readFile(`${configPath}.bak`, "utf8")).resolves.toBe("older unrelated backup\n");
    await expect(access(`${configPath}.bak.1`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not rewrite or back up an already current config fragment", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".swe-agent", "tokenjuice.yaml");

    await installSweAgentConfig(configPath);
    const before = await readFile(configPath, "utf8");
    const result = await installSweAgentConfig(configPath);
    const after = await readFile(configPath, "utf8");

    expect(result.backupPath).toBeUndefined();
    expect(after).toBe(before);
    await expect(readFile(`${configPath}.bak`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not restore incidental backups when uninstalling a fresh tokenjuice fragment", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".swe-agent", "tokenjuice.yaml");

    await installSweAgentConfig(configPath);
    await writeFile(`${configPath}.bak`, "unrelated backup\n", "utf8");

    const removed = await uninstallSweAgentConfig(configPath);

    expect(removed.removed).toBe(true);
    await expect(access(configPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${configPath}.bak`, "utf8")).resolves.toBe("unrelated backup\n");
  });

  it("reports installed and uninstalled config health", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".swe-agent", "tokenjuice.yaml");

    await installSweAgentConfig(configPath);
    const installed = await doctorSweAgentConfig(configPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("config-fragment");

    const removed = await uninstallSweAgentConfig(configPath);
    const disabled = await doctorSweAgentConfig(configPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken configs when required guidance is stale", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".swe-agent", "tokenjuice.yaml");
    await mkdir(join(home, ".swe-agent"), { recursive: true });
    await writeFile(
      configPath,
      [
        "# tokenjuice SWE-agent observation compaction guidance",
        "agent:",
        "  templates:",
        "    next_step_truncated_observation_template: |-",
        "      retry with tokenjuice wrap -- <command>",
        "      or tokenjuice wrap --full -- npm test",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorSweAgentConfig(configPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured SWE-agent config is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured SWE-agent config is missing load guidance");
    expect(doctor.issues).toContain("configured SWE-agent config still suggests the full escape hatch");
  });

  it("leaves non-tokenjuice config fragments untouched on uninstall", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".swe-agent", "tokenjuice.yaml");
    await mkdir(join(home, ".swe-agent"), { recursive: true });
    await writeFile(configPath, "custom swe config\n", "utf8");

    const removed = await uninstallSweAgentConfig(configPath);
    const config = await readFile(configPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(config).toBe("custom swe config\n");
  });

  it("uses SWE_AGENT_PROJECT_DIR for the default config path", async () => {
    const home = await createTempDir();
    process.env.SWE_AGENT_PROJECT_DIR = home;

    const installed = await installSweAgentConfig();
    const expectedConfigPath = join(home, ".swe-agent", "tokenjuice.yaml");
    const doctor = await doctorSweAgentConfig();

    await expectSamePath(installed.configPath, expectedConfigPath);
    await expectSamePath(doctor.configPath, expectedConfigPath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default config fragment", async () => {
    const home = await createTempDir();
    process.env.SWE_AGENT_PROJECT_DIR = home;
    const configPath = join(home, ".swe-agent", "tokenjuice.yaml");

    await installSweAgentConfig();
    await uninstallSweAgentConfig(configPath);

    await expect(access(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("defaults to the git root config path from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installSweAgentConfig();
    const expectedConfigPath = join(home, ".swe-agent", "tokenjuice.yaml");
    const doctor = await doctorSweAgentConfig();

    await expectSamePath(installed.configPath, expectedConfigPath);
    await expectSamePath(doctor.configPath, expectedConfigPath);
    expect(doctor.status).toBe("ok");
  });

  it("uses projectDir options for the default config path", async () => {
    const home = await createTempDir();

    const installed = await installSweAgentConfig(undefined, { projectDir: home });
    const expectedConfigPath = join(home, ".swe-agent", "tokenjuice.yaml");
    const doctor = await doctorSweAgentConfig(undefined, { projectDir: home });
    const removed = await uninstallSweAgentConfig(undefined, { projectDir: home });

    expect(installed.configPath).toBe(expectedConfigPath);
    expect(doctor.configPath).toBe(expectedConfigPath);
    expect(doctor.status).toBe("ok");
    expect(removed.configPath).toBe(expectedConfigPath);
    expect(removed.removed).toBe(true);
  });

  it("reports SWE-agent in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installSweAgentConfig(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["swe-agent"].configPath).toBe(join(home, ".swe-agent", "tokenjuice.yaml"));
    expect(report.integrations["swe-agent"].status).toBe("ok");
  });
});
