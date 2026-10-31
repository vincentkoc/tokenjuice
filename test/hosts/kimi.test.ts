import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
  "PATH",
  "SHELL",
  "JUNIE_PROJECT_DIR",
  "KIMI_CODE_HOME",
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

beforeEach(() => {
  delete process.env.KIMI_CODE_HOME;
  delete process.env.KIMI_SHARE_DIR;
  delete process.env.KIMI_HOME;
});

const legacyBlock = [
  "# tokenjuice:kimi begin", "[[hooks]]", 'event = "PostToolUse"',
  'matcher = "Shell"', 'command = "tokenjuice kimi-post-tool-use"',
  "timeout = 30", "# tokenjuice:kimi end", "",
].join("\n");

describe("retired Kimi hook", () => {
  it("refuses installation without creating or changing host config", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await expect(installKimiHook(configPath)).rejects.toThrow(/cannot replace tool output/u);
    await expect(readFile(configPath)).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(configPath, legacyBlock);
    await expect(installKimiHook(configPath)).rejects.toThrow(/tokenjuice wrap/u);
    await expect(readFile(configPath, "utf8")).resolves.toBe(legacyBlock);
  });

  it("reports old hooks as retired and preserves unrelated config on uninstall", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    const unrelated = 'default_model = "keep"\n\n[[hooks]]\nevent = "Stop"\ncommand = "echo keep"';
    await writeFile(configPath, `${unrelated}\n\n${legacyBlock}`);
    const report = await doctorKimiHook(configPath);
    expect(report.status).toBe("broken");
    expect(report.detectedCommand).toBe("tokenjuice kimi-post-tool-use");
    expect(report.issues).toContain("retired tokenjuice Kimi hook is still installed");
    expect(report.fixCommand).toBe("tokenjuice uninstall kimi");
    expect(await uninstallKimiHook(configPath)).toEqual({ configPath, removed: 1 });
    await expect(readFile(configPath, "utf8")).resolves.toBe(`${unrelated}\n`);
    expect((await stat(configPath)).mode & 0o777).toBe(0o600);
    expect((await doctorKimiHook(configPath)).status).toBe("disabled");
    expect((await uninstallKimiHook(configPath)).removed).toBe(0);
  });

  it("finds existing legacy default installs while preferring current marked config", async () => {
    const home = await createTempDir();
    process.env.HOME = home;
    const current = join(home, ".kimi-code", "config.toml");
    const legacy = join(home, ".kimi", "config.toml");
    await mkdir(join(home, ".kimi"));
    await mkdir(join(home, ".kimi-code"));
    await writeFile(legacy, legacyBlock);
    await writeFile(current, 'default_model = "keep"\n');
    expect((await doctorKimiHook()).configPath).toBe(legacy);
    await writeFile(current, legacyBlock);
    expect((await uninstallKimiHook()).configPath).toBe(current);
    expect((await uninstallKimiHook()).configPath).toBe(legacy);
    expect((await doctorKimiHook()).configPath).toBe(current);
  });

  it.each(["KIMI_CODE_HOME", "KIMI_SHARE_DIR", "KIMI_HOME"] as const)("honors %s for cleanup", async (key) => {
    const home = await createTempDir();
    process.env[key] = home;
    await writeFile(join(home, "config.toml"), legacyBlock);
    expect((await doctorKimiHook()).configPath).toBe(join(home, "config.toml"));
    expect((await uninstallKimiHook()).removed).toBe(1);
  });

  it("prefers KIMI_CODE_HOME over legacy environment variables", async () => {
    const home = await createTempDir();
    process.env.KIMI_CODE_HOME = home;
    process.env.KIMI_SHARE_DIR = join(home, "legacy");
    process.env.KIMI_HOME = join(home, "older");
    expect((await doctorKimiHook()).configPath).toBe(join(home, "config.toml"));
  });

  it("keeps malformed markers visible and refuses unsafe cleanup", async () => {
    const home = await createTempDir();
    for (const key of envKeys) process.env[key] = home;
    const configPath = join(home, "config.toml");
    const malformed = "# tokenjuice:kimi begin\n# tokenjuice:kimi begin\n# tokenjuice:kimi end\n# tokenjuice:kimi end\n";
    await writeFile(configPath, malformed);
    const report = await doctorInstalledHooks({ configDir: home });
    expect(report.status).toBe("broken");
    expect(report.integrations.kimi.issues[0]).toContain("unmatched tokenjuice markers");
    await expect(uninstallKimiHook(configPath)).rejects.toThrow(/malformed tokenjuice Kimi markers/u);
    await expect(readFile(configPath, "utf8")).resolves.toBe(malformed);
  });

  it("does not parse unterminated legacy command strings", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, `# tokenjuice:kimi begin\ncommand = "${"\\!".repeat(128)}\n# tokenjuice:kimi end`);
    expect((await doctorKimiHook(configPath)).detectedCommand).toBeUndefined();
  });

  it("keeps stale hook commands silent for current, legacy and malformed payloads", async () => {
    for (const tool_name of ["Bash", "Shell"]) {
      const payload = JSON.stringify({ hook_event_name: "PostToolUse", tool_name,
        tool_input: { command: "git status --short" },
        tool_output: Array.from({ length: 80 }, (_, i) => ` M src/file-${i}.ts`).join("\n") });
      expect(await captureStdout(() => runKimiPostToolUseHook(payload))).toEqual({ code: 0, output: "" });
    }
    expect(await captureStdout(() => runKimiPostToolUseHook("not-json"))).toEqual({ code: 0, output: "" });
  });
});
