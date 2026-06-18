import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorMcpAgentDefinition,
  installMcpAgentDefinition,
  uninstallMcpAgentDefinition,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "ADAL_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-mcp-agent-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("mcp-agent definition", () => {
  it("installs an agent definition with tokenjuice guidance", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");

    const result = await installMcpAgentDefinition(agentPath, { projectDir: home });
    const definition = await readFile(agentPath, "utf8");

    expect(result.agentPath).toBe(agentPath);
    expect(result.backupPath).toBeUndefined();
    expect(definition).toContain("name: tokenjuice");
    expect(definition).toContain("<!-- tokenjuice:mcp-agent -->");
    expect(definition).toContain("tokenjuice mcp-agent terminal output compaction");
    expect(definition).toContain("mcp-agent workflow");
    expect(definition).toContain("tokenjuice wrap -- <command>");
    expect(definition).toContain("tokenjuice wrap --raw -- <command>");
    expect(definition).toContain(".mcp-agent/agents");
    expect(definition).toContain("agents.search_paths");
    expect(definition).not.toContain("wrap --full");
  });

  it("backs up an existing agent definition before replacing it", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");
    await installMcpAgentDefinition(agentPath, { projectDir: home });
    await writeFile(agentPath, "custom mcp-agent definition\n", "utf8");

    const result = await installMcpAgentDefinition(agentPath, { projectDir: home });

    expect(result.backupPath).toBe(`${agentPath}.bak`);
    await expect(readFile(`${agentPath}.bak`, "utf8")).resolves.toBe("custom mcp-agent definition\n");
    await expect(readFile(agentPath, "utf8")).resolves.toContain("tokenjuice wrap --raw -- <command>");
    await expect(readFile(agentPath, "utf8")).resolves.toContain("<!-- tokenjuice:mcp-agent-restore-backup=.bak -->");
  });

  it("restores a backed-up custom agent definition on uninstall", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");
    await mkdir(join(home, ".mcp-agent", "agents"), { recursive: true });
    await writeFile(agentPath, "custom mcp-agent definition\n", "utf8");
    await installMcpAgentDefinition(agentPath, { projectDir: home });

    const removed = await uninstallMcpAgentDefinition(agentPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    await expect(readFile(agentPath, "utf8")).resolves.toBe("custom mcp-agent definition\n");
    await expect(access(`${agentPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked restore backups on uninstall", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");
    await mkdir(join(home, ".mcp-agent", "agents"), { recursive: true });
    await writeFile(agentPath, "custom mcp-agent definition\n", "utf8");
    await writeFile(join(outside, "private-backup.md"), "outside backup\n", "utf8");
    await installMcpAgentDefinition(agentPath, { projectDir: home });
    await rm(`${agentPath}.bak`);
    await symlink(join(outside, "private-backup.md"), `${agentPath}.bak`);

    await expect(uninstallMcpAgentDefinition(agentPath, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(readFile(agentPath, "utf8")).resolves.toContain("tokenjuice:mcp-agent-restore-backup=.bak");
    await expect(readFile(join(outside, "private-backup.md"), "utf8")).resolves.toBe("outside backup\n");
  });

  it("restores the backup created by install when an older backup already exists", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");
    await mkdir(join(home, ".mcp-agent", "agents"), { recursive: true });
    await writeFile(agentPath, "active custom mcp-agent definition\n", "utf8");
    await writeFile(`${agentPath}.bak`, "older unrelated backup\n", "utf8");

    const installed = await installMcpAgentDefinition(agentPath, { projectDir: home });
    const definition = await readFile(agentPath, "utf8");
    const removed = await uninstallMcpAgentDefinition(agentPath, { projectDir: home });

    expect(installed.backupPath).toBe(`${agentPath}.bak.1`);
    expect(definition).toContain("<!-- tokenjuice:mcp-agent-restore-backup=.bak.1 -->");
    expect(removed.removed).toBe(true);
    await expect(readFile(agentPath, "utf8")).resolves.toBe("active custom mcp-agent definition\n");
    await expect(readFile(`${agentPath}.bak`, "utf8")).resolves.toBe("older unrelated backup\n");
    await expect(access(`${agentPath}.bak.1`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not rewrite or back up an already current agent definition", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");

    await installMcpAgentDefinition(agentPath, { projectDir: home });
    const before = await readFile(agentPath, "utf8");
    const result = await installMcpAgentDefinition(agentPath, { projectDir: home });
    const after = await readFile(agentPath, "utf8");

    expect(result.backupPath).toBeUndefined();
    expect(after).toBe(before);
    await expect(readFile(`${agentPath}.bak`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("recognizes and removes an exact legacy tokenjuice definition", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");
    await installMcpAgentDefinition(agentPath, { projectDir: home });
    const currentDefinition = await readFile(agentPath, "utf8");
    const legacyDefinition = currentDefinition.replace("<!-- tokenjuice:mcp-agent -->\n\n", "");
    await writeFile(agentPath, legacyDefinition, "utf8");

    const removed = await uninstallMcpAgentDefinition(agentPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    await expect(readFile(agentPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not restore incidental backups when uninstalling a fresh tokenjuice definition", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");

    await installMcpAgentDefinition(agentPath, { projectDir: home });
    await writeFile(`${agentPath}.bak`, "unrelated backup\n", "utf8");

    const removed = await uninstallMcpAgentDefinition(agentPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    await expect(access(agentPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${agentPath}.bak`, "utf8")).resolves.toBe("unrelated backup\n");
  });

  it("reports installed and uninstalled definition health", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");

    await installMcpAgentDefinition(agentPath, { projectDir: home });
    const installed = await doctorMcpAgentDefinition(agentPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("agent-file");

    const removed = await uninstallMcpAgentDefinition(agentPath, { projectDir: home });
    const disabled = await doctorMcpAgentDefinition(agentPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
  });

  it("reports broken definitions when required guidance is stale", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");
    await installMcpAgentDefinition(agentPath, { projectDir: home });
    await writeFile(
      agentPath,
      [
        "---",
        "name: tokenjuice",
        "description: stale",
        "---",
        "<!-- tokenjuice:mcp-agent -->",
        "# tokenjuice mcp-agent terminal output compaction",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorMcpAgentDefinition(agentPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured mcp-agent definition is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured mcp-agent definition is missing search path guidance");
    expect(doctor.issues).toContain("configured mcp-agent definition is missing load guidance");
    expect(doctor.issues).toContain("configured mcp-agent definition still suggests the full escape hatch");
  });

  it("leaves non-tokenjuice agent definitions untouched on uninstall", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");
    await mkdir(join(home, ".mcp-agent", "agents"), { recursive: true });
    await writeFile(agentPath, "custom mcp-agent definition\n", "utf8");

    const removed = await uninstallMcpAgentDefinition(agentPath, { projectDir: home });
    const definition = await readFile(agentPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(definition).toBe("custom mcp-agent definition\n");
  });

  it("does not claim an unrelated definition that only mentions the tokenjuice marker", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");
    const customDefinition = [
      "---",
      "name: tokenjuice",
      "---",
      "",
      "# tokenjuice mcp-agent terminal output compaction",
      "",
      "Custom guidance.",
    ].join("\n");
    await mkdir(join(home, ".mcp-agent", "agents"), { recursive: true });
    await writeFile(agentPath, customDefinition, "utf8");

    const removed = await uninstallMcpAgentDefinition(agentPath, { projectDir: home });

    expect(removed.removed).toBe(false);
    await expect(readFile(agentPath, "utf8")).resolves.toBe(customDefinition);
  });

  it("reports non-tokenjuice agent definitions as disabled", async () => {
    const home = await createTempDir();
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");
    await mkdir(join(home, ".mcp-agent", "agents"), { recursive: true });
    await writeFile(agentPath, "custom mcp-agent definition\n", "utf8");

    const doctor = await doctorMcpAgentDefinition(agentPath, { projectDir: home });

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues).toContain("tokenjuice mcp-agent definition is not installed");
  });

  it("uses MCP_AGENT_PROJECT_DIR for the default agent path", async () => {
    const home = await createTempDir();
    process.env.MCP_AGENT_PROJECT_DIR = home;

    const installed = await installMcpAgentDefinition();
    const expectedAgentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");
    const doctor = await doctorMcpAgentDefinition();

    expect(installed.agentPath).toBe(expectedAgentPath);
    expect(doctor.agentPath).toBe(expectedAgentPath);
    expect(doctor.status).toBe("ok");
  });

  it("rejects symlinked agent definitions before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.MCP_AGENT_PROJECT_DIR = home;
    await mkdir(join(home, ".mcp-agent", "agents"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# private definition\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".mcp-agent", "agents", "tokenjuice.md"));

    await expect(installMcpAgentDefinition()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, ".mcp-agent", "agents", "tokenjuice.md.bak"))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorMcpAgentDefinition();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
  });

  it("rejects sidecar symlinks before installing definitions", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.MCP_AGENT_PROJECT_DIR = home;
    const agentPath = join(home, ".mcp-agent", "agents", "tokenjuice.md");
    await mkdir(join(home, ".mcp-agent", "agents"), { recursive: true });
    await writeFile(agentPath, "# project definition\n", "utf8");
    await writeFile(join(outside, "private-bak.md"), "# private backup\n", "utf8");
    await writeFile(join(outside, "private-tmp.md"), "# private temp\n", "utf8");

    await symlink(join(outside, "private-bak.md"), `${agentPath}.bak`);
    await expect(installMcpAgentDefinition()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await rm(`${agentPath}.bak`);

    await symlink(join(outside, "private-tmp.md"), `${agentPath}.tmp`);
    await expect(installMcpAgentDefinition()).rejects.toThrow(/will not read or write through instruction symlinks/u);

    await expect(readFile(join(outside, "private-bak.md"), "utf8")).resolves.toBe("# private backup\n");
    await expect(readFile(join(outside, "private-tmp.md"), "utf8")).resolves.toBe("# private temp\n");
  });

  it("constrains explicit agent paths to the project boundary", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideAgentPath = join(outside, ".mcp-agent", "agents", "tokenjuice.md");

    process.chdir(home);
    await expect(installMcpAgentDefinition(outsideAgentPath)).rejects.toThrow(/outside/u);
    await expect(installMcpAgentDefinition(outsideAgentPath, { projectDir: home })).rejects.toThrow(/outside/u);
    await expect(uninstallMcpAgentDefinition(outsideAgentPath, { projectDir: home })).rejects.toThrow(/outside/u);

    const doctor = await doctorMcpAgentDefinition(outsideAgentPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("outside");
    expect(doctor.fixCommand).toContain("project-local mcp-agent definition path");
    await expect(access(outsideAgentPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects explicit agent paths under symlinked parents outside projectDir", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const linkedDir = join(home, ".mcp-agent");
    const linkedAgentPath = join(linkedDir, "agents", "tokenjuice.md");
    await symlink(outside, linkedDir);

    await expect(installMcpAgentDefinition(linkedAgentPath, { projectDir: home })).rejects.toThrow(/outside/u);
    await expect(access(join(outside, "agents", "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("defaults to the git root agent path from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installMcpAgentDefinition();
    const root = await realpath(home);

    expect(installed.agentPath).toBe(join(root, ".mcp-agent", "agents", "tokenjuice.md"));
    await expect(readFile(join(root, ".mcp-agent", "agents", "tokenjuice.md"), "utf8")).resolves.toContain(
      "mcp-agent terminal output compaction",
    );
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installMcpAgentDefinition(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["mcp-agent"].agentPath).toBe(join(home, ".mcp-agent", "agents", "tokenjuice.md"));
    expect(report.integrations["mcp-agent"].status).toBe("ok");
    expect(report.integrations["mcp-agent"].hasTokenjuiceMarker).toBe(true);
  });
});
