import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorDockerAgentPrompt,
  installDockerAgentPrompt,
  uninstallDockerAgentPrompt,
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-docker-agent-test-"));
  tempDirs.push(dir);
  return dir;
}

async function expectSamePath(receivedPath: string, expectedPath: string): Promise<void> {
  expect(await realpath(receivedPath)).toBe(await realpath(expectedPath));
}

describe("Docker Agent prompt", () => {
  it("installs a prompt file with tokenjuice retry guidance", async () => {
    const home = await createTempDir();
    const promptPath = join(home, ".docker-agent", "tokenjuice.md");

    const result = await installDockerAgentPrompt(promptPath);
    const prompt = await readFile(promptPath, "utf8");

    expect(result.promptPath).toBe(promptPath);
    expect(result.backupPath).toBeUndefined();
    expect(prompt).toContain("tokenjuice Docker Agent terminal output compaction");
    expect(prompt).toContain("Docker Agent runs shell commands");
    expect(prompt).toContain("tokenjuice wrap -- <command>");
    expect(prompt).toContain("tokenjuice wrap --raw -- <command>");
    expect(prompt).toContain("add_prompt_files");
    expect(prompt).toContain(".docker-agent/tokenjuice.md");
    expect(prompt).not.toContain("wrap --full");
  });

  it("backs up an existing prompt file before replacing it", async () => {
    const home = await createTempDir();
    const promptPath = join(home, ".docker-agent", "tokenjuice.md");
    await installDockerAgentPrompt(promptPath);
    await writeFile(promptPath, "custom Docker Agent prompt\n", "utf8");

    const result = await installDockerAgentPrompt(promptPath);
    const prompt = await readFile(promptPath, "utf8");

    expect(result.backupPath).toBe(`${promptPath}.bak`);
    await expect(readFile(`${promptPath}.bak`, "utf8")).resolves.toBe("custom Docker Agent prompt\n");
    expect(prompt).toContain("tokenjuice wrap --raw -- <command>");
    expect(prompt).toContain("# tokenjuice:docker-agent-restore-backup=.bak");
  });

  it("restores a backed-up custom prompt file on uninstall", async () => {
    const home = await createTempDir();
    const promptPath = join(home, ".docker-agent", "tokenjuice.md");
    await mkdir(join(home, ".docker-agent"), { recursive: true });
    await writeFile(promptPath, "custom Docker Agent prompt\n", "utf8");
    await installDockerAgentPrompt(promptPath);

    const removed = await uninstallDockerAgentPrompt(promptPath);

    expect(removed.removed).toBe(true);
    await expect(readFile(promptPath, "utf8")).resolves.toBe("custom Docker Agent prompt\n");
    await expect(access(`${promptPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores the backup created by install when an older backup already exists", async () => {
    const home = await createTempDir();
    const promptPath = join(home, ".docker-agent", "tokenjuice.md");
    await mkdir(join(home, ".docker-agent"), { recursive: true });
    await writeFile(promptPath, "active custom Docker Agent prompt\n", "utf8");
    await writeFile(`${promptPath}.bak`, "older unrelated backup\n", "utf8");

    const installed = await installDockerAgentPrompt(promptPath);
    const prompt = await readFile(promptPath, "utf8");
    const removed = await uninstallDockerAgentPrompt(promptPath);

    expect(installed.backupPath).toBe(`${promptPath}.bak.1`);
    expect(prompt).toContain("# tokenjuice:docker-agent-restore-backup=.bak.1");
    expect(removed.removed).toBe(true);
    await expect(readFile(promptPath, "utf8")).resolves.toBe("active custom Docker Agent prompt\n");
    await expect(readFile(`${promptPath}.bak`, "utf8")).resolves.toBe("older unrelated backup\n");
    await expect(access(`${promptPath}.bak.1`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not rewrite or back up an already current prompt file", async () => {
    const home = await createTempDir();
    const promptPath = join(home, ".docker-agent", "tokenjuice.md");

    await installDockerAgentPrompt(promptPath);
    const before = await readFile(promptPath, "utf8");
    const result = await installDockerAgentPrompt(promptPath);
    const after = await readFile(promptPath, "utf8");

    expect(result.backupPath).toBeUndefined();
    expect(after).toBe(before);
    await expect(readFile(`${promptPath}.bak`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not restore incidental backups when uninstalling a fresh tokenjuice prompt", async () => {
    const home = await createTempDir();
    const promptPath = join(home, ".docker-agent", "tokenjuice.md");

    await installDockerAgentPrompt(promptPath);
    await writeFile(`${promptPath}.bak`, "unrelated backup\n", "utf8");

    const removed = await uninstallDockerAgentPrompt(promptPath);

    expect(removed.removed).toBe(true);
    await expect(access(promptPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${promptPath}.bak`, "utf8")).resolves.toBe("unrelated backup\n");
  });

  it("reports installed and uninstalled prompt health", async () => {
    const home = await createTempDir();
    const promptPath = join(home, ".docker-agent", "tokenjuice.md");

    await installDockerAgentPrompt(promptPath);
    const installed = await doctorDockerAgentPrompt(promptPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("prompt-file");

    const removed = await uninstallDockerAgentPrompt(promptPath);
    const disabled = await doctorDockerAgentPrompt(promptPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken prompts when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const promptPath = join(home, ".docker-agent", "tokenjuice.md");
    await installDockerAgentPrompt(promptPath);
    await writeFile(
      promptPath,
      [
        "# tokenjuice Docker Agent terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorDockerAgentPrompt(promptPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Docker Agent prompt file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Docker Agent prompt file is missing prompt-file path guidance");
    expect(doctor.issues).toContain("configured Docker Agent prompt file is missing add_prompt_files guidance");
    expect(doctor.issues).toContain("configured Docker Agent prompt file still suggests the full escape hatch");
  });

  it("leaves non-tokenjuice prompt files untouched on uninstall", async () => {
    const home = await createTempDir();
    const promptPath = join(home, ".docker-agent", "tokenjuice.md");
    await mkdir(join(home, ".docker-agent"), { recursive: true });
    await writeFile(promptPath, "custom Docker Agent prompt\n", "utf8");

    const removed = await uninstallDockerAgentPrompt(promptPath);
    const prompt = await readFile(promptPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(prompt).toBe("custom Docker Agent prompt\n");
  });

  it("uses DOCKER_AGENT_PROJECT_DIR for the default prompt path", async () => {
    const home = await createTempDir();
    process.env.DOCKER_AGENT_PROJECT_DIR = home;

    const installed = await installDockerAgentPrompt();
    const expectedPromptPath = join(home, ".docker-agent", "tokenjuice.md");
    const doctor = await doctorDockerAgentPrompt();

    await expectSamePath(installed.promptPath, expectedPromptPath);
    await expectSamePath(doctor.promptPath, expectedPromptPath);
    expect(doctor.status).toBe("ok");
  });

  it("uses CAGENT_PROJECT_DIR as a legacy/default project override", async () => {
    const home = await createTempDir();
    delete process.env.DOCKER_AGENT_PROJECT_DIR;
    process.env.CAGENT_PROJECT_DIR = home;

    const installed = await installDockerAgentPrompt();

    await expectSamePath(installed.promptPath, join(home, ".docker-agent", "tokenjuice.md"));
  });

  it("removes the default prompt file", async () => {
    const home = await createTempDir();
    process.env.DOCKER_AGENT_PROJECT_DIR = home;
    const promptPath = join(home, ".docker-agent", "tokenjuice.md");

    await installDockerAgentPrompt();
    await uninstallDockerAgentPrompt();

    await expect(access(promptPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("defaults to the git root prompt path from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installDockerAgentPrompt();
    const expectedPromptPath = join(home, ".docker-agent", "tokenjuice.md");
    const doctor = await doctorDockerAgentPrompt();

    await expectSamePath(installed.promptPath, expectedPromptPath);
    await expectSamePath(doctor.promptPath, expectedPromptPath);
    expect(doctor.status).toBe("ok");
  });

  it("uses projectDir options for the default prompt path", async () => {
    const home = await createTempDir();

    const installed = await installDockerAgentPrompt(undefined, { projectDir: home });
    const expectedPromptPath = join(home, ".docker-agent", "tokenjuice.md");
    const doctor = await doctorDockerAgentPrompt(undefined, { projectDir: home });
    const removed = await uninstallDockerAgentPrompt(undefined, { projectDir: home });

    expect(installed.promptPath).toBe(expectedPromptPath);
    expect(doctor.promptPath).toBe(expectedPromptPath);
    expect(doctor.status).toBe("ok");
    expect(removed.promptPath).toBe(expectedPromptPath);
    expect(removed.removed).toBe(true);
  });

  it("reports Docker Agent in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installDockerAgentPrompt(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["docker-agent"].promptPath).toBe(join(home, ".docker-agent", "tokenjuice.md"));
    expect(report.integrations["docker-agent"].status).toBe("ok");
  });
});
