import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorOpenWebUITool,
  installOpenWebUITool,
  uninstallOpenWebUITool,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEX_HOME",
  "CONTINUE_PROJECT_DIR",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CRUSH_PROJECT_DIR",
  "CURSOR_HOME",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GOOSE_PROJECT_DIR",
  "GROK_HOME",
  "HOME",
  "JUNIE_PROJECT_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPENWEBUI_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "QWEN_PROJECT_DIR",
  "ROO_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const hasPython3 = spawnSync("python3", ["--version"], { stdio: "ignore" }).status === 0;

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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-openwebui-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("openwebui tool", () => {
  it("installs a Workspace Tool source that compacts provided output without shell execution", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");

    const result = await installOpenWebUITool(toolPath);
    const tool = await readFile(toolPath, "utf8");

    expect(result.toolPath).toBe(toolPath);
    expect(result.backupPath).toBeUndefined();
    expect(tool).toContain("tokenjuice compact terminal output");
    expect(tool).toContain("class Tools:");
    expect(tool).toContain("compact_terminal_output");
    expect(tool).toContain("await asyncio.to_thread(");
    expect(tool).toContain("[tokenjuice_bin, \"reduce-json\", \"--format\", \"json\"]");
    expect(tool).toContain("The command string is metadata only; it is never executed by this tool.");
    expect(tool).not.toContain("shell=True");
    expect(tool).not.toContain("tokenjuice wrap -- <command>");
  });

  it.skipIf(!hasPython3)("writes Python source that parses", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");
    await installOpenWebUITool(toolPath);

    const compiled = spawnSync("python3", ["-m", "py_compile", toolPath], { encoding: "utf8" });

    if (compiled.status !== 0) {
      throw new Error(compiled.stderr || compiled.stdout || "python3 py_compile failed");
    }
    expect(compiled.status).toBe(0);
  });

  it("backs up an existing tool source before replacing it", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");
    await installOpenWebUITool(toolPath);
    await writeFile(toolPath, "custom local tool\n", "utf8");

    const result = await installOpenWebUITool(toolPath);

    expect(result.backupPath).toBe(`${toolPath}.bak`);
    await expect(readFile(`${toolPath}.bak`, "utf8")).resolves.toBe("custom local tool\n");
    await expect(readFile(toolPath, "utf8")).resolves.toContain("reduce-json");
  });

  it("reports installed and uninstalled tool health", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");

    await installOpenWebUITool(toolPath);
    const installed = await doctorOpenWebUITool(toolPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("Workspace Tool source file");

    const removed = await uninstallOpenWebUITool(toolPath);
    const disabled = await doctorOpenWebUITool(toolPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports edited tool sources as broken", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");
    await mkdir(join(home, ".openwebui", "tools"), { recursive: true });
    await writeFile(
      toolPath,
      [
        "tokenjuice compact terminal output",
        "class Tools:",
        "    async def compact_terminal_output(self, command: str, output: str) -> str:",
        "        subprocess.run(command, shell=True)",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOpenWebUITool(toolPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Open WebUI tool source does not match the current tokenjuice generated source");
  });

  it("refuses to remove non-tokenjuice tool source", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");
    await mkdir(join(home, ".openwebui", "tools"), { recursive: true });
    await writeFile(toolPath, "custom local tool\n", "utf8");

    await expect(uninstallOpenWebUITool(toolPath)).rejects.toThrow(
      "does not match the current tokenjuice Open WebUI tool source",
    );

    await expect(readFile(toolPath, "utf8")).resolves.toBe("custom local tool\n");
  });

  it("uses OPENWEBUI_PROJECT_DIR for the default tool source", async () => {
    const home = await createTempDir();
    process.env.OPENWEBUI_PROJECT_DIR = home;

    const installed = await installOpenWebUITool();
    const expectedToolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");
    const doctor = await doctorOpenWebUITool();

    expect(installed.toolPath).toBe(expectedToolPath);
    expect(doctor.toolPath).toBe(expectedToolPath);
    expect(doctor.status).toBe("ok");
  });

  it("passes projectDir through aggregate hook doctor", async () => {
    const home = await createTempDir();
    const configHome = join(home, "home");
    await mkdir(configHome, { recursive: true });
    process.env.HOME = configHome;
    process.env.FACTORY_HOME = join(configHome, ".factory");
    process.env.CODEX_HOME = join(configHome, ".codex");
    process.env.CLAUDE_CONFIG_DIR = join(configHome, ".claude");
    process.env.CODEBUDDY_CONFIG_DIR = join(configHome, ".codebuddy");
    process.env.CURSOR_HOME = join(configHome, ".cursor");
    process.env.GEMINI_HOME = join(configHome, ".gemini");
    process.env.GROK_HOME = join(configHome, ".grok");
    process.env.COPILOT_HOME = join(configHome, ".copilot");
    process.env.PI_CODING_AGENT_DIR = join(configHome, ".pi", "agent");
    process.env.OPENCODE_CONFIG_DIR = join(configHome, ".config", "opencode");
    process.env.CLINE_HOOKS_DIR = join(configHome, "Cline", "Hooks");
    await installOpenWebUITool(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.openwebui.status).toBe("ok");
    expect(report.integrations.openwebui.toolPath).toBe(join(home, ".openwebui", "tools", "tokenjuice_compact.py"));
  });

  it("installs into the git root when run from a nested directory", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installOpenWebUITool();
    const expectedToolPath = join(await realpath(home), ".openwebui", "tools", "tokenjuice_compact.py");

    expect(installed.toolPath).toBe(expectedToolPath);
    expect(await readFile(join(home, ".openwebui", "tools", "tokenjuice_compact.py"), "utf8")).toContain("class Tools:");
    await expect(access(join(nestedDir, ".openwebui", "tools", "tokenjuice_compact.py"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the default tool source file", async () => {
    const home = await createTempDir();
    process.env.OPENWEBUI_PROJECT_DIR = home;
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");

    await installOpenWebUITool();
    await uninstallOpenWebUITool();

    await expect(access(toolPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses projectDir when uninstalling the default tool source file", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");

    await installOpenWebUITool(undefined, { projectDir: home });
    const removed = await uninstallOpenWebUITool(undefined, { projectDir: home });

    expect(removed.toolPath).toBe(toolPath);
    expect(removed.removed).toBe(true);
    await expect(access(toolPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
