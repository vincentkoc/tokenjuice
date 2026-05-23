import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAgentsCliMemory,
  doctorInstalledHooks,
  installAgentsCliMemory,
  uninstallAgentsCliMemory,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AGENTS_CLI_HOME",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-agents-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("agents-cli memory", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:agents-cli begin -->/gu)?.length ?? 0;
  }

  it("installs a host-specific marker-delimited memory AGENTS.md block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "memory", "AGENTS.md");

    const result = await installAgentsCliMemory(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(result.syncCommand).toBe("agents sync");
    expect(instructions).toContain("<!-- tokenjuice:agents-cli begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("When agents-cli syncs this memory into coding-agent harnesses");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).toContain("agents sync");
    expect(instructions).not.toContain("wrap --full");
  });

  it("preserves existing agents-cli memory and backs it up", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "memory", "AGENTS.md");
    await mkdir(join(home, "memory"));
    await writeFile(instructionsPath, "# shared memory\n\n- keep this\n", "utf8");

    const result = await installAgentsCliMemory(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:agents-cli begin -->");
  });

  it("replaces stale tokenjuice memory without duplicating the block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "memory", "AGENTS.md");
    await mkdir(join(home, "memory"));
    await writeFile(
      instructionsPath,
      [
        "# shared memory",
        "",
        "- keep this",
        "",
        "<!-- tokenjuice:agents-cli begin -->",
        "stale tokenjuice block",
        "<!-- tokenjuice:agents-cli end -->",
      ].join("\n"),
      "utf8",
    );

    await installAgentsCliMemory(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled memory health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "memory", "AGENTS.md");

    await installAgentsCliMemory(instructionsPath);
    const installed = await doctorAgentsCliMemory(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.syncCommand).toBe("agents sync");
    expect(installed.advisories[0]).toContain("memory-based");

    const removed = await uninstallAgentsCliMemory(instructionsPath);
    const disabled = await doctorAgentsCliMemory(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(removed.syncCommand).toBe("agents sync");
    expect(disabled.status).toBe("disabled");
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken memory with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "memory", "AGENTS.md");
    await mkdir(join(home, "memory"));
    await writeFile(instructionsPath, "<!-- tokenjuice:agents-cli begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorAgentsCliMemory(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken memory with nested tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "memory", "AGENTS.md");
    await mkdir(join(home, "memory"));
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:agents-cli begin -->",
        "outer guidance",
        "<!-- tokenjuice:agents-cli begin -->",
        "inner guidance",
        "<!-- tokenjuice:agents-cli end -->",
        "<!-- tokenjuice:agents-cli end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentsCliMemory(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain(
      "configured agents-cli memory has malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install agents-cli",
    );
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken memory when the tokenjuice block is stale", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "memory", "AGENTS.md");
    await mkdir(join(home, "memory"));
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:agents-cli begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- old guidance says to run tokenjuice wrap --full -- <command>.",
        "<!-- tokenjuice:agents-cli end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentsCliMemory(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured agents-cli memory is missing tokenjuice wrap guidance");
    expect(doctor.issues).toContain("configured agents-cli memory is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured agents-cli memory is missing sync guidance");
    expect(doctor.issues).toContain("configured agents-cli memory still suggests the full escape hatch");
  });

  it("reports stale concrete full-output commands", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "memory", "AGENTS.md");
    await mkdir(join(home, "memory"));
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:agents-cli begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- After edits, run `agents sync`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
        "<!-- tokenjuice:agents-cli end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentsCliMemory(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured agents-cli memory still suggests the full escape hatch");
  });

  it("leaves unrelated agents-cli memory untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "memory", "AGENTS.md");
    await mkdir(join(home, "memory"));
    await writeFile(instructionsPath, "# shared memory\n\n- keep this\n", "utf8");

    const removed = await uninstallAgentsCliMemory(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(instructions).toBe("# shared memory\n\n- keep this\n");
  });

  it("uses AGENTS_CLI_HOME for the default memory path", async () => {
    const home = await createTempDir();
    process.env.AGENTS_CLI_HOME = home;

    const installed = await installAgentsCliMemory();
    const expectedInstructionsPath = join(home, "memory", "AGENTS.md");
    const doctor = await doctorAgentsCliMemory();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("uses configDir options for the default memory path", async () => {
    const home = await createTempDir();

    const installed = await installAgentsCliMemory(undefined, { configDir: home });
    const expectedInstructionsPath = join(home, "memory", "AGENTS.md");
    const doctor = await doctorAgentsCliMemory(undefined, { configDir: home });

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("reports agents-cli in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installAgentsCliMemory(undefined, { configDir: home });
    const report = await doctorInstalledHooks({ configDir: home, projectDir: home });

    expect(report.integrations["agents-cli"].instructionsPath).toBe(join(home, "memory", "AGENTS.md"));
    expect(report.integrations["agents-cli"].status).toBe("ok");
  });

  it("removes the default memory file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.AGENTS_CLI_HOME = home;
    const instructionsPath = join(home, "memory", "AGENTS.md");

    await installAgentsCliMemory();
    await uninstallAgentsCliMemory();

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
