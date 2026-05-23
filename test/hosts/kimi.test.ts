import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorKimiHook,
  installKimiHook,
  runKimiPostToolUseHook,
  uninstallKimiHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEX_HOME",
  "CONTINUE_PROJECT_DIR",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CURSOR_HOME",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GROK_BUILD_PROJECT_DIR",
  "HOME",
  "JUNIE_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "PLANDEX_PROJECT_DIR",
  "QODER_PROJECT_DIR",
  "QWEN_PROJECT_DIR",
  "ROO_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-kimi-test-"));
  tempDirs.push(dir);
  return dir;
}

async function captureStdout(run: () => Promise<number>): Promise<{ code: number; output: string }> {
  let output = "";
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = await run();
    return { code, output };
  } finally {
    process.stdout.write = originalWrite;
  }
}

describe("kimi hook", () => {
  it("installs a marker-delimited PostToolUse Shell hook in config.toml", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".kimi", "config.toml");

    const result = await installKimiHook(configPath, { binaryPath: "/usr/local/bin/tokenjuice", local: true });
    const config = await readFile(configPath, "utf8");

    expect(result.configPath).toBe(configPath);
    expect(result.command).toBe("/usr/local/bin/tokenjuice kimi-post-tool-use");
    expect(result.backupPath).toBeUndefined();
    expect(config).toContain("# tokenjuice:kimi begin");
    expect(config).toContain("[[hooks]]");
    expect(config).toContain('event = "PostToolUse"');
    expect(config).toContain('matcher = "Shell"');
    expect(config).toContain('command = "/usr/local/bin/tokenjuice kimi-post-tool-use"');
    expect(config).toContain("# tokenjuice:kimi end");
  });

  it("preserves existing config and backs it up before replacing its own block", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".kimi", "config.toml");
    await mkdir(join(home, ".kimi"), { recursive: true });
    await writeFile(
      configPath,
      [
        'theme = "dark"',
        "",
        "[[hooks]]",
        'event = "Stop"',
        'command = "echo keep"',
        "",
        "# tokenjuice:kimi begin",
        "[[hooks]]",
        'event = "PostToolUse"',
        'matcher = "Shell"',
        'command = "/old/tokenjuice kimi-post-tool-use"',
        "timeout = 30",
        "# tokenjuice:kimi end",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await installKimiHook(configPath, { binaryPath: "/new/tokenjuice", local: true });
    const config = await readFile(configPath, "utf8");

    expect(result.backupPath).toBe(`${configPath}.bak`);
    await expect(readFile(`${configPath}.bak`, "utf8")).resolves.toContain("/old/tokenjuice");
    expect(config).toContain('theme = "dark"');
    expect(config).toContain('command = "echo keep"');
    expect(config).toContain('command = "/new/tokenjuice kimi-post-tool-use"');
    expect(config).not.toContain("/old/tokenjuice");
    expect((await stat(configPath)).mode & 0o777).toBe(0o600);
    expect((await stat(`${configPath}.bak`)).mode & 0o777).toBe(0o600);
  });

  it("reports installed, broken, and uninstalled hook health", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".kimi", "config.toml");
    const missingLauncherPath = join(home, "missing", "tokenjuice");

    await installKimiHook(configPath, { binaryPath: missingLauncherPath, local: true });
    const installed = await doctorKimiHook(configPath, { binaryPath: missingLauncherPath, local: true });

    expect(installed.status).toBe("broken");
    expect(installed.issues).toContain("configured Kimi hook points at missing path");
    expect(installed.detectedCommand).toBe(`${missingLauncherPath} kimi-post-tool-use`);

    await writeFile(configPath, "# tokenjuice:kimi begin\n[[hooks]]\n", "utf8");
    const broken = await doctorKimiHook(configPath, { binaryPath: missingLauncherPath, local: true });
    expect(broken.status).toBe("broken");
    expect(broken.issues[0]).toContain("unmatched tokenjuice markers");

    await writeFile(
      configPath,
      "# tokenjuice:kimi begin\n[[hooks]]\nevent = \"PostToolUse\"\nmatcher = \"Shell\"\ncommand = \"/usr/local/bin/tokenjuice kimi-post-tool-use\"\ntimeout = 30\n# tokenjuice:kimi end\n",
      "utf8",
    );
    const removed = await uninstallKimiHook(configPath);
    const disabled = await doctorKimiHook(configPath, { binaryPath: missingLauncherPath, local: true });
    expect(removed.removed).toBe(1);
    expect(disabled.status).toBe("disabled");
  });

  it("uses KIMI_HOME for the default config path", async () => {
    const home = await createTempDir();
    process.env.KIMI_HOME = home;

    const installed = await installKimiHook(undefined, { binaryPath: "/usr/local/bin/tokenjuice" });
    const expectedConfigPath = join(home, "config.toml");

    expect(installed.configPath).toBe(expectedConfigPath);
    await expect(readFile(expectedConfigPath, "utf8")).resolves.toContain("kimi-post-tool-use");
  });

  it("prefers KIMI_SHARE_DIR over the legacy KIMI_HOME fallback", async () => {
    const home = await createTempDir();
    const shareDir = await createTempDir();
    process.env.KIMI_HOME = home;
    process.env.KIMI_SHARE_DIR = shareDir;

    const installed = await installKimiHook(undefined, { binaryPath: "/usr/local/bin/tokenjuice", local: true });
    const expectedConfigPath = join(shareDir, "config.toml");

    expect(installed.configPath).toBe(expectedConfigPath);
    await expect(readFile(expectedConfigPath, "utf8")).resolves.toContain("kimi-post-tool-use");
  });

  it("refuses to shadow a legacy config.json before Kimi migrates it", async () => {
    const home = await createTempDir();
    process.env.KIMI_SHARE_DIR = home;
    await writeFile(join(home, "config.json"), JSON.stringify({ default_model: "kimi-for-coding" }), "utf8");

    await expect(installKimiHook(undefined, { local: true })).rejects.toThrow(/config\.json exists/);
    await expect(readFile(join(home, "config.toml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    for (const key of envKeys) {
      process.env[key] = home;
    }
    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installKimiHook(undefined, { binaryPath: launcherPath });

    const report = await doctorInstalledHooks({ binaryPath: launcherPath, configDir: home });

    expect(report.integrations.kimi.configPath).toBe(join(home, "config.toml"));
    expect(report.integrations.kimi.status).toBe("ok");
  });

  it("keeps malformed Kimi markers visible in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await writeFile(join(home, "config.toml"), "# tokenjuice:kimi begin\n[[hooks]]\n", "utf8");

    const report = await doctorInstalledHooks({ configDir: home });

    expect(report.status).toBe("broken");
    expect(report.integrations.kimi.status).toBe("broken");
    expect(report.integrations.kimi.hasTokenjuiceMarker).toBe(true);
    expect(report.integrations.kimi.issues[0]).toContain("unmatched tokenjuice markers");
  });
});

