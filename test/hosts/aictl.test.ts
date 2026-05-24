import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAictlInstructions,
  doctorInstalledHooks,
  installAictlInstructions,
  uninstallAictlInstructions,
} from "../../src/index.js";
import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

const tempDirs: string[] = [];
const envKeys = [
  "ADAL_PROJECT_DIR",
  "AETHER_PROJECT_DIR",
  "AICTL_PROJECT_DIR",
  "AICTL_PROMPT_FILE",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-aictl-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

function setAggregateProjectEnv(projectDir: string): void {
  for (const key of envKeys) {
    if (key !== "AICTL_PROMPT_FILE") {
      process.env[key] = projectDir;
    }
  }
}

describe("aictl instructions", () => {
  it("installs a marker-delimited AICTL.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AICTL.md");

    const result = await installAictlInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:aictl begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("aictl");
    expect(instructions).toContain("AICTL.md");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).not.toContain("wrap --full");
  });

  it("backs up existing AICTL.md content before replacing its own block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AICTL.md");
    await installAictlInstructions(instructionsPath, { projectDir: home });
    const customPrompt = "# project prompt\n\n- keep this exactly\n\n";
    await writeFile(instructionsPath, customPrompt, "utf8");

    const result = await installAictlInstructions(instructionsPath, { projectDir: home });
    const removed = await uninstallAictlInstructions(instructionsPath, { projectDir: home });

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    expect(removed.removed).toBe(true);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toBe(customPrompt);
    await expect(readFile(instructionsPath, "utf8")).resolves.toBe(customPrompt);
  });

  it("does not create backups on idempotent reinstall", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AICTL.md");

    const first = await installAictlInstructions(instructionsPath, { projectDir: home });
    const second = await installAictlInstructions(instructionsPath, { projectDir: home });

    expect(first.backupPath).toBeUndefined();
    expect(second.backupPath).toBeUndefined();
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("<!-- tokenjuice:aictl begin -->");
    await expect(access(`${instructionsPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AICTL.md");

    await installAictlInstructions(instructionsPath, { projectDir: home });
    const installed = await doctorAictlInstructions(instructionsPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("prompt-file");

    const removed = await uninstallAictlInstructions(instructionsPath, { projectDir: home });
    const disabled = await doctorAictlInstructions(instructionsPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AICTL.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:aictl begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorAictlInstructions(instructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("uses AICTL_PROJECT_DIR for the default AICTL.md path", async () => {
    const home = await createTempDir();
    process.env.AICTL_PROJECT_DIR = home;

    const installed = await installAictlInstructions();
    const expectedInstructionsPath = join(home, "AICTL.md");
    const doctor = await doctorAictlInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it("uses AICTL_PROMPT_FILE for the configured prompt filename", async () => {
    const home = await createTempDir();
    process.env.AICTL_PROJECT_DIR = home;
    process.env.AICTL_PROMPT_FILE = "PROJECT-AI.md";

    const installed = await installAictlInstructions();
    const expectedInstructionsPath = join(home, "PROJECT-AI.md");
    const doctor = await doctorAictlInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    await expect(readFile(expectedInstructionsPath, "utf8")).resolves.toContain("tokenjuice:aictl begin");
  });

  it("rejects unsafe AICTL_PROMPT_FILE values", async () => {
    const home = await createTempDir();
    process.env.AICTL_PROJECT_DIR = home;
    process.env.AICTL_PROMPT_FILE = "../AICTL.md";

    await expect(installAictlInstructions()).rejects.toThrow(/AICTL_PROMPT_FILE must be a project-local filename/u);
    await expect(doctorAictlInstructions()).resolves.toMatchObject({
      status: "broken",
      issues: [expect.stringContaining("AICTL_PROMPT_FILE must be a project-local filename")],
    });
  });

  it("rejects symlinked AICTL.md files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.AICTL_PROJECT_DIR = home;
    await writeFile(join(outside, "private.md"), "# private context\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, "AICTL.md"));

    await expect(installAictlInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, "AICTL.md.bak"))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorAictlInstructions();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
  });

  it("rejects sidecar symlinks before installing instructions", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const instructionsPath = join(home, "AICTL.md");
    process.env.AICTL_PROJECT_DIR = home;
    await writeFile(instructionsPath, "# project context\n", "utf8");
    await writeFile(join(outside, "private-bak.md"), "# private backup\n", "utf8");
    await writeFile(join(outside, "private-tmp.md"), "# private temp\n", "utf8");

    await symlink(join(outside, "private-bak.md"), `${instructionsPath}.bak`);
    await expect(installAictlInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await rm(`${instructionsPath}.bak`);

    await symlink(join(outside, "private-tmp.md"), `${instructionsPath}.tmp`);
    await expect(installAictlInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);

    await expect(readFile(join(outside, "private-bak.md"), "utf8")).resolves.toBe("# private backup\n");
    await expect(readFile(join(outside, "private-tmp.md"), "utf8")).resolves.toBe("# private temp\n");
  });

  it("constrains explicit instruction paths to the project boundary", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideInstructionsPath = join(outside, "AICTL.md");

    process.chdir(home);
    await expect(installAictlInstructions(outsideInstructionsPath)).rejects.toThrow(/outside/u);
    await expect(installAictlInstructions(outsideInstructionsPath, { projectDir: home })).rejects.toThrow(/outside/u);
    await expect(uninstallAictlInstructions(outsideInstructionsPath, { projectDir: home })).rejects.toThrow(/outside/u);

    const doctor = await doctorAictlInstructions(outsideInstructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("outside");
    expect(doctor.fixCommand).toContain("project-local aictl prompt file path");
    await expect(access(outsideInstructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects explicit instruction paths under symlinked parents inside or outside projectDir", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const linkedOutsideDir = join(home, "linked-outside");
    const linkedInsideTarget = join(home, "redirected");
    const linkedInsideDir = join(home, "linked-inside");
    await mkdir(linkedInsideTarget, { recursive: true });
    await symlink(outside, linkedOutsideDir);
    await symlink(linkedInsideTarget, linkedInsideDir);

    await expect(installAictlInstructions(join(linkedOutsideDir, "AICTL.md"), { projectDir: home })).rejects.toThrow(
      /outside/u,
    );
    await expect(installAictlInstructions(join(linkedInsideDir, "AICTL.md"), { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(outside, "AICTL.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(linkedInsideTarget, "AICTL.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked project roots before writing default instructions", async () => {
    const home = await createTempDir();
    const links = await createTempDir();
    const linkedProjectDir = join(links, "project");
    await symlink(home, linkedProjectDir);

    await expect(installAictlInstructions(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(home, "AICTL.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked project parent directories before writing default instructions", async () => {
    const realParent = await createTempDir();
    const links = await createTempDir();
    const realProjectDir = join(realParent, "project");
    const linkedParent = join(links, "linked-parent");
    const linkedProjectDir = join(linkedParent, "project");
    await mkdir(realProjectDir, { recursive: true });
    await symlink(realParent, linkedParent);

    await expect(installAictlInstructions(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(realProjectDir, "AICTL.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not count an unsafe uninstalled AICTL.md as installed", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await writeFile(join(outside, "private.md"), "# private context\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, "AICTL.md"));

    const doctor = await doctorAictlInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("does not read unsafe AICTL.md paths for marker evidence", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await writeFile(
      join(outside, "private.md"),
      "<!-- tokenjuice:aictl begin -->\n# tokenjuice\n<!-- tokenjuice:aictl end -->\n",
      "utf8",
    );
    await symlink(join(outside, "private.md"), join(home, "AICTL.md"));

    const doctor = await doctorAictlInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("does not make aggregate doctor fail for an unrelated symlinked AICTL.md", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    setAggregateProjectEnv(home);
    await writeFile(join(outside, "shared-context.md"), "# shared aictl context\n", "utf8");
    await symlink(join(outside, "shared-context.md"), join(home, "AICTL.md"));

    const report = await doctorInstalledHooks();

    expect(report.integrations.aictl.status).toBe("broken");
    expect(report.integrations.aictl.hasTokenjuiceMarker).toBe(false);
    expect(report.status).toBe("disabled");
  });

  it("defaults to AICTL.md in the current working directory", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installAictlInstructions();
    const realNestedDir = await realpath(nestedDir);

    expect(installed.instructionsPath).toBe(join(realNestedDir, "AICTL.md"));
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    setAggregateProjectEnv(home);
    await installAictlInstructions(undefined, { projectDir: home });

    const report = await doctorInstalledHooks();

    expect(report.integrations.aictl.status).toBe("ok");
    expect(report.integrations.aictl.hasTokenjuiceMarker).toBe(true);
    expect(report.integrations.aictl.instructionsPath).toBe(join(home, "AICTL.md"));
  });
});
