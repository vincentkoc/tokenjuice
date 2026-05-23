import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorLocalCodePlugin,
  installLocalCodePlugin,
  uninstallLocalCodePlugin,
} from "../../src/index.js";
import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

const require = createRequire(import.meta.url);
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
  "CODER_AGENTS_PROJECT_DIR",
  "ECA_PROJECT_DIR",
  "ELYRA_PROJECT_DIR",
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
  "LOCALCODE_HOME",
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
  "PI_GO_PROJECT_DIR",
  "PLANDEX_PROJECT_DIR",
  "QODER_PROJECT_DIR",
  "QWEN_PROJECT_DIR",
  "REPLIT_PROJECT_DIR",
  "ROO_PROJECT_DIR",
  "ROVO_DEV_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "SWE_AGENT_PROJECT_DIR",
  "TABNINE_PROJECT_DIR",
  "TOKENJUICE_BIN",
  "TRAE_PROJECT_DIR",
  "UIPATH_PROJECT_DIR",
  "WARP_PROJECT_DIR",
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
  "ZENCODER_PROJECT_DIR",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(async () => {
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-localcode-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

async function createFakeTokenjuiceBin(home: string): Promise<string> {
  const binPath = join(home, "tokenjuice-fake.js");
  await writeFile(
    binPath,
    [
      "#!/usr/bin/env node",
      "let input = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => { input += chunk; });",
      "process.stdin.on('end', () => {",
      "  const request = JSON.parse(input);",
      "  process.stdout.write(JSON.stringify({",
      "    inlineText: `command=${request.input.command}; output=${request.input.combinedText.split(/\\n/u)[0]}`,",
      "    classification: { matchedReducer: 'fake/localcode' },",
      "    stats: { ratio: 0.25 }",
      "  }));",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(binPath, 0o755);
  return binPath;
}

describe("LocalCode plugin", () => {
  it("installs a LocalCode plugin manifest and CommonJS entrypoint", async () => {
    const home = await createTempDir();

    const result = await installLocalCodePlugin({ homeDir: home });
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as Record<string, unknown>;
    const index = await readFile(result.indexPath, "utf8");

    expect(result.pluginDir).toBe(join(home, "plugins", "tokenjuice"));
    expect(manifest.name).toBe("tokenjuice");
    expect(manifest.description).toContain("tokenjuice:localcode-plugin");
    expect(manifest.tools).toEqual(["tokenjuice_compact_terminal_output"]);
    expect(manifest.commands).toEqual(["/tokenjuice"]);
    expect(index).toContain("// tokenjuice:localcode-plugin");
    expect(index).toContain("tokenjuice localcode plugin");
    expect(index).toContain("reduce-json");
    expect(index).toContain("command string is metadata only");
    expect(index).toContain("shell: false");
    expect(index).not.toContain("shell: true");
  });

  it("backs up existing plugin files without clobbering older backups", async () => {
    const home = await createTempDir();
    await installLocalCodePlugin({ homeDir: home });
    const manifestPath = join(home, "plugins", "tokenjuice", "localcode.plugin.json");
    const indexPath = join(home, "plugins", "tokenjuice", "index.js");
    await writeFile(manifestPath, "{\"name\":\"custom\"}\n", "utf8");
    await writeFile(indexPath, "module.exports = { name: 'custom' }\n", "utf8");
    await writeFile(`${manifestPath}.bak`, "{\"name\":\"older\"}\n", "utf8");
    await writeFile(`${indexPath}.bak`, "module.exports = { name: 'older' }\n", "utf8");

    const result = await installLocalCodePlugin({ homeDir: home });

    expect(result.manifestBackupPath).toBe(`${manifestPath}.bak.1`);
    expect(result.indexBackupPath).toBe(`${indexPath}.bak.1`);
    await expect(readFile(`${manifestPath}.bak`, "utf8")).resolves.toContain("older");
    await expect(readFile(`${indexPath}.bak`, "utf8")).resolves.toContain("older");
    await expect(readFile(`${manifestPath}.bak.1`, "utf8")).resolves.toContain("custom");
    await expect(readFile(`${indexPath}.bak.1`, "utf8")).resolves.toContain("custom");
    await expect(readFile(indexPath, "utf8")).resolves.toContain("// tokenjuice:localcode-restore-manifest=.bak.1");
    await expect(readFile(indexPath, "utf8")).resolves.toContain("// tokenjuice:localcode-restore-index=.bak.1");
  });

  it("does not create backups on idempotent reinstall", async () => {
    const home = await createTempDir();
    const first = await installLocalCodePlugin({ homeDir: home });
    const second = await installLocalCodePlugin({ homeDir: home });

    expect(first.manifestBackupPath).toBeUndefined();
    expect(first.indexBackupPath).toBeUndefined();
    expect(second.manifestBackupPath).toBeUndefined();
    expect(second.indexBackupPath).toBeUndefined();
    await expect(access(join(home, "plugins", "tokenjuice", "localcode.plugin.json.bak"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(access(join(home, "plugins", "tokenjuice", "index.js.bak"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("restores exact pre-existing plugin files on uninstall", async () => {
    const home = await createTempDir();
    const pluginDir = join(home, "plugins", "tokenjuice");
    const manifestPath = join(pluginDir, "localcode.plugin.json");
    const indexPath = join(pluginDir, "index.js");
    const customManifest = "{\"name\":\"custom\"}\n";
    const customIndex = "module.exports = { name: 'custom' }\n";
    await mkdir(pluginDir, { recursive: true });
    await writeFile(manifestPath, customManifest, "utf8");
    await writeFile(indexPath, customIndex, "utf8");
    await writeFile(`${manifestPath}.bak`, "{\"name\":\"older\"}\n", "utf8");
    await writeFile(`${indexPath}.bak`, "module.exports = { name: 'older' }\n", "utf8");

    const installed = await installLocalCodePlugin({ homeDir: home });
    const removed = await uninstallLocalCodePlugin({ homeDir: home });

    expect(installed.manifestBackupPath).toBe(`${manifestPath}.bak.1`);
    expect(installed.indexBackupPath).toBe(`${indexPath}.bak.1`);
    expect(removed.removed).toBe(true);
    await expect(readFile(manifestPath, "utf8")).resolves.toBe(customManifest);
    await expect(readFile(indexPath, "utf8")).resolves.toBe(customIndex);
    await expect(readFile(`${manifestPath}.bak`, "utf8")).resolves.toContain("older");
    await expect(readFile(`${indexPath}.bak`, "utf8")).resolves.toContain("older");
    await expect(access(`${manifestPath}.bak.1`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(`${indexPath}.bak.1`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects restore backup symlinks during uninstall without touching the target", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const pluginDir = join(home, "plugins", "tokenjuice");
    const manifestPath = join(pluginDir, "localcode.plugin.json");
    const indexPath = join(pluginDir, "index.js");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: "tokenjuice",
        version: "1.0.0",
        description: "tokenjuice:localcode-plugin",
        tools: ["tokenjuice_compact_terminal_output"],
        commands: ["/tokenjuice"],
      }) + "\n",
      "utf8",
    );
    await writeFile(
      indexPath,
      [
        "// tokenjuice:localcode-plugin",
        "// tokenjuice:localcode-restore-manifest=.bak",
        "// tokenjuice:localcode-restore-index=.bak",
        "const shell = false",
        "module.exports = 'tokenjuice localcode plugin reduce-json command string is metadata only shell: false'",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(outside, "private.json"), "{\"private\":true}\n", "utf8");
    await writeFile(join(outside, "private.js"), "module.exports = 'private'\n", "utf8");
    await symlink(join(outside, "private.json"), `${manifestPath}.bak`);
    await symlink(join(outside, "private.js"), `${indexPath}.bak`);

    await expect(uninstallLocalCodePlugin({ homeDir: home })).rejects.toThrow(/plugin file symlinks/u);
    await expect(readFile(manifestPath, "utf8")).resolves.toContain("tokenjuice:localcode-plugin");
    await expect(readFile(indexPath, "utf8")).resolves.toContain("tokenjuice:localcode-plugin");
    await expect(readFile(join(outside, "private.json"), "utf8")).resolves.toBe("{\"private\":true}\n");
    await expect(readFile(join(outside, "private.js"), "utf8")).resolves.toBe("module.exports = 'private'\n");
  });

  it("records markerless companion backups when reinstalling a partially owned plugin", async () => {
    const home = await createTempDir();
    const pluginDir = join(home, "plugins", "tokenjuice");
    const manifestPath = join(pluginDir, "localcode.plugin.json");
    const indexPath = join(pluginDir, "index.js");
    const customIndex = "module.exports = { name: 'custom companion' }\n";
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: "tokenjuice",
        version: "1.0.0",
        description: "tokenjuice:localcode-plugin",
        tools: ["tokenjuice_compact_terminal_output"],
        commands: ["/tokenjuice"],
      }) + "\n",
      "utf8",
    );
    await writeFile(indexPath, customIndex, "utf8");

    const installed = await installLocalCodePlugin({ homeDir: home });
    const generatedIndex = await readFile(indexPath, "utf8");
    const removed = await uninstallLocalCodePlugin({ homeDir: home });

    expect(installed.indexBackupPath).toBe(`${indexPath}.bak`);
    expect(generatedIndex).toContain("// tokenjuice:localcode-restore-index=.bak");
    expect(removed.removed).toBe(true);
    await expect(readFile(indexPath, "utf8")).resolves.toBe(customIndex);
    await expect(access(`${indexPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports installed and uninstalled plugin health", async () => {
    const home = await createTempDir();

    await installLocalCodePlugin({ homeDir: home });
    const installed = await doctorLocalCodePlugin({ homeDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("plugin tool/command");

    const removed = await uninstallLocalCodePlugin({ homeDir: home });
    const disabled = await doctorLocalCodePlugin({ homeDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(join(home, "plugins", "tokenjuice", "index.js"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(home, "plugins", "tokenjuice"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("leaves markerless user-owned plugins untouched during uninstall", async () => {
    const home = await createTempDir();
    const pluginDir = join(home, "plugins", "tokenjuice");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "localcode.plugin.json"), "{\"name\":\"tokenjuice\"}\n", "utf8");
    await writeFile(join(pluginDir, "index.js"), "module.exports = { name: 'custom' }\n", "utf8");

    const removed = await uninstallLocalCodePlugin({ homeDir: home });
    const doctor = await doctorLocalCodePlugin({ homeDir: home });

    expect(removed.removed).toBe(false);
    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    await expect(readFile(join(pluginDir, "localcode.plugin.json"), "utf8")).resolves.toContain("tokenjuice");
    await expect(readFile(join(pluginDir, "index.js"), "utf8")).resolves.toContain("custom");
  });

  it("reports broken plugins when manifest or runtime wiring is stale or unsafe", async () => {
    const home = await createTempDir();
    const pluginDir = join(home, "plugins", "tokenjuice");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, "localcode.plugin.json"),
      "{\"name\":\"tokenjuice\",\"description\":\"tokenjuice:localcode-plugin\",\"tools\":[],\"commands\":[]}\n",
      "utf8",
    );
    await writeFile(
      join(pluginDir, "index.js"),
      [
        "// tokenjuice:localcode-plugin",
        "const tokenjuice = 'tokenjuice localcode plugin'",
        "require('node:child_process').execSync('tokenjuice reduce-json')",
        "module.exports = { name: 'tokenjuice' }",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorLocalCodePlugin({ homeDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured LocalCode plugin manifest is missing the tokenjuice compaction tool");
    expect(doctor.issues).toContain("configured LocalCode plugin is missing shell-free tokenjuice execution");
    expect(doctor.issues).toContain("configured LocalCode plugin uses execSync");
  });

  it("uses LOCALCODE_HOME for the default plugin directory", async () => {
    const home = await createTempDir();
    process.env.LOCALCODE_HOME = home;

    const installed = await installLocalCodePlugin();
    const doctor = await doctorLocalCodePlugin();

    expect(installed.pluginDir).toBe(join(home, "plugins", "tokenjuice"));
    expect(doctor.pluginDir).toBe(join(home, "plugins", "tokenjuice"));
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it("rejects symlinked plugin files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const pluginDir = join(home, "plugins", "tokenjuice");
    process.env.LOCALCODE_HOME = home;
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(outside, "private.json"), "{\"name\":\"private\"}\n", "utf8");
    await symlink(join(outside, "private.json"), join(pluginDir, "localcode.plugin.json"));

    await expect(installLocalCodePlugin()).rejects.toThrow(/will not read or write through plugin file symlinks/u);
    await expect(access(join(pluginDir, "localcode.plugin.json.bak"))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorLocalCodePlugin();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("will not read or write through plugin file symlinks");
  });

  it("does not read unsafe plugin files for marker evidence", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const pluginDir = join(home, "plugins", "tokenjuice");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(outside, "private.json"), "{\"description\":\"tokenjuice:localcode-plugin SENTINEL_DO_NOT_LEAK\"}\n", "utf8");
    await symlink(join(outside, "private.json"), join(pluginDir, "localcode.plugin.json"));

    const doctor = await doctorLocalCodePlugin({ homeDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    expect(JSON.stringify(doctor)).not.toContain("SENTINEL_DO_NOT_LEAK");
  });

  it("rejects symlinked plugin directories before uninstalling", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const pluginLink = join(home, "plugins", "tokenjuice");
    await mkdir(join(home, "plugins"), { recursive: true });
    await writeFile(
      join(outside, "localcode.plugin.json"),
      "{\"description\":\"tokenjuice localcode plugin\"}\n",
      "utf8",
    );
    await writeFile(join(outside, "index.js"), "module.exports = 'tokenjuice localcode plugin'\n", "utf8");
    await symlink(outside, pluginLink);

    await expect(uninstallLocalCodePlugin({ homeDir: home })).rejects.toThrow(/plugin directory symlinks/u);

    await expect(readFile(join(outside, "localcode.plugin.json"), "utf8")).resolves.toContain("tokenjuice");
    await expect(readFile(join(outside, "index.js"), "utf8")).resolves.toContain("tokenjuice");
  });

  it("rejects symlinked plugin parent directories before writing or reading", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await mkdir(home, { recursive: true });
    await symlink(outside, join(home, "plugins"));

    await expect(installLocalCodePlugin({ homeDir: home })).rejects.toThrow(/plugin directory symlinks/u);

    await writeFile(join(outside, "localcode.plugin.json"), "{\"description\":\"tokenjuice:localcode-plugin SENTINEL_DO_NOT_LEAK\"}\n", "utf8");
    const doctor = await doctorLocalCodePlugin({ homeDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(JSON.stringify(doctor)).not.toContain("SENTINEL_DO_NOT_LEAK");
    await expect(access(join(outside, "tokenjuice", "localcode.plugin.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects backup sidecar symlinks before installing plugin files", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const pluginDir = join(home, "plugins", "tokenjuice");
    process.env.LOCALCODE_HOME = home;
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "localcode.plugin.json"), "{\"name\":\"custom\"}\n", "utf8");
    await writeFile(join(pluginDir, "index.js"), "module.exports = { name: 'custom' }\n", "utf8");
    await writeFile(join(outside, "private-bak.json"), "{\"private\":true}\n", "utf8");
    await symlink(join(outside, "private-bak.json"), join(pluginDir, "localcode.plugin.json.bak"));

    await expect(installLocalCodePlugin()).rejects.toThrow(/will not read or write through plugin file symlinks/u);
    await expect(readFile(join(outside, "private-bak.json"), "utf8")).resolves.toBe("{\"private\":true}\n");
  });

  it("does not count a markerless LocalCode plugin as installed in aggregate doctor", async () => {
    const home = await createTempDir();
    const pluginDir = join(home, "plugins", "tokenjuice");
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "localcode.plugin.json"), "{\"name\":\"tokenjuice\"}\n", "utf8");
    await writeFile(join(pluginDir, "index.js"), "module.exports = { name: 'custom' }\n", "utf8");

    const doctor = await doctorLocalCodePlugin({ homeDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    expect(report.integrations.localcode.status).toBe("disabled");
    expect(report.integrations.localcode.hasTokenjuiceMarker).toBe(false);
    expect(report.status).toBe("disabled");
  });

  it("reports LocalCode in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installLocalCodePlugin({ homeDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.localcode.pluginDir).toBe(join(home, "plugins", "tokenjuice"));
    expect(report.integrations.localcode.status).toBe("ok");
    expect(report.integrations.localcode.hasTokenjuiceMarker).toBe(true);
  });

  it("generated plugin compacts provided output without running the command", async () => {
    const home = await createTempDir();
    const fakeBin = await createFakeTokenjuiceBin(home);
    process.env.TOKENJUICE_BIN = fakeBin;
    const result = await installLocalCodePlugin({ homeDir: home });
    const plugin = require(result.indexPath) as {
      commands: Array<{ handler: (args: string, ctx: { cwd: string }) => Promise<{ type: string; content: string }> }>;
      tools: Array<{ handler: (args: Record<string, unknown>, ctx: { cwd: string }) => Promise<{ success: boolean; output: string }> }>;
      register: (registry: { addCommand: (command: unknown) => void; addTool: (tool: unknown) => void }) => void;
    };
    const touchedPath = join(home, "should-not-exist");

    const toolResult = await plugin.tools[0]!.handler(
      { command: `touch ${touchedPath}`, output: "line one\nline two", exitCode: 0 },
      { cwd: home },
    );
    const commandResult = await plugin.commands[0]!.handler(`touch ${touchedPath}\nline one\nline two`, { cwd: home });
    const registered = { commands: [] as unknown[], tools: [] as unknown[] };
    plugin.register({
      addCommand(command) {
        registered.commands.push(command);
      },
      addTool(tool) {
        registered.tools.push(tool);
      },
    });
    const registeredTool = registered.tools[0] as {
      execute: (args: Record<string, unknown>, ctx: { cwd: string }) => Promise<string>;
    };

    expect(toolResult.success).toBe(true);
    expect(toolResult.output).toContain("fake/localcode");
    expect(toolResult.output).toContain(`command=touch ${touchedPath}`);
    expect(commandResult.type).toBe("command");
    expect(commandResult.content).toContain("output=line one");
    expect(registered.commands).toHaveLength(1);
    expect(registered.tools).toHaveLength(1);
    await expect(
      registeredTool.execute({ command: "git status", output: "line one", exitCode: 0 }, { cwd: home }),
    ).resolves.toContain("fake/localcode");
    await expect(access(touchedPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
