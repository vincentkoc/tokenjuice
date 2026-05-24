import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorLeanCtlInstructions,
  installLeanCtlInstructions,
  uninstallLeanCtlInstructions,
} from "../../src/index.js";
import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-leanctl-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

describe("LeanCTL instructions", () => {
  it("installs project instructions with tokenjuice guidance", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".leanctl", "instructions.md");

    const result = await installLeanCtlInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("tokenjuice:leanctl-instructions");
    expect(instructions).toContain("# tokenjuice terminal output compaction");
    expect(instructions).toContain("LeanCTL");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).toContain(".leanctl/instructions.md");
    expect(instructions).not.toContain("wrap --full");
  });

  it("backs up existing project instructions before replacing them", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".leanctl", "instructions.md");
    await installLeanCtlInstructions(instructionsPath, { projectDir: home });
    await writeFile(instructionsPath, "custom local instructions\n", "utf8");

    const result = await installLeanCtlInstructions(instructionsPath, { projectDir: home });

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toBe("custom local instructions\n");
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("LeanCTL loads this file");
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("tokenjuice:leanctl-restore-backup=.bak");
  });

  it("does not overwrite existing instruction backups", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".leanctl", "instructions.md");
    await mkdir(join(home, ".leanctl"), { recursive: true });
    await writeFile(instructionsPath, "custom local instructions\n", "utf8");
    await writeFile(`${instructionsPath}.bak`, "older backup\n", "utf8");

    const result = await installLeanCtlInstructions(instructionsPath, { projectDir: home });

    expect(result.backupPath).toBe(`${instructionsPath}.bak.1`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toBe("older backup\n");
    await expect(readFile(`${instructionsPath}.bak.1`, "utf8")).resolves.toBe("custom local instructions\n");
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("tokenjuice:leanctl-restore-backup=.bak.1");
  });

  it("does not create backups for idempotent reinstalls", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".leanctl", "instructions.md");

    await installLeanCtlInstructions(instructionsPath, { projectDir: home });
    const result = await installLeanCtlInstructions(instructionsPath, { projectDir: home });

    expect(result.backupPath).toBeUndefined();
    await expect(access(`${instructionsPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores a backed-up custom instruction file on uninstall", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".leanctl", "instructions.md");
    await mkdir(join(home, ".leanctl"), { recursive: true });
    await writeFile(instructionsPath, "custom local instructions\n", "utf8");
    await writeFile(`${instructionsPath}.bak`, "older backup\n", "utf8");

    const installed = await installLeanCtlInstructions(instructionsPath, { projectDir: home });
    const removed = await uninstallLeanCtlInstructions(instructionsPath, { projectDir: home });

    expect(installed.backupPath).toBe(`${instructionsPath}.bak.1`);
    expect(removed.removed).toBe(true);
    await expect(readFile(instructionsPath, "utf8")).resolves.toBe("custom local instructions\n");
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toBe("older backup\n");
    await expect(access(`${instructionsPath}.bak.1`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked restore backups during uninstall", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const instructionsPath = join(home, ".leanctl", "instructions.md");
    const outsideTarget = join(outside, "instructions.md");
    await mkdir(join(home, ".leanctl"), { recursive: true });
    await writeFile(instructionsPath, "custom local instructions\n", "utf8");
    await writeFile(outsideTarget, "outside restore target\n", "utf8");
    await installLeanCtlInstructions(instructionsPath, { projectDir: home });
    await rm(`${instructionsPath}.bak`);
    await symlink(outsideTarget, `${instructionsPath}.bak`);

    await expect(uninstallLeanCtlInstructions(instructionsPath, { projectDir: home })).rejects.toThrow(
      "tokenjuice will not read or write through instruction symlinks",
    );
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("tokenjuice terminal output compaction");
    await expect(readFile(outsideTarget, "utf8")).resolves.toBe("outside restore target\n");
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".leanctl", "instructions.md");

    await installLeanCtlInstructions(instructionsPath, { projectDir: home });
    const installed = await doctorLeanCtlInstructions(instructionsPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallLeanCtlInstructions(instructionsPath, { projectDir: home });
    const disabled = await doctorLeanCtlInstructions(instructionsPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("leaves markerless project instructions untouched during uninstall", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".leanctl", "instructions.md");
    await mkdir(join(home, ".leanctl"), { recursive: true });
    await writeFile(instructionsPath, "# tokenjuice terminal output compaction\nmanual project note\n", "utf8");

    const removed = await uninstallLeanCtlInstructions(instructionsPath, { projectDir: home });
    const doctor = await doctorLeanCtlInstructions(instructionsPath, { projectDir: home });

    expect(removed.removed).toBe(false);
    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    await expect(readFile(instructionsPath, "utf8")).resolves.toBe(
      "# tokenjuice terminal output compaction\nmanual project note\n",
    );
  });

  it("reports broken instructions when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".leanctl", "instructions.md");
    await mkdir(join(home, ".leanctl"), { recursive: true });
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:leanctl-instructions -->",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorLeanCtlInstructions(instructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured LeanCTL instructions are missing the raw escape hatch");
    expect(doctor.issues).toContain("configured LeanCTL instructions are missing project instruction path guidance");
    expect(doctor.issues).toContain("configured LeanCTL instructions still suggest the full escape hatch");
  });

  it("uses LEANCTL_PROJECT_DIR for the default project instructions", async () => {
    const home = await createTempDir();
    process.env.LEANCTL_PROJECT_DIR = home;

    const installed = await installLeanCtlInstructions();
    const expectedInstructionsPath = join(home, ".leanctl", "instructions.md");
    const doctor = await doctorLeanCtlInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it("rejects symlinked instructions files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const instructionsPath = join(home, ".leanctl", "instructions.md");
    process.env.LEANCTL_PROJECT_DIR = home;
    await mkdir(join(home, ".leanctl"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# private instructions\n", "utf8");
    await symlink(join(outside, "private.md"), instructionsPath);

    await expect(installLeanCtlInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(`${instructionsPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorLeanCtlInstructions();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
  });

  it("rejects sidecar symlinks before installing instructions", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const instructionsPath = join(home, ".leanctl", "instructions.md");
    process.env.LEANCTL_PROJECT_DIR = home;
    await mkdir(join(home, ".leanctl"), { recursive: true });
    await writeFile(instructionsPath, "# project instructions\n", "utf8");
    await writeFile(join(outside, "private-bak.md"), "# private backup\n", "utf8");
    await writeFile(join(outside, "private-tmp.md"), "# private temp\n", "utf8");

    await symlink(join(outside, "private-bak.md"), `${instructionsPath}.bak`);
    await expect(installLeanCtlInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await rm(`${instructionsPath}.bak`);

    await symlink(join(outside, "private-tmp.md"), `${instructionsPath}.tmp`);
    await expect(installLeanCtlInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);

    await expect(readFile(join(outside, "private-bak.md"), "utf8")).resolves.toBe("# private backup\n");
    await expect(readFile(join(outside, "private-tmp.md"), "utf8")).resolves.toBe("# private temp\n");
  });

  it("constrains explicit instruction paths to the project boundary", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideInstructionsPath = join(outside, ".leanctl", "instructions.md");

    process.chdir(home);
    await expect(installLeanCtlInstructions(outsideInstructionsPath)).rejects.toThrow(/outside/u);
    await expect(installLeanCtlInstructions(outsideInstructionsPath, { projectDir: home })).rejects.toThrow(
      /outside/u,
    );
    await expect(uninstallLeanCtlInstructions(outsideInstructionsPath, { projectDir: home })).rejects.toThrow(
      /outside/u,
    );

    const doctor = await doctorLeanCtlInstructions(outsideInstructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("outside");
    expect(doctor.fixCommand).toContain("project-local .leanctl/instructions.md path");
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

    await expect(
      installLeanCtlInstructions(join(linkedOutsideDir, "instructions.md"), { projectDir: home }),
    ).rejects.toThrow(/outside/u);
    await expect(
      installLeanCtlInstructions(join(linkedInsideDir, "instructions.md"), { projectDir: home }),
    ).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(outside, "instructions.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(linkedInsideTarget, "instructions.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked project roots before writing default instructions", async () => {
    const home = await createTempDir();
    const links = await createTempDir();
    const linkedProjectDir = join(links, "project");
    await symlink(home, linkedProjectDir);

    await expect(installLeanCtlInstructions(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(home, ".leanctl", "instructions.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked project parent directories before writing default instructions", async () => {
    const realParent = await createTempDir();
    const links = await createTempDir();
    const realProjectDir = join(realParent, "project");
    const linkedParent = join(links, "linked-parent");
    const linkedProjectDir = join(linkedParent, "project");
    await mkdir(realProjectDir, { recursive: true });
    await symlink(realParent, linkedParent);

    await expect(installLeanCtlInstructions(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(realProjectDir, ".leanctl", "instructions.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not count an unsafe uninstalled instructions file as installed", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await mkdir(join(home, ".leanctl"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# private instructions\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".leanctl", "instructions.md"));

    const doctor = await doctorLeanCtlInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("does not read unsafe instructions paths for marker evidence", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await mkdir(join(home, ".leanctl"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# tokenjuice terminal output compaction\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".leanctl", "instructions.md"));

    const doctor = await doctorLeanCtlInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("defaults to the git root .leanctl instructions from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installLeanCtlInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, ".leanctl", "instructions.md"));
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installLeanCtlInstructions(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.leanctl.status).toBe("ok");
    expect(report.integrations.leanctl.hasTokenjuiceMarker).toBe(true);
    expect(report.integrations.leanctl.instructionsPath).toBe(join(home, ".leanctl", "instructions.md"));
  });
});
