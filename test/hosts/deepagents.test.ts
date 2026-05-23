import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorDeepAgentsInstructions,
  doctorInstalledHooks,
  installDeepAgentsInstructions,
  uninstallDeepAgentsInstructions,
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-deepagents-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("Deep Agents Code instructions", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:deepagents begin -->/gu)?.length ?? 0;
  }

  it("installs a host-specific marker-delimited .deepagents/AGENTS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".deepagents", "AGENTS.md");

    const result = await installDeepAgentsInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:deepagents begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("When running terminal commands through Deep Agents Code");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).not.toContain("wrap --full");
  });

  it("preserves existing Deep Agents instructions and backs them up", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".deepagents", "AGENTS.md");
    await mkdir(join(home, ".deepagents"));
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installDeepAgentsInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:deepagents begin -->");
  });

  it("replaces stale tokenjuice instructions without duplicating the block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".deepagents", "AGENTS.md");
    await mkdir(join(home, ".deepagents"));
    await writeFile(
      instructionsPath,
      [
        "# project instructions",
        "",
        "- keep this",
        "",
        "<!-- tokenjuice:deepagents begin -->",
        "stale tokenjuice block",
        "<!-- tokenjuice:deepagents end -->",
      ].join("\n"),
      "utf8",
    );

    await installDeepAgentsInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".deepagents", "AGENTS.md");

    await installDeepAgentsInstructions(instructionsPath);
    const installed = await doctorDeepAgentsInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallDeepAgentsInstructions(instructionsPath);
    const disabled = await doctorDeepAgentsInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".deepagents", "AGENTS.md");
    await mkdir(join(home, ".deepagents"));
    await writeFile(instructionsPath, "<!-- tokenjuice:deepagents begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorDeepAgentsInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken instructions with nested tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".deepagents", "AGENTS.md");
    await mkdir(join(home, ".deepagents"));
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:deepagents begin -->",
        "outer guidance",
        "<!-- tokenjuice:deepagents begin -->",
        "inner guidance",
        "<!-- tokenjuice:deepagents end -->",
        "<!-- tokenjuice:deepagents end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorDeepAgentsInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain(
      "configured Deep Agents Code instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install deepagents",
    );
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken instructions when the tokenjuice block is stale", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".deepagents", "AGENTS.md");
    await mkdir(join(home, ".deepagents"));
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:deepagents begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- old guidance says to run tokenjuice wrap --full -- <command>.",
        "<!-- tokenjuice:deepagents end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorDeepAgentsInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Deep Agents Code instructions are missing tokenjuice wrap guidance");
    expect(doctor.issues).toContain("configured Deep Agents Code instructions are missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Deep Agents Code instructions still suggest the full escape hatch");
  });

  it("reports stale concrete full-output commands", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".deepagents", "AGENTS.md");
    await mkdir(join(home, ".deepagents"));
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:deepagents begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
        "<!-- tokenjuice:deepagents end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorDeepAgentsInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Deep Agents Code instructions still suggest the full escape hatch");
  });

  it("leaves unrelated .deepagents/AGENTS.md content untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".deepagents", "AGENTS.md");
    await mkdir(join(home, ".deepagents"));
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const removed = await uninstallDeepAgentsInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(instructions).toBe("# project instructions\n\n- keep this\n");
  });

  it("uses DEEPAGENTS_PROJECT_DIR for the default instruction path", async () => {
    const home = await createTempDir();
    process.env.DEEPAGENTS_PROJECT_DIR = home;

    const installed = await installDeepAgentsInstructions();
    const expectedInstructionsPath = join(home, ".deepagents", "AGENTS.md");
    const doctor = await doctorDeepAgentsInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("defaults to the git root .deepagents/AGENTS.md from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installDeepAgentsInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, ".deepagents", "AGENTS.md"));
    await expect(readFile(join(root, ".deepagents", "AGENTS.md"), "utf8")).resolves.toContain("Deep Agents Code");
  });

  it("reports deepagents in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installDeepAgentsInstructions(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.deepagents.instructionsPath).toBe(join(home, ".deepagents", "AGENTS.md"));
    expect(report.integrations.deepagents.status).toBe("ok");
  });

  it("removes the default instruction file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.DEEPAGENTS_PROJECT_DIR = home;
    const instructionsPath = join(home, ".deepagents", "AGENTS.md");

    await installDeepAgentsInstructions();
    await uninstallDeepAgentsInstructions();

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
