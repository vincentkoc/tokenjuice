import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAgentlinkInstructions,
  doctorInstalledHooks,
  installAgentlinkInstructions,
  uninstallAgentlinkInstructions,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "ADAL_PROJECT_DIR",
  "AGENTLINK_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-agentlink-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("Agentlink instructions", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:agentlink begin -->/gu)?.length ?? 0;
  }

  it("installs a host-specific marker-delimited AGENTS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    const result = await installAgentlinkInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.syncCommand).toBe("agentlink sync");
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:agentlink begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("When Agentlink syncs this AGENTS.md");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).toContain("agentlink sync");
    expect(instructions).not.toContain("wrap --full");
  });

  it("coexists with other tokenjuice AGENTS.md blocks", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "# project instructions",
        "",
        "<!-- tokenjuice:qoder begin -->",
        "## tokenjuice terminal output compaction",
        "- When running terminal commands through Qoder CLI, prefer `tokenjuice wrap -- <command>`.",
        "<!-- tokenjuice:qoder end -->",
      ].join("\n"),
      "utf8",
    );

    await installAgentlinkInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("<!-- tokenjuice:qoder begin -->");
    expect(instructions).toContain("When running terminal commands through Qoder CLI");
    expect(instructions).toContain("<!-- tokenjuice:agentlink begin -->");
    expect(instructions).toContain("When Agentlink syncs this AGENTS.md");
  });

  it("preserves existing instructions and backs them up", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installAgentlinkInstructions(instructionsPath);
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installAgentlinkInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:agentlink begin -->");
  });

  it("replaces stale tokenjuice instructions without duplicating the block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "# project instructions",
        "",
        "- keep this",
        "",
        "<!-- tokenjuice:agentlink begin -->",
        "stale tokenjuice block",
        "<!-- tokenjuice:agentlink end -->",
      ].join("\n"),
      "utf8",
    );

    await installAgentlinkInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    await installAgentlinkInstructions(instructionsPath);
    const installed = await doctorAgentlinkInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.syncCommand).toBe("agentlink sync");
    expect(installed.advisories[0]).toContain("source-instruction based");

    const removed = await uninstallAgentlinkInstructions(instructionsPath);
    const disabled = await doctorAgentlinkInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(removed.syncCommand).toBe("agentlink sync");
    expect(disabled.status).toBe("disabled");
    expect(disabled.syncCommand).toBe("agentlink sync");
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:agentlink begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorAgentlinkInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken instructions with nested tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:agentlink begin -->",
        "outer guidance",
        "<!-- tokenjuice:agentlink begin -->",
        "inner guidance",
        "<!-- tokenjuice:agentlink end -->",
        "<!-- tokenjuice:agentlink end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentlinkInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain(
      "configured Agentlink instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install agentlink",
    );
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("refuses to install or uninstall malformed nested tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:agentlink begin -->",
        "outer guidance",
        "<!-- tokenjuice:agentlink begin -->",
        "inner guidance",
        "<!-- tokenjuice:agentlink end -->",
        "<!-- tokenjuice:agentlink end -->",
      ].join("\n"),
      "utf8",
    );

    await expect(installAgentlinkInstructions(instructionsPath)).rejects.toThrow(/cannot safely repair malformed tokenjuice markers/u);
    await expect(uninstallAgentlinkInstructions(instructionsPath)).rejects.toThrow(/cannot safely uninstall malformed tokenjuice markers/u);
  });

  it("reports missing sync guidance", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:agentlink begin -->",
        "## tokenjuice terminal output compaction",
        "- tokenjuice wrap -- <command>",
        "- tokenjuice wrap --raw -- <command>",
        "<!-- tokenjuice:agentlink end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentlinkInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Agentlink instructions are missing sync guidance");
  });

  it("reports stale concrete full-output commands", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:agentlink begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- After edits, run `agentlink sync`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
        "<!-- tokenjuice:agentlink end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentlinkInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Agentlink instructions still suggest the full escape hatch");
  });

  it("leaves unrelated AGENTS.md content untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const removed = await uninstallAgentlinkInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(instructions).toBe("# project instructions\n\n- keep this\n");
  });

  it("uses AGENTLINK_PROJECT_DIR for the default AGENTS.md path", async () => {
    const home = await createTempDir();
    process.env.AGENTLINK_PROJECT_DIR = home;

    const installed = await installAgentlinkInstructions();
    const expectedInstructionsPath = join(home, "AGENTS.md");
    const doctor = await doctorAgentlinkInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("uses the configured Agentlink source instead of an AGENTS.md alias", async () => {
    const home = await createTempDir();
    process.env.AGENTLINK_PROJECT_DIR = home;
    await writeFile(join(home, ".agentlink.yaml"), "source: INSTRUCTIONS.md\nlinks:\n  - AGENTS.md\n", "utf8");
    await writeFile(join(home, "INSTRUCTIONS.md"), "# shared agent instructions\n", "utf8");
    await symlink("INSTRUCTIONS.md", join(home, "AGENTS.md"));

    const installed = await installAgentlinkInstructions();
    const sourceStats = await lstat(join(home, "AGENTS.md"));
    const sourceInstructions = await readFile(join(home, "INSTRUCTIONS.md"), "utf8");
    const aliasInstructions = await readFile(join(home, "AGENTS.md"), "utf8");

    expect(installed.instructionsPath).toBe(await realpath(join(home, "INSTRUCTIONS.md")));
    expect(sourceStats.isSymbolicLink()).toBe(true);
    expect(sourceInstructions).toContain("<!-- tokenjuice:agentlink begin -->");
    expect(aliasInstructions).toBe(sourceInstructions);
  });

  it("rejects repo-controlled Agentlink sources outside the project root", async () => {
    const home = await createTempDir();
    process.env.AGENTLINK_PROJECT_DIR = home;
    await writeFile(join(home, ".agentlink.yaml"), "source: ../outside.md\nlinks:\n  - AGENTS.md\n", "utf8");

    await expect(installAgentlinkInstructions()).rejects.toThrow(/only writes project \.agentlink\.yaml sources inside/u);
  });

  it("reports unsafe Agentlink sources as broken doctor health", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    process.env.AGENTLINK_PROJECT_DIR = home;
    await writeFile(join(home, ".agentlink.yaml"), "source: ../outside.md\nlinks:\n  - AGENTS.md\n", "utf8");

    const direct = await doctorAgentlinkInstructions();
    const aggregate = await doctorInstalledHooks({ projectDir: home });

    expect(direct.status).toBe("broken");
    expect(direct.issues[0]).toContain("cannot resolve Agentlink instruction source");
    expect(direct.fixCommand).toContain(".agentlink.yaml");
    expect(aggregate.integrations.agentlink.status).toBe("broken");
    expect(aggregate.integrations.agentlink.issues[0]).toContain("cannot resolve Agentlink instruction source");
  });

  it("rejects Agentlink sources under symlinked parent directories outside the project root", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.AGENTLINK_PROJECT_DIR = home;
    await symlink(outside, join(home, "linkdir"));
    await writeFile(join(home, ".agentlink.yaml"), "source: linkdir/AGENTS.md\nlinks:\n  - AGENTS.md\n", "utf8");

    await expect(installAgentlinkInstructions()).rejects.toThrow(/will not write through instruction directories outside/u);
  });

  it("follows an existing AGENTS.md symlink when no Agentlink source is configured", async () => {
    const home = await createTempDir();
    process.env.AGENTLINK_PROJECT_DIR = home;
    await writeFile(join(home, "AGENT_SOURCE.md"), "# shared agent instructions\n", "utf8");
    await symlink("AGENT_SOURCE.md", join(home, "AGENTS.md"));

    const installed = await installAgentlinkInstructions();
    const aliasStats = await lstat(join(home, "AGENTS.md"));
    const sourceInstructions = await readFile(join(home, "AGENT_SOURCE.md"), "utf8");

    expect(installed.instructionsPath).toBe(await realpath(join(home, "AGENT_SOURCE.md")));
    expect(aliasStats.isSymbolicLink()).toBe(true);
    expect(sourceInstructions).toContain("<!-- tokenjuice:agentlink begin -->");
  });

  it("rejects default instruction symlinks outside the project root", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.AGENTLINK_PROJECT_DIR = home;
    await writeFile(join(outside, "AGENTS.md"), "# external instructions\n", "utf8");
    await symlink(join(outside, "AGENTS.md"), join(home, "AGENTS.md"));

    await expect(installAgentlinkInstructions()).rejects.toThrow(/will not follow instruction symlinks outside/u);
  });

  it("ignores preexisting deterministic temporary instruction symlinks outside the project root", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.AGENTLINK_PROJECT_DIR = home;
    const outsideInstructions = join(outside, "AGENTS.md");
    await writeFile(outsideInstructions, "# external instructions\n", "utf8");
    await symlink(outsideInstructions, join(home, "AGENTS.md.tmp"));

    await expect(installAgentlinkInstructions()).resolves.toMatchObject({ instructionsPath: join(home, "AGENTS.md") });
    await expect(readFile(outsideInstructions, "utf8")).resolves.toBe("# external instructions\n");
  });

  it("preserves symlinked instruction source files when uninstall removes the only block", async () => {
    const home = await createTempDir();
    process.env.AGENTLINK_PROJECT_DIR = home;
    await writeFile(join(home, "AGENT_SOURCE.md"), "", "utf8");
    await symlink("AGENT_SOURCE.md", join(home, "AGENTS.md"));

    await installAgentlinkInstructions();
    const removed = await uninstallAgentlinkInstructions();
    const aliasStats = await lstat(join(home, "AGENTS.md"));

    expect(removed.removed).toBe(true);
    expect(aliasStats.isSymbolicLink()).toBe(true);
    await expect(readFile(join(home, "AGENT_SOURCE.md"), "utf8")).resolves.toBe("");
  });

  it("defaults to the git root AGENTS.md from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installAgentlinkInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, "AGENTS.md"));
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toContain("Agentlink syncs");
  });

  it("reports agentlink in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installAgentlinkInstructions(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.agentlink.instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(report.integrations.agentlink.status).toBe("ok");
  });

  it("removes the default AGENTS.md when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.AGENTLINK_PROJECT_DIR = home;
    const instructionsPath = join(home, "AGENTS.md");

    await installAgentlinkInstructions();
    await uninstallAgentlinkInstructions(instructionsPath);

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
