import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAgentsMdInstructions,
  doctorInstalledHooks,
  installAgentsMdInstructions,
  uninstallAgentsMdInstructions,
} from "../../src/index.js";
import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

const tempDirs: string[] = [];
const envKeys = [
  "ADAL_PROJECT_DIR",
  "AGENTS_MD_PROJECT_DIR",
  "AGENTSGE_PROJECT_DIR",
  "AGENTSMESH_PROJECT_DIR",
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
  "DOT_AGENTS_HOME",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GITLAB_DUO_PROJECT_DIR",
  "GROK_BUILD_PROJECT_DIR",
  "GROK_HOME",
  "GPTME_PROJECT_DIR",
  "HOME",
  "JETBRAINS_AI_PROJECT_DIR",
  "JULES_PROJECT_DIR",
  "JUNIE_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-agents-md-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("AGENTS.md instructions", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:agents-md begin -->/gu)?.length ?? 0;
  }

  it("installs a generic marker-delimited AGENTS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    const result = await installAgentsMdInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:agents-md begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("agent that reads AGENTS.md");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).not.toContain("wrap --full");
  });

  it("coexists with host-specific tokenjuice AGENTS.md blocks", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "# project instructions",
        "",
        "<!-- tokenjuice:gptme begin -->",
        "## tokenjuice terminal output compaction",
        "- When running terminal commands through gptme, prefer `tokenjuice wrap -- <command>`.",
        "<!-- tokenjuice:gptme end -->",
      ].join("\n"),
      "utf8",
    );

    await installAgentsMdInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("<!-- tokenjuice:gptme begin -->");
    expect(instructions).toContain("When running terminal commands through gptme");
    expect(instructions).toContain("<!-- tokenjuice:agents-md begin -->");
    expect(instructions).toContain("agent that reads AGENTS.md");
  });

  it("backs up existing project instructions before replacing its own block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installAgentsMdInstructions(instructionsPath, { projectDir: home });
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installAgentsMdInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:agents-md begin -->");
  });

  it("does not overwrite an existing AGENTS.md backup", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");
    await writeFile(`${instructionsPath}.bak`, "user backup\n", "utf8");

    const result = await installAgentsMdInstructions(instructionsPath, { projectDir: home });

    expect(result.backupPath).toBe(`${instructionsPath}.bak.1`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toBe("user backup\n");
    await expect(readFile(`${instructionsPath}.bak.1`, "utf8")).resolves.toContain("- keep this");
  });

  it("does not create a backup for idempotent reinstall", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installAgentsMdInstructions(instructionsPath, { projectDir: home });

    const result = await installAgentsMdInstructions(instructionsPath, { projectDir: home });
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
        "<!-- tokenjuice:agents-md begin -->",
        "stale tokenjuice block",
        "<!-- tokenjuice:agents-md end -->",
      ].join("\n"),
      "utf8",
    );

    await installAgentsMdInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    await installAgentsMdInstructions(instructionsPath, { projectDir: home });
    const installed = await doctorAgentsMdInstructions(instructionsPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallAgentsMdInstructions(instructionsPath, { projectDir: home });
    const disabled = await doctorAgentsMdInstructions(instructionsPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uninstalls only the tokenjuice block when project instructions remain", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");
    await installAgentsMdInstructions(instructionsPath, { projectDir: home });

    const removed = await uninstallAgentsMdInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(removed.removed).toBe(true);
    expect(instructions).toBe("# project instructions\n\n- keep this\n");
    expect(instructions).not.toContain("tokenjuice:agents-md");
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:agents-md begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorAgentsMdInstructions(instructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("refuses to install or uninstall malformed tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:agents-md begin -->\nmissing end marker\n", "utf8");

    await expect(installAgentsMdInstructions(instructionsPath, { projectDir: home })).rejects.toThrow(
      /cannot safely repair malformed tokenjuice markers/u,
    );
    await expect(uninstallAgentsMdInstructions(instructionsPath, { projectDir: home })).rejects.toThrow(
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
        "<!-- tokenjuice:agents-md begin -->",
        "outer block",
        "<!-- tokenjuice:agents-md begin -->",
        "- When running terminal commands, prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` only when raw bytes are required.",
        "<!-- tokenjuice:agents-md end -->",
        "<!-- tokenjuice:agents-md end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentsMdInstructions(instructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured AGENTS.md instructions have malformed tokenjuice marker nesting or extra markers");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken instructions when tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:agents-md begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>` for noisy terminal commands.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
        "<!-- tokenjuice:agents-md end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentsMdInstructions(instructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured AGENTS.md instructions are missing the raw escape hatch");
    expect(doctor.issues).toContain("configured AGENTS.md instructions still suggest the full escape hatch");
  });

  it("uses AGENTS_MD_PROJECT_DIR for the default AGENTS.md path", async () => {
    const home = await createTempDir();
    process.env.AGENTS_MD_PROJECT_DIR = home;

    const installed = await installAgentsMdInstructions();
    const expectedInstructionsPath = join(home, "AGENTS.md");
    const doctor = await doctorAgentsMdInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("rejects symlinked AGENTS.md files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.AGENTS_MD_PROJECT_DIR = home;
    await writeFile(join(outside, "private.md"), "# private instructions\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, "AGENTS.md"));

    await expect(installAgentsMdInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, "AGENTS.md.bak"))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorAgentsMdInstructions();

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
  });

  it("rejects sidecar symlinks before installing instructions", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.AGENTS_MD_PROJECT_DIR = home;
    await writeFile(join(home, "AGENTS.md"), "# project instructions\n", "utf8");
    await writeFile(join(outside, "private-bak.md"), "# private backup\n", "utf8");
    await writeFile(join(outside, "private-tmp.md"), "# private temp\n", "utf8");

    await symlink(join(outside, "private-bak.md"), join(home, "AGENTS.md.bak"));
    await expect(installAgentsMdInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await rm(join(home, "AGENTS.md.bak"));

    await symlink(join(outside, "private-tmp.md"), join(home, "AGENTS.md.tmp"));
    await expect(installAgentsMdInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);

    await expect(readFile(join(outside, "private-bak.md"), "utf8")).resolves.toBe("# private backup\n");
    await expect(readFile(join(outside, "private-tmp.md"), "utf8")).resolves.toBe("# private temp\n");
  });

  it("constrains explicit instruction paths to the project boundary", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideInstructionsPath = join(outside, "AGENTS.md");

    process.chdir(home);
    await expect(installAgentsMdInstructions(outsideInstructionsPath)).rejects.toThrow(/outside/u);
    await expect(installAgentsMdInstructions(outsideInstructionsPath, { projectDir: home })).rejects.toThrow(
      /outside/u,
    );
    await expect(uninstallAgentsMdInstructions(outsideInstructionsPath, { projectDir: home })).rejects.toThrow(
      /outside/u,
    );

    const doctor = await doctorAgentsMdInstructions(outsideInstructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
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

    await expect(installAgentsMdInstructions(linkedInstructionsPath, { projectDir: home })).rejects.toThrow(
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

    const installed = await installAgentsMdInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, "AGENTS.md"));
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toContain("agents-md");
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installAgentsMdInstructions(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["agents-md"].instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(report.integrations["agents-md"].status).toBe("ok");
    expect(report.integrations["agents-md"].hasTokenjuiceMarker).toBe(true);
  });

  it("does not count an unsafe uninstalled AGENTS.md as installed", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await writeFile(join(outside, "private.md"), "# private instructions\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, "AGENTS.md"));

    const doctor = await doctorAgentsMdInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });
});