describe("runKimiPostToolUseHook", () => {
  it("prints compacted context for Kimi Shell output", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Shell",
      cwd: "/repo",
      tool_input: { command: "git status --short" },
      tool_output: {
        output: Array.from({ length: 80 }, (_, index) => ` M src/file-${index}.ts`).join("\n"),
      },
    });

    const { code, output } = await captureStdout(() => runKimiPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toContain("M: src/file-0.ts");
    expect(output).toContain("need raw? `tokenjuice wrap --raw -- <command>`");
    expect(output).not.toContain('"hookSpecificOutput"');
  });

  it("stays silent for malformed, non-Shell, or uninteresting payloads", async () => {
    await expect(captureStdout(() => runKimiPostToolUseHook("not-json"))).resolves.toEqual({ code: 0, output: "" });
    await expect(
      captureStdout(() =>
        runKimiPostToolUseHook(JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "ReadFile" })),
      ),
    ).resolves.toEqual({ code: 0, output: "" });
    await expect(
      captureStdout(() =>
        runKimiPostToolUseHook(
          JSON.stringify({
            hook_event_name: "PostToolUse",
            tool_name: "Shell",
            tool_input: { command: "echo hi" },
            tool_output: { output: "hi" },
          }),
        ),
      ),
    ).resolves.toEqual({ code: 0, output: "" });
  });
});
