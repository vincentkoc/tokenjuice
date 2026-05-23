import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAgentInitInstructions,
  doctorInstalledHooks,
  installAgentInitInstructions,
  uninstallAgentInitInstructions,
} from "../../src/index.js";
import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

const tempDirs: string[] = [];
const envKeys = [
  "ADAL_PROJECT_DIR",
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
  "GEMINI_HOME",
  "GITLAB_DUO_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-agentinit-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("AgentInit instructions", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:agentinit begin -->/gu)?.length ?? 0;
  }

  it("installs a marker-delimited AGENTS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    const result = await installAgentInitInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.syncCommand).toBe("agentinit sync");
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:agentinit begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("AgentInit syncs this AGENTS.md");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).toContain("agentinit sync");
    expect(instructions).not.toContain("wrap --full");
  });

  it("backs up existing instructions before replacing its own block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installAgentInitInstructions(instructionsPath, { projectDir: home });
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installAgentInitInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:agentinit begin -->");
  });

  it("does not overwrite an existing AGENTS.md backup", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");
    await writeFile(`${instructionsPath}.bak`, "user backup\n", "utf8");

    const result = await installAgentInitInstructions(instructionsPath, { projectDir: home });

    expect(result.backupPath).toBe(`${instructionsPath}.bak.1`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toBe("user backup\n");
    await expect(readFile(`${instructionsPath}.bak.1`, "utf8")).resolves.toContain("- keep this");
  });

  it("does not create a backup for idempotent reinstall", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installAgentInitInstructions(instructionsPath, { projectDir: home });

    const result = await installAgentInitInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBeUndefined();
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
    await expect(access(`${instructionsPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
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
        "<!-- tokenjuice:agentinit begin -->",
        "stale tokenjuice block",
        "<!-- tokenjuice:agentinit end -->",
      ].join("\n"),
      "utf8",
    );

    await installAgentInitInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    await installAgentInitInstructions(instructionsPath, { projectDir: home });
    const installed = await doctorAgentInitInstructions(instructionsPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.syncCommand).toBe("agentinit sync");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("agentinit sync");

    const removed = await uninstallAgentInitInstructions(instructionsPath, { projectDir: home });
    const disabled = await doctorAgentInitInstructions(instructionsPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(removed.syncCommand).toBe("agentinit sync");
    expect(disabled.status).toBe("disabled");
    expect(disabled.syncCommand).toBe("agentinit sync");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uninstalls only the tokenjuice block when project instructions remain", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");
    await installAgentInitInstructions(instructionsPath, { projectDir: home });

    const removed = await uninstallAgentInitInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(removed.removed).toBe(true);
    expect(instructions).toBe("# project instructions\n\n- keep this\n");
    expect(instructions).not.toContain("tokenjuice:agentinit");
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:agentinit begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorAgentInitInstructions(instructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("refuses to install or uninstall malformed tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:agentinit begin -->\nmissing end marker\n", "utf8");

    await expect(installAgentInitInstructions(instructionsPath, { projectDir: home })).rejects.toThrow(
      /cannot safely repair malformed tokenjuice markers/u,
    );
    await expect(uninstallAgentInitInstructions(instructionsPath, { projectDir: home })).rejects.toThrow(
      /cannot safely uninstall malformed tokenjuice markers/u,
    );
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("missing end marker");
  });

  it("reports broken instructions with nested tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:agentinit begin -->",
        "outer guidance",
        "<!-- tokenjuice:agentinit begin -->",
        "inner guidance",
        "<!-- tokenjuice:agentinit end -->",
        "<!-- tokenjuice:agentinit end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentInitInstructions(instructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain(
      "configured AgentInit instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install agentinit",
    );
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports stale concrete full-output commands", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:agentinit begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- After edits, run `agentinit sync`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
        "<!-- tokenjuice:agentinit end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentInitInstructions(instructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured AgentInit instructions still suggest the full escape hatch");
  });

  it("uses AGENTINIT_PROJECT_DIR for the default AGENTS.md path", async () => {
    const home = await createTempDir();
    process.env.AGENTINIT_PROJECT_DIR = home;

    const installed = await installAgentInitInstructions();
    const expectedInstructionsPath = join(home, "AGENTS.md");
    const doctor = await doctorAgentInitInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("rejects symlinked AGENTS.md files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.AGENTINIT_PROJECT_DIR = home;
    await writeFile(join(outside, "private.md"), "# private instructions\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, "AGENTS.md"));

    await expect(installAgentInitInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, "AGENTS.md.bak"))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorAgentInitInstructions();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
  });

  it("rejects sidecar symlinks before installing instructions", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.AGENTINIT_PROJECT_DIR = home;
    await writeFile(join(home, "AGENTS.md"), "# project instructions\n", "utf8");
    await writeFile(join(outside, "private-bak.md"), "# private backup\n", "utf8");
    await writeFile(join(outside, "private-tmp.md"), "# private temp\n", "utf8");

    await symlink(join(outside, "private-bak.md"), join(home, "AGENTS.md.bak"));
    await expect(installAgentInitInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await rm(join(home, "AGENTS.md.bak"));

    await symlink(join(outside, "private-tmp.md"), join(home, "AGENTS.md.tmp"));
    await expect(installAgentInitInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);

    await expect(readFile(join(outside, "private-bak.md"), "utf8")).resolves.toBe("# private backup\n");
    await expect(readFile(join(outside, "private-tmp.md"), "utf8")).resolves.toBe("# private temp\n");
  });

  it("constrains explicit instruction paths to the project boundary", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideInstructionsPath = join(outside, "AGENTS.md");

    process.chdir(home);
    await expect(installAgentInitInstructions(outsideInstructionsPath)).rejects.toThrow(/outside/u);
    await expect(installAgentInitInstructions(outsideInstructionsPath, { projectDir: home })).rejects.toThrow(
      /outside/u,
    );
    await expect(uninstallAgentInitInstructions(outsideInstructionsPath, { projectDir: home })).rejects.toThrow(
      /outside/u,
    );

    const doctor = await doctorAgentInitInstructions(outsideInstructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.syncCommand).toBe("agentinit sync");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("outside");
    expect(doctor.fixCommand).toContain("project-local AGENTS.md path");
    await expect(access(outsideInstructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects explicit instruction paths under symlinked parents outside projectDir", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const linkedDir = join(home, "linked");
    const linkedInstructionsPath = join(linkedDir, "AGENTS.md");
    await symlink(outside, linkedDir);

    await expect(installAgentInitInstructions(linkedInstructionsPath, { projectDir: home })).rejects.toThrow(
      /outside/u,
    );
    await expect(access(join(outside, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("defaults to the git root AGENTS.md from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installAgentInitInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, "AGENTS.md"));
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installAgentInitInstructions(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.agentinit.instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(report.integrations.agentinit.status).toBe("ok");
    expect(report.integrations.agentinit.syncCommand).toBe("agentinit sync");
    expect(report.integrations.agentinit.hasTokenjuiceMarker).toBe(true);
  });

  it("does not count an unsafe uninstalled AGENTS.md as installed", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await writeFile(join(outside, "private.md"), "# private instructions\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, "AGENTS.md"));

    const doctor = await doctorAgentInitInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });
});
