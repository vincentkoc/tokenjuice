import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorCharlieInstructions,
  doctorInstalledHooks,
  installCharlieInstructions,
  uninstallCharlieInstructions,
} from "../../src/index.js";

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
  "BAZ_PROJECT_DIR",
  "BITO_PROJECT_DIR",
  "BOB_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
  "CAGENT_PROJECT_DIR",
  "CHARLIE_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEANT_PROJECT_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEBUFF_PROJECT_DIR",
  "CODEGEN_PROJECT_DIR",
  "CODER_AGENTS_PROJECT_DIR",
  "CODERABBIT_PROJECT_DIR",
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
  "GREPTILE_PROJECT_DIR",
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
  "QODO_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-charlie-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("Charlie instructions", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:charlie begin -->/gu)?.length ?? 0;
  }

  it("installs a host-specific marker-delimited AGENTS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    const result = await installCharlieInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:charlie begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("When running terminal commands through Charlie");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
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
        "<!-- tokenjuice:ona begin -->",
        "## tokenjuice terminal output compaction",
        "- When running terminal commands through Ona Agent, prefer `tokenjuice wrap -- <command>`.",
        "<!-- tokenjuice:ona end -->",
      ].join("\n"),
      "utf8",
    );

    await installCharlieInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("<!-- tokenjuice:ona begin -->");
    expect(instructions).toContain("When running terminal commands through Ona Agent");
    expect(instructions).toContain("<!-- tokenjuice:charlie begin -->");
    expect(instructions).toContain("When running terminal commands through Charlie");
  });

  it("preserves existing instructions and backs them up", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installCharlieInstructions(instructionsPath, { projectDir: home });
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installCharlieInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:charlie begin -->");
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
        "<!-- tokenjuice:charlie begin -->",
        "stale tokenjuice block",
        "<!-- tokenjuice:charlie end -->",
      ].join("\n"),
      "utf8",
    );

    await installCharlieInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    await installCharlieInstructions(instructionsPath, { projectDir: home });
    const installed = await doctorCharlieInstructions(instructionsPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.hasUnsafePathIssue).toBe(false);
    expect(installed.advisories[0]).toContain("AGENTS.md-based");

    const removed = await uninstallCharlieInstructions(instructionsPath, { projectDir: home });
    const disabled = await doctorCharlieInstructions(instructionsPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:charlie begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorCharlieInstructions(instructionsPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("leaves unrelated AGENTS.md content untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const removed = await uninstallCharlieInstructions(instructionsPath, { projectDir: home });
    const instructions = await readFile(instructionsPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(instructions).toBe("# project instructions\n\n- keep this\n");
  });

  it("uses CHARLIE_PROJECT_DIR for the default AGENTS.md path", async () => {
    const home = await createTempDir();
    process.env.CHARLIE_PROJECT_DIR = home;

    const installed = await installCharlieInstructions();
    const expectedInstructionsPath = join(home, "AGENTS.md");
    const doctor = await doctorCharlieInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("defaults to the git root AGENTS.md from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installCharlieInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, "AGENTS.md"));
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toContain("Charlie");
  });

  it("rejects default AGENTS.md symlinks", async () => {
    const home = await createTempDir();
    const target = join(home, "outside.md");
    await writeFile(target, "# outside\n", "utf8");
    await symlink(target, join(home, "AGENTS.md"));
    process.env.CHARLIE_PROJECT_DIR = home;

    await expect(installCharlieInstructions()).rejects.toThrow("instruction symlinks");
  });

  it("rejects explicit paths outside the project", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();

    await expect(installCharlieInstructions(join(outside, "AGENTS.md"), { projectDir: home })).rejects.toThrow(
      "outside",
    );
  });

  it("rejects explicit project subdirectory AGENTS.md paths", async () => {
    const home = await createTempDir();
    const nested = join(home, "docs");
    await mkdir(nested, { recursive: true });

    await expect(installCharlieInstructions(join(nested, "AGENTS.md"), { projectDir: home })).rejects.toThrow(
      "project-local AGENTS.md",
    );
  });

  it("rejects symlinked project roots", async () => {
    const home = await createTempDir();
    const link = join(await createTempDir(), "workspace");
    await symlink(home, link);

    await expect(installCharlieInstructions(undefined, { projectDir: link })).rejects.toThrow("instruction symlinks");
    await expect(doctorCharlieInstructions(undefined, { projectDir: link })).resolves.toMatchObject({
      status: "disabled",
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: false,
      issues: ["tokenjuice Charlie instructions are not installed"],
    });
  });

  it("does not fail aggregate doctor for missing default AGENTS.md under symlinked roots", async () => {
    const home = await createTempDir();
    const link = join(await createTempDir(), "workspace");
    await symlink(home, link);
    for (const key of envKeys) {
      process.env[key] = link;
    }

    const report = await doctorInstalledHooks({ projectDir: link });

    expect(report.integrations.charlie.status).toBe("disabled");
    expect(report.integrations.charlie.hasTokenjuiceMarker).toBe(false);
    expect(report.integrations.charlie.hasUnsafePathIssue).toBe(false);
  });

  it("reports unsafe Charlie paths without reading the rejected file", async () => {
    const home = await createTempDir();
    const target = join(home, "outside.md");
    await writeFile(target, "<!-- tokenjuice:charlie begin -->\npoison\n<!-- tokenjuice:charlie end -->\n", "utf8");
    await symlink(target, join(home, "AGENTS.md"));
    process.env.CHARLIE_PROJECT_DIR = home;

    const doctor = await doctorCharlieInstructions();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(doctor.issues[0]).toContain("instruction symlinks");
    expect(doctor.issues.join("\n")).not.toContain("poison");

    for (const key of envKeys) {
      process.env[key] = home;
    }
    const aggregate = await doctorInstalledHooks({ projectDir: home });
    expect(aggregate.status).toBe("disabled");
    expect(aggregate.integrations.charlie.status).toBe("broken");
    expect(aggregate.integrations.charlie.hasTokenjuiceMarker).toBe(false);
  });

  it("rejects symlinked install sidecars", async () => {
    const home = await createTempDir();
    const backupTarget = join(home, "backup-target.md");
    await writeFile(backupTarget, "# backup target\n", "utf8");
    await symlink(backupTarget, join(home, "AGENTS.md.bak"));

    await expect(installCharlieInstructions(undefined, { projectDir: home })).rejects.toThrow("instruction symlinks");
  });

  it("reports charlie in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installCharlieInstructions(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.charlie.instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(report.integrations.charlie.status).toBe("ok");
  });

  it("removes the default AGENTS.md when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.CHARLIE_PROJECT_DIR = home;
    const instructionsPath = join(home, "AGENTS.md");

    await installCharlieInstructions();
    await uninstallCharlieInstructions(instructionsPath);

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
