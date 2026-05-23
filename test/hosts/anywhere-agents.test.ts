import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAnywhereAgentsInstructions,
  doctorInstalledHooks,
  installAnywhereAgentsInstructions,
  uninstallAnywhereAgentsInstructions,
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-anywhere-agents-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("anywhere-agents instructions", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:anywhere-agents begin -->/gu)?.length ?? 0;
  }

  it("installs a host-specific marker-delimited AGENTS.local.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.local.md");

    const result = await installAnywhereAgentsInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.syncCommand).toBe("anywhere-agents");
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:anywhere-agents begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("When anywhere-agents layers this AGENTS.local.md");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).toContain("anywhere-agents");
    expect(instructions).not.toContain("wrap --full");
  });

  it("coexists with other tokenjuice AGENTS.local.md blocks", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.local.md");
    await writeFile(
      instructionsPath,
      [
        "# project instructions",
        "",
        "<!-- tokenjuice:agentlink begin -->",
        "## tokenjuice terminal output compaction",
        "- When Agentlink syncs this AGENTS.md, prefer `tokenjuice wrap -- <command>`.",
        "<!-- tokenjuice:agentlink end -->",
      ].join("\n"),
      "utf8",
    );

    await installAnywhereAgentsInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("<!-- tokenjuice:agentlink begin -->");
    expect(instructions).toContain("When Agentlink syncs this AGENTS.md");
    expect(instructions).toContain("<!-- tokenjuice:anywhere-agents begin -->");
    expect(instructions).toContain("When anywhere-agents layers this AGENTS.local.md");
  });

  it("preserves existing instructions and backs them up", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.local.md");
    await installAnywhereAgentsInstructions(instructionsPath);
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installAnywhereAgentsInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:anywhere-agents begin -->");
  });

  it("replaces stale tokenjuice instructions without duplicating the block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.local.md");
    await writeFile(
      instructionsPath,
      [
        "# project instructions",
        "",
        "- keep this",
        "",
        "<!-- tokenjuice:anywhere-agents begin -->",
        "stale tokenjuice block",
        "<!-- tokenjuice:anywhere-agents end -->",
      ].join("\n"),
      "utf8",
    );

    await installAnywhereAgentsInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.local.md");

    await installAnywhereAgentsInstructions(instructionsPath);
    const installed = await doctorAnywhereAgentsInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.syncCommand).toBe("anywhere-agents");
    expect(installed.advisories[0]).toContain("local-override based");

    const removed = await uninstallAnywhereAgentsInstructions(instructionsPath);
    const disabled = await doctorAnywhereAgentsInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(removed.syncCommand).toBe("anywhere-agents");
    expect(disabled.status).toBe("disabled");
    expect(disabled.syncCommand).toBe("anywhere-agents");
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.local.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:anywhere-agents begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorAnywhereAgentsInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken instructions with nested tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.local.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:anywhere-agents begin -->",
        "outer guidance",
        "<!-- tokenjuice:anywhere-agents begin -->",
        "inner guidance",
        "<!-- tokenjuice:anywhere-agents end -->",
        "<!-- tokenjuice:anywhere-agents end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAnywhereAgentsInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain(
      "configured anywhere-agents instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install anywhere-agents",
    );
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("refuses to install or uninstall malformed nested tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.local.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:anywhere-agents begin -->",
        "outer guidance",
        "<!-- tokenjuice:anywhere-agents begin -->",
        "inner guidance",
        "<!-- tokenjuice:anywhere-agents end -->",
        "<!-- tokenjuice:anywhere-agents end -->",
      ].join("\n"),
      "utf8",
    );

    await expect(installAnywhereAgentsInstructions(instructionsPath)).rejects.toThrow(
      /cannot safely repair malformed tokenjuice markers/u,
    );
    await expect(uninstallAnywhereAgentsInstructions(instructionsPath)).rejects.toThrow(
      /cannot safely uninstall malformed tokenjuice markers/u,
    );
  });

  it("reports missing sync guidance", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.local.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:anywhere-agents begin -->",
        "## tokenjuice terminal output compaction",
        "- tokenjuice wrap -- <command>",
        "- tokenjuice wrap --raw -- <command>",
        "<!-- tokenjuice:anywhere-agents end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAnywhereAgentsInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured anywhere-agents instructions are missing sync guidance");
  });

  it("reports stale concrete full-output commands", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.local.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:anywhere-agents begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- After edits, run `anywhere-agents`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
        "<!-- tokenjuice:anywhere-agents end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAnywhereAgentsInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured anywhere-agents instructions still suggest the full escape hatch");
  });

  it("leaves unrelated AGENTS.local.md content untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.local.md");
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const removed = await uninstallAnywhereAgentsInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(instructions).toBe("# project instructions\n\n- keep this\n");
  });

  it("uses ANYWHERE_AGENTS_PROJECT_DIR for the default AGENTS.local.md path", async () => {
    const home = await createTempDir();
    process.env.ANYWHERE_AGENTS_PROJECT_DIR = home;

    const installed = await installAnywhereAgentsInstructions();
    const expectedInstructionsPath = join(home, "AGENTS.local.md");
    const doctor = await doctorAnywhereAgentsInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("follows an existing AGENTS.local.md symlink when the target stays inside the project root", async () => {
    const home = await createTempDir();
    process.env.ANYWHERE_AGENTS_PROJECT_DIR = home;
    await writeFile(join(home, "AGENT_SOURCE.md"), "# shared agent instructions\n", "utf8");
    await symlink("AGENT_SOURCE.md", join(home, "AGENTS.local.md"));

    const installed = await installAnywhereAgentsInstructions();
    const aliasStats = await lstat(join(home, "AGENTS.local.md"));
    const sourceInstructions = await readFile(join(home, "AGENT_SOURCE.md"), "utf8");

    expect(installed.instructionsPath).toBe(await realpath(join(home, "AGENT_SOURCE.md")));
    expect(aliasStats.isSymbolicLink()).toBe(true);
    expect(sourceInstructions).toContain("<!-- tokenjuice:anywhere-agents begin -->");
  });

  it("keeps an in-project AGENTS.local.md symlink recoverable after uninstall", async () => {
    const home = await createTempDir();
    process.env.ANYWHERE_AGENTS_PROJECT_DIR = home;
    await writeFile(join(home, "AGENT_SOURCE.md"), "", "utf8");
    await symlink("AGENT_SOURCE.md", join(home, "AGENTS.local.md"));

    await installAnywhereAgentsInstructions();
    const removed = await uninstallAnywhereAgentsInstructions();
    const aliasStats = await lstat(join(home, "AGENTS.local.md"));
    const disabled = await doctorAnywhereAgentsInstructions();

    expect(removed.removed).toBe(true);
    expect(aliasStats.isSymbolicLink()).toBe(true);
    await expect(readFile(join(home, "AGENT_SOURCE.md"), "utf8")).resolves.toBe("");
    expect(disabled.status).toBe("disabled");

    const reinstalled = await installAnywhereAgentsInstructions();
    expect(reinstalled.instructionsPath).toBe(await realpath(join(home, "AGENT_SOURCE.md")));
  });

  it("rejects default local instruction symlinks outside the project root", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.ANYWHERE_AGENTS_PROJECT_DIR = home;
    await writeFile(join(outside, "AGENTS.local.md"), "# external instructions\n", "utf8");
    await symlink(join(outside, "AGENTS.local.md"), join(home, "AGENTS.local.md"));

    await expect(installAnywhereAgentsInstructions()).rejects.toThrow(/will not follow instruction symlinks outside/u);
  });

  it("reports disabled instead of throwing for external AGENTS.local.md symlinks in doctor", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.ANYWHERE_AGENTS_PROJECT_DIR = home;
    await writeFile(join(outside, "AGENTS.local.md"), "# external instructions\n", "utf8");
    await symlink(join(outside, "AGENTS.local.md"), join(home, "AGENTS.local.md"));

    const report = await doctorAnywhereAgentsInstructions();

    expect(report.status).toBe("disabled");
    expect(report.instructionsPath).toBe(join(home, "AGENTS.local.md"));
    expect(report.issues).toContain("default AGENTS.local.md is outside the project write boundary; tokenjuice doctor did not inspect it");
  });

  it("defaults to the git root AGENTS.local.md from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installAnywhereAgentsInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, "AGENTS.local.md"));
    await expect(readFile(join(root, "AGENTS.local.md"), "utf8")).resolves.toContain("anywhere-agents layers");
  });

  it("reports anywhere-agents in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installAnywhereAgentsInstructions(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["anywhere-agents"].instructionsPath).toBe(join(home, "AGENTS.local.md"));
    expect(report.integrations["anywhere-agents"].status).toBe("ok");
  });

  it("keeps aggregate hook doctor tolerant of external AGENTS.local.md symlinks", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await writeFile(join(outside, "AGENTS.local.md"), "# external instructions\n", "utf8");
    await symlink(join(outside, "AGENTS.local.md"), join(home, "AGENTS.local.md"));

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["anywhere-agents"].status).toBe("disabled");
    expect(report.integrations["anywhere-agents"].issues).toContain(
      "default AGENTS.local.md is outside the project write boundary; tokenjuice doctor did not inspect it",
    );
  });

  it("removes the default AGENTS.local.md when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.ANYWHERE_AGENTS_PROJECT_DIR = home;
    const instructionsPath = join(home, "AGENTS.local.md");

    await installAnywhereAgentsInstructions();
    await uninstallAnywhereAgentsInstructions(instructionsPath);

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
