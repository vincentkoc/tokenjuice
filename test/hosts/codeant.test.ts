import { access, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorCodeAntInstructions,
  doctorInstalledHooks,
  installCodeAntInstructions,
  uninstallCodeAntInstructions,
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-codeant-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

async function readInstructions(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

describe("CodeAnt instructions", () => {
  it("installs CodeAnt review instructions", async () => {
    const home = await createTempDir();
    const result = await installCodeAntInstructions(undefined, { projectDir: home });
    const instructionsPath = join(home, ".codeant", "instructions.json");
    const config = await readInstructions(instructionsPath);
    const instructions = config.instructions as Array<Record<string, unknown>>;

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(instructions).toHaveLength(1);
    expect(instructions[0]?.id).toBe("tokenjuice-terminal-output-compaction");
    expect(instructions[0]?.description).toContain("tokenjuice wrap -- <command>");
    expect(instructions[0]?.description).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions[0]?.description).not.toContain("wrap --full");
    expect(instructions[0]?.files).toEqual(["**/*"]);
    expect(instructions[0]?.scope).toEqual(["ide", "pr"]);
  });

  it("preserves existing instructions and backs up the file", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".codeant", "instructions.json");
    await mkdir(join(home, ".codeant"), { recursive: true });
    await writeFile(
      instructionsPath,
      JSON.stringify({ instructions: [{ id: "team-rule", description: "keep team rule", files: ["src/**"] }] }, null, 2),
      "utf8",
    );

    const result = await installCodeAntInstructions(undefined, { projectDir: home });
    const config = await readInstructions(instructionsPath);
    const instructions = config.instructions as Array<Record<string, unknown>>;

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    expect(instructions.map((instruction) => instruction.id)).toEqual([
      "team-rule",
      "tokenjuice-terminal-output-compaction",
    ]);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("team-rule");
  });

  it("replaces stale tokenjuice instructions without duplicating them", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".codeant", "instructions.json");
    await mkdir(join(home, ".codeant"), { recursive: true });
    await writeFile(
      instructionsPath,
      JSON.stringify({
        instructions: [
          { id: "tokenjuice-terminal-output-compaction", description: "stale", files: ["src/**"], scope: ["ide"] },
        ],
      }),
      "utf8",
    );

    await installCodeAntInstructions(undefined, { projectDir: home });
    const config = await readInstructions(instructionsPath);
    const instructions = config.instructions as Array<Record<string, unknown>>;

    expect(instructions).toHaveLength(1);
    expect(instructions[0]?.description).toContain("tokenjuice wrap -- <command>");
    expect(instructions[0]?.files).toEqual(["**/*"]);
    expect(instructions[0]?.scope).toEqual(["ide", "pr"]);
  });

  it("reports stale tokenjuice instructions with missing scope", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".codeant", "instructions.json");
    await mkdir(join(home, ".codeant"), { recursive: true });
    await writeFile(
      instructionsPath,
      JSON.stringify({
        instructions: [
          {
            id: "tokenjuice-terminal-output-compaction",
            description: "tokenjuice wrap -- <command> and tokenjuice wrap --raw -- <command>",
            files: ["**/*"],
            scope: ["pr"],
          },
        ],
      }),
      "utf8",
    );

    const doctor = await doctorCodeAntInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured CodeAnt instructions are missing IDE review scope");
  });

  it("reports installed, disabled, and uninstalled health", async () => {
    const home = await createTempDir();

    await installCodeAntInstructions(undefined, { projectDir: home });
    const installed = await doctorCodeAntInstructions(undefined, { projectDir: home });
    const removed = await uninstallCodeAntInstructions(undefined, { projectDir: home });
    const disabled = await doctorCodeAntInstructions(undefined, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("instructions-based");
    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(join(home, ".codeant", "instructions.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves user-owned instructions on uninstall", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".codeant", "instructions.json");
    await mkdir(join(home, ".codeant"), { recursive: true });
    await writeFile(
      instructionsPath,
      JSON.stringify({ instructions: [{ id: "team-rule", description: "keep team rule", files: ["src/**"] }] }, null, 2),
      "utf8",
    );

    const removed = await uninstallCodeAntInstructions(undefined, { projectDir: home });
    const config = await readInstructions(instructionsPath);

    expect(removed.removed).toBe(false);
    expect(config).toMatchObject({ instructions: [{ id: "team-rule" }] });
  });

  it("reports malformed JSON as broken", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".codeant", "instructions.json");
    await mkdir(join(home, ".codeant"), { recursive: true });
    await writeFile(instructionsPath, "{ nope", "utf8");

    await expect(installCodeAntInstructions(undefined, { projectDir: home })).rejects.toThrow(/cannot parse CodeAnt/u);
    const doctor = await doctorCodeAntInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("cannot parse CodeAnt");
  });

  it("reports unsupported instructions shape as broken", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".codeant", "instructions.json");
    await mkdir(join(home, ".codeant"), { recursive: true });
    await writeFile(instructionsPath, JSON.stringify({ instructions: { id: "team-rule" } }), "utf8");

    await expect(installCodeAntInstructions(undefined, { projectDir: home })).rejects.toThrow(/expected instructions to be an array/u);
    const doctor = await doctorCodeAntInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("expected instructions to be an array");
  });

  it("reports unsupported instruction entries as broken", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".codeant", "instructions.json");
    await mkdir(join(home, ".codeant"), { recursive: true });
    await writeFile(instructionsPath, JSON.stringify({ instructions: [null] }), "utf8");

    await expect(installCodeAntInstructions(undefined, { projectDir: home })).rejects.toThrow(/expected every instruction/u);
    const doctor = await doctorCodeAntInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("expected every instruction");
  });

  it("uses CODEANT_PROJECT_DIR for the default project", async () => {
    const home = await createTempDir();
    process.env.CODEANT_PROJECT_DIR = home;

    const installed = await installCodeAntInstructions();
    const doctor = await doctorCodeAntInstructions();

    expect(installed.instructionsPath).toBe(join(home, ".codeant", "instructions.json"));
    expect(doctor.status).toBe("ok");
  });

  it("rejects symlinked instructions files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await mkdir(join(home, ".codeant"), { recursive: true });
    await mkdir(join(outside, ".codeant"), { recursive: true });
    await writeFile(join(outside, ".codeant", "instructions.json"), "{}", "utf8");
    await symlink(join(outside, ".codeant", "instructions.json"), join(home, ".codeant", "instructions.json"));

    await expect(installCodeAntInstructions(undefined, { projectDir: home })).rejects.toThrow(/instruction symlinks/u);
    const doctor = await doctorCodeAntInstructions(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(doctor.issues[0]).toContain("instruction symlinks");
  });

  it("surfaces unsafe CodeAnt instruction paths in aggregate doctor without reading them", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await mkdir(join(home, ".codeant"), { recursive: true });
    await writeFile(join(outside, "instructions.json"), "{}", "utf8");
    await symlink(join(outside, "instructions.json"), join(home, ".codeant", "instructions.json"));

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.status).toBe("broken");
    expect(report.integrations.codeant.status).toBe("broken");
    expect(report.integrations.codeant.hasTokenjuiceMarker).toBe(false);
    expect(report.integrations.codeant.hasUnsafePathIssue).toBe(true);
  });

  it("rejects symlinked instruction directories before reading or writing", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await symlink(outside, join(home, ".codeant"), "dir");

    await expect(installCodeAntInstructions(undefined, { projectDir: home })).rejects.toThrow(/instruction symlinks/u);
    await expect(doctorCodeAntInstructions(undefined, { projectDir: home })).resolves.toMatchObject({
      status: "disabled",
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: false,
      issues: ["tokenjuice CodeAnt instructions are not installed"],
    });
  });

  it("rejects symlinked project roots", async () => {
    const realProject = await createTempDir();
    const linkParent = await createTempDir();
    const linkedProject = join(linkParent, "project-link");
    await symlink(realProject, linkedProject, "dir");

    await expect(installCodeAntInstructions(undefined, { projectDir: linkedProject })).rejects.toThrow(/instruction symlinks/u);
    await expect(doctorCodeAntInstructions(undefined, { projectDir: linkedProject })).resolves.toMatchObject({
      status: "disabled",
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: false,
      issues: ["tokenjuice CodeAnt instructions are not installed"],
    });
  });

  it("does not fail aggregate doctor for missing default instructions under symlinked roots", async () => {
    const realProject = await createTempDir();
    const linkParent = await createTempDir();
    const linkedProject = join(linkParent, "project-link");
    await symlink(realProject, linkedProject, "dir");
    for (const key of envKeys) {
      process.env[key] = linkedProject;
    }

    const report = await doctorInstalledHooks({ projectDir: linkedProject });

    expect(report.integrations.codeant.status).toBe("disabled");
    expect(report.integrations.codeant.hasTokenjuiceMarker).toBe(false);
    expect(report.integrations.codeant.hasUnsafePathIssue).toBe(false);
  });

  it("rejects explicit instruction paths outside the project-local CodeAnt file", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "instructions.json");

    await expect(installCodeAntInstructions(instructionsPath, { projectDir: home })).rejects.toThrow(/only installs the project-local/u);
    await expect(doctorCodeAntInstructions(instructionsPath, { projectDir: home })).resolves.toMatchObject({
      status: "broken",
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: true,
      issues: [expect.stringContaining("only installs the project-local")],
    });
  });

  it("preflights backup symlinks before writing instructions", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const instructionsPath = join(home, ".codeant", "instructions.json");
    await mkdir(join(home, ".codeant"), { recursive: true });
    await writeFile(instructionsPath, "{}", "utf8");
    await writeFile(join(outside, "instructions.json.bak"), "outside\n", "utf8");
    await symlink(join(outside, "instructions.json.bak"), `${instructionsPath}.bak`);

    await expect(installCodeAntInstructions(undefined, { projectDir: home })).rejects.toThrow(/will not write through instruction symlinks/u);
    await expect(readFile(instructionsPath, "utf8")).resolves.toBe("{}");
  });

  it("uses the current git root when no project dir is configured", async () => {
    const home = await createTempDir();
    const nested = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });
    process.chdir(nested);

    const installed = await installCodeAntInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, ".codeant", "instructions.json"));
  });

  it("includes CodeAnt in aggregate doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installCodeAntInstructions(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.codeant.instructionsPath).toBe(join(home, ".codeant", "instructions.json"));
    expect(report.integrations.codeant.status).toBe("ok");
    expect(report.integrations.codeant.hasTokenjuiceMarker).toBe(true);
  });

  it("does not treat user-owned CodeAnt instructions as aggregate installed", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await mkdir(join(home, ".codeant"), { recursive: true });
    await writeFile(join(home, ".codeant", "instructions.json"), JSON.stringify({ instructions: [] }), "utf8");

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.codeant.status).toBe("disabled");
    expect(report.integrations.codeant.hasTokenjuiceMarker).toBe(false);
    expect(report.integrations.codeant.hasUnsafePathIssue).toBe(false);
  });
});
