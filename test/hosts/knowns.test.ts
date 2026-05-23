import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorKnownsInstructions,
  installKnownsInstructions,
  uninstallKnownsInstructions,
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
  "KNOWNS_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-knowns-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

describe("Knowns instructions", () => {
  it("installs a marker-delimited KNOWNS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "KNOWNS.md");

    const result = await installKnownsInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:knowns begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("Knowns");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).not.toContain("wrap --full");
  });

  it("backs up existing KNOWNS.md content before replacing its own block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "KNOWNS.md");
    await installKnownsInstructions(instructionsPath, { projectDir: home });
    await writeFile(instructionsPath, "# project context\n\n- keep this\n", "utf8");

    const result = await installKnownsInstructions(instructionsPath, { projectDir: home });

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("keep this");
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("<!-- tokenjuice:knowns begin -->");
  });

  it("does not overwrite existing KNOWNS.md backups", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "KNOWNS.md");
    await writeFile(instructionsPath, "# project context\n", "utf8");
    await writeFile(`${instructionsPath}.bak`, "older backup\n", "utf8");

    const result = await installKnownsInstructions(instructionsPath, { projectDir: home });

    expect(result.backupPath).toBe(`${instructionsPath}.bak.1`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toBe("older backup\n");
    await expect(readFile(`${instructionsPath}.bak.1`, "utf8")).resolves.toBe("# project context\n");
  });

  it("does not create backups for idempotent reinstalls", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "KNOWNS.md");

    await installKnownsInstructions(instructionsPath, { projectDir: home });
    const result = await installKnownsInstructions(instructionsPath, { projectDir: home });

    expect(result.backupPath).toBeUndefined();
    await expect(access(`${instructionsPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves markerless KNOWNS.md content during uninstall", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "KNOWNS.md");
    const userContext = "\n    indented first line\n\n# project context\n\n- keep this\n  \n";
    await writeFile(instructionsPath, userContext, "utf8");
    await installKnownsInstructions(instructionsPath, { projectDir: home });
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain(userContext);

    const removed = await uninstallKnownsInstructions(instructionsPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    await expect(readFile(instructionsPath, "utf8")).resolves.toBe(userContext);
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "KNOWNS.md");

    await installKnownsInstructions(instructionsPath, { projectDir: home });
    const installed = await doctorKnownsInstructions(instructionsPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallKnownsInstructions(instructionsPath, { projectDir: home });
    const disabled = await doctorKnownsInstructions(instructionsPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "KNOWNS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:knowns begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorKnownsInstructions(instructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("repairs duplicate tokenjuice blocks during install", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "KNOWNS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:knowns begin -->",
        "stale block",
        "<!-- tokenjuice:knowns end -->",
        "# project context",
        "<!-- tokenjuice:knowns begin -->",
        "another stale block",
        "<!-- tokenjuice:knowns end -->",
        "",
      ].join("\n"),
      "utf8",
    );

    await installKnownsInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions.split("<!-- tokenjuice:knowns begin -->")).toHaveLength(2);
    expect(instructions).toContain("# project context");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).not.toContain("stale block");
    expect(instructions).not.toContain("another stale block");
  });

  it("removes duplicate tokenjuice blocks during uninstall", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "KNOWNS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:knowns begin -->",
        "stale block",
        "<!-- tokenjuice:knowns end -->",
        "# project context",
        "<!-- tokenjuice:knowns begin -->",
        "another stale block",
        "<!-- tokenjuice:knowns end -->",
        "",
      ].join("\n"),
      "utf8",
    );

    const removed = await uninstallKnownsInstructions(instructionsPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    await expect(readFile(instructionsPath, "utf8")).resolves.toBe("# project context\n\n");
  });

  it("uses KNOWNS_PROJECT_DIR for the default KNOWNS.md path", async () => {
    const home = await createTempDir();
    process.env.KNOWNS_PROJECT_DIR = home;

    const installed = await installKnownsInstructions();
    const expectedInstructionsPath = join(home, "KNOWNS.md");
    const doctor = await doctorKnownsInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it("rejects symlinked KNOWNS.md files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.KNOWNS_PROJECT_DIR = home;
    await writeFile(join(outside, "private.md"), "# private context\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, "KNOWNS.md"));

    await expect(installKnownsInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, "KNOWNS.md.bak"))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorKnownsInstructions();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
  });

  it("rejects sidecar symlinks before installing instructions", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const instructionsPath = join(home, "KNOWNS.md");
    process.env.KNOWNS_PROJECT_DIR = home;
    await writeFile(instructionsPath, "# project context\n", "utf8");
    await writeFile(join(outside, "private-bak.md"), "# private backup\n", "utf8");
    await writeFile(join(outside, "private-tmp.md"), "# private temp\n", "utf8");

    await symlink(join(outside, "private-bak.md"), `${instructionsPath}.bak`);
    await expect(installKnownsInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await rm(`${instructionsPath}.bak`);

    await symlink(join(outside, "private-tmp.md"), `${instructionsPath}.tmp`);
    await expect(installKnownsInstructions()).rejects.toThrow(/will not read or write through instruction symlinks/u);

    await expect(readFile(join(outside, "private-bak.md"), "utf8")).resolves.toBe("# private backup\n");
    await expect(readFile(join(outside, "private-tmp.md"), "utf8")).resolves.toBe("# private temp\n");
  });

  it("constrains explicit instruction paths to the project boundary", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideInstructionsPath = join(outside, "KNOWNS.md");

    process.chdir(home);
    await expect(installKnownsInstructions(outsideInstructionsPath)).rejects.toThrow(/outside/u);
    await expect(installKnownsInstructions(outsideInstructionsPath, { projectDir: home })).rejects.toThrow(
      /outside/u,
    );
    await expect(uninstallKnownsInstructions(outsideInstructionsPath, { projectDir: home })).rejects.toThrow(
      /outside/u,
    );

    const doctor = await doctorKnownsInstructions(outsideInstructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("outside");
    expect(doctor.fixCommand).toContain("project-local KNOWNS.md path");
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

    await expect(installKnownsInstructions(join(linkedOutsideDir, "KNOWNS.md"), { projectDir: home })).rejects.toThrow(
      /outside/u,
    );
    await expect(installKnownsInstructions(join(linkedInsideDir, "KNOWNS.md"), { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(outside, "KNOWNS.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(linkedInsideTarget, "KNOWNS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked project roots before writing default instructions", async () => {
    const home = await createTempDir();
    const links = await createTempDir();
    const linkedProjectDir = join(links, "project");
    await symlink(home, linkedProjectDir);

    await expect(installKnownsInstructions(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(home, "KNOWNS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked project parent directories before writing default instructions", async () => {
    const realParent = await createTempDir();
    const links = await createTempDir();
    const realProjectDir = join(realParent, "project");
    const linkedParent = join(links, "linked-parent");
    const linkedProjectDir = join(linkedParent, "project");
    await mkdir(realProjectDir, { recursive: true });
    await symlink(realParent, linkedParent);

    await expect(installKnownsInstructions(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(realProjectDir, "KNOWNS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not count an unsafe uninstalled KNOWNS.md as installed", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await writeFile(join(outside, "private.md"), "# private context\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, "KNOWNS.md"));

    const doctor = await doctorKnownsInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("does not read unsafe KNOWNS.md paths for marker evidence", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await writeFile(
      join(outside, "private.md"),
      "<!-- tokenjuice:knowns begin -->\n# tokenjuice\n<!-- tokenjuice:knowns end -->\n",
      "utf8",
    );
    await symlink(join(outside, "private.md"), join(home, "KNOWNS.md"));

    const doctor = await doctorKnownsInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("does not make aggregate doctor fail for an unrelated symlinked KNOWNS.md", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await writeFile(join(outside, "shared-context.md"), "# shared Knowns context\n", "utf8");
    await symlink(join(outside, "shared-context.md"), join(home, "KNOWNS.md"));

    const report = await doctorInstalledHooks();

    expect(report.integrations.knowns.status).toBe("broken");
    expect(report.integrations.knowns.hasTokenjuiceMarker).toBe(false);
    expect(report.status).toBe("disabled");
  });

  it("defaults to the git root KNOWNS.md from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installKnownsInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, "KNOWNS.md"));
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installKnownsInstructions(undefined, { projectDir: home });

    const report = await doctorInstalledHooks();

    expect(report.integrations.knowns.status).toBe("ok");
    expect(report.integrations.knowns.hasTokenjuiceMarker).toBe(true);
    expect(report.integrations.knowns.instructionsPath).toBe(join(home, "KNOWNS.md"));
  });
});
