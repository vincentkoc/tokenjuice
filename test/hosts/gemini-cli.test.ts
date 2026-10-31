import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  doctorGeminiCliHook,
  installGeminiCliHook,
  runGeminiCliAfterToolHook,
  runGeminiCliBeforeToolHook,
  uninstallGeminiCliHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const envNames = ["GEMINI_HOME", "GEMINI_CLI_HOME", "TOKENJUICE_GEMINI_CLI_SHELL", "SHELL", "PATH", "TOKENJUICE_STATS", "TOKENJUICE_ARTIFACT_DIR"] as const;
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

beforeEach(async () => {
  const home = await createTempDir();
  process.env.TOKENJUICE_GEMINI_CLI_SHELL = "/bin/sh";
  process.env.TOKENJUICE_STATS = "0";
  process.env.TOKENJUICE_ARTIFACT_DIR = join(home, "artifacts");
});

afterEach(async () => {
  Object.defineProperty(process, "platform", originalPlatform);
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-gemini-cli-test-"));
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

describe("gemini-cli hooks", () => {
  it("migrates legacy hooks to one BeforeTool wrapper while preserving shared groups", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "bin", "tokenjuice");
    await writeFile(settingsPath, JSON.stringify({
      theme: "dark",
      hooks: {
        AfterTool: [
          {
            matcher: "read_file",
            hooks: [{ type: "command", command: "other-hook" }],
          },
          {
            matcher: "run_shell_command",
            hooks: [{ type: "command", name: "tokenjuice", command: "tokenjuice gemini-cli-after-tool" }, { type: "command", command: "custom-hook" }],
          },
        ],
      },
    }));

    const result = await installGeminiCliHook(settingsPath, { binaryPath: launcherPath, local: true });
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      theme: string;
      hooks: Record<string, Array<{ matcher: string; hooks: Array<{ command: string; name?: string }> }>>;
    };

    expect(result.settingsPath).toBe(settingsPath);
    expect(result.command).toBe(`${launcherPath} gemini-cli-before-tool --wrap-launcher ${launcherPath}`);
    expect(result.backupPath).toBe(`${settingsPath}.bak`);
    expect(parsed.theme).toBe("dark");
    expect(parsed.hooks.AfterTool).toHaveLength(2);
    expect(parsed.hooks.AfterTool[1]?.hooks).toEqual([{ type: "command", command: "custom-hook" }]);
    expect(parsed.hooks.BeforeTool).toHaveLength(1);
    expect(parsed.hooks.BeforeTool[0]?.matcher).toBe("run_shell_command");
    expect(parsed.hooks.BeforeTool[0]?.hooks[0]?.name).toBe("tokenjuice");
    expect(parsed.hooks.BeforeTool[0]?.hooks[0]?.command).toBe(result.command);
    await installGeminiCliHook(settingsPath, { binaryPath: launcherPath, local: true });
    expect(JSON.parse(await readFile(settingsPath, "utf8")).hooks.BeforeTool).toHaveLength(1);
    expect((await uninstallGeminiCliHook(settingsPath)).removed).toBe(1);
    expect(JSON.parse(await readFile(settingsPath, "utf8")).hooks.AfterTool).toEqual(parsed.hooks.AfterTool);
  });

  it("preserves unrelated hooks that mention the tokenjuice subcommand", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    await writeFile(settingsPath, JSON.stringify({
      hooks: {
        AfterTool: [
          {
            matcher: "run_shell_command",
            hooks: [{ type: "command", name: "custom", command: "echo gemini-cli-after-tool" }],
          },
        ],
      },
    }));

    await installGeminiCliHook(settingsPath);
    const removed = await uninstallGeminiCliHook(settingsPath);
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { AfterTool: Array<{ hooks: Array<{ name?: string; command: string }> }> };
    };

    expect(removed.removed).toBe(1);
    expect(parsed.hooks.AfterTool).toEqual([
      {
        matcher: "run_shell_command",
        hooks: [{ type: "command", name: "custom", command: "echo gemini-cli-after-tool" }],
      },
    ]);
  });

  it("reports installed and uninstalled hook health", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "tokenjuice");
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    await installGeminiCliHook(settingsPath, { binaryPath: launcherPath, local: true });
    const installed = await doctorGeminiCliHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(installed.status).toBe("ok");
    expect(installed.detectedCommand).toBe(`${launcherPath} gemini-cli-before-tool --wrap-launcher ${launcherPath}`);
    expect(installed.advisories[0]).toContain("beta");

    const removed = await uninstallGeminiCliHook(settingsPath);
    const disabled = await doctorGeminiCliHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(removed.removed).toBe(1);
    expect(disabled.status).toBe("disabled");
  });

  it("uses the native GEMINI_CLI_HOME root before the legacy config-directory override", async () => {
    const home = await createTempDir();
    process.env.GEMINI_CLI_HOME = home;
    process.env.GEMINI_HOME = join(home, "legacy");
    const installed = await installGeminiCliHook(undefined, { local: true });
    expect(installed.settingsPath).toBe(join(home, ".gemini", "settings.json"));
    expect((await doctorGeminiCliHook(undefined, { local: true })).status).toBe("ok");
    expect((await uninstallGeminiCliHook()).removed).toBe(1);
    delete process.env.GEMINI_CLI_HOME;
    expect((await installGeminiCliHook(undefined, { local: true })).settingsPath).toBe(join(home, "legacy", "settings.json"));
  });

  it.each([{ enabled: false }, { disabled: ["tokenjuice"] }])("reports configured hooks disabled by hooksConfig: %j", async (hooksConfig) => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    await writeFile(settingsPath, JSON.stringify({ hooksConfig }));
    await installGeminiCliHook(settingsPath, { local: true });
    const report = await doctorGeminiCliHook(settingsPath, { local: true });
    expect(report.status).toBe("broken");
    expect(report.issues).toContain("Gemini CLI hooksConfig disables the configured tokenjuice hook");
  });

  it("flags a legacy result-blocking hook for migration", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    await writeFile(settingsPath, JSON.stringify({ hooks: { AfterTool: [{ matcher: "run_shell_command", hooks: [
      { type: "command", name: "tokenjuice", command: "tokenjuice gemini-cli-after-tool" },
    ] }] } }));
    const report = await doctorGeminiCliHook(settingsPath, { local: true });
    expect(report.status).toBe("broken");
    expect(report.advisories).toContain("Legacy Gemini CLI AfterTool hook marks compacted results as errors; reinstall to enable pre-tool wrapping.");
    expect((await uninstallGeminiCliHook(settingsPath)).removed).toBe(1);
  });

  it("wraps native input without changing other fields or granting permission", async () => {
    const toolInput = { command: "printf '%s\\n' \"a b\" && exit 7", description: "fixture", dir_path: "/repo" };
    const { code, output } = await captureStdout(() => runGeminiCliBeforeToolHook(JSON.stringify({
      hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: toolInput,
    }), "/opt/tokenjuice/bin/tokenjuice"));
    const response = JSON.parse(output);
    expect(code).toBe(0);
    expect(response.hookSpecificOutput.hookEventName).toBe("BeforeTool");
    expect(response.hookSpecificOutput.tool_input).toEqual({ ...toolInput, command: expect.stringContaining("wrap --source") });
    expect(response.hookSpecificOutput.tool_input.command).toContain("/bin/sh -lc");
    expect(response.hookSpecificOutput.tool_input.command).toContain("exit 7");
    expect(response.decision).toBeUndefined();
  });

  it.each([
    "not json", "null", "[]",
    JSON.stringify({ hook_event_name: "AfterTool", tool_name: "run_shell_command", tool_input: { command: "ls" } }),
    JSON.stringify({ hook_event_name: "BeforeTool", tool_name: "read_file", tool_input: { command: "ls" } }),
    JSON.stringify({ hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: {} }),
  ])("leaves unsupported BeforeTool payloads unchanged: %s", async (payload) => {
    expect(await captureStdout(() => runGeminiCliBeforeToolHook(payload))).toEqual({ code: 0, output: "{}\n" });
  });

  it.each([
    "tokenjuice wrap --raw -- find fixtures -type f",
    "node /opt/tokenjuice/dist/cli/main.js wrap --raw -- find fixtures -type f",
    "cd /repo && /opt/bin/tokenjuice wrap --full -- cat exact.txt",
  ])("does not rewrap explicit wrappers: %s", async (command) => {
    expect(await captureStdout(() => runGeminiCliBeforeToolHook(JSON.stringify({
      hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command },
    })))).toEqual({ code: 0, output: "{}\n" });
  });

  it("uses native Bash regardless of the user's login shell", async () => {
    delete process.env.TOKENJUICE_GEMINI_CLI_SHELL;
    process.env.SHELL = process.execPath;
    const { output } = await captureStdout(() => runGeminiCliBeforeToolHook(JSON.stringify({
      hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command: "values=(alpha beta); echo ${values[1]}" },
    })));
    expect(JSON.parse(output).hookSpecificOutput.tool_input.command).toMatch(/\/bash -lc/u);
  });

  it("leaves input unchanged when no POSIX shell can be resolved", async () => {
    process.env.TOKENJUICE_GEMINI_CLI_SHELL = "/missing-fixture-shell";
    process.env.SHELL = "/missing-fixture-shell";
    process.env.PATH = await createTempDir();
    expect(await captureStdout(() => runGeminiCliBeforeToolHook(JSON.stringify({
      hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command: "ls" },
    })))).toEqual({ code: 0, output: "{}\n" });
  });

  it("requires WSL for native Windows wrapping", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    await expect(installGeminiCliHook(undefined, { local: true })).rejects.toThrow("WSL");
    const report = await doctorGeminiCliHook(join(await createTempDir(), "settings.json"), { local: true });
    expect(report.status).toBe("disabled");
    expect(report.fixCommand).toContain("WSL");
    expect(await captureStdout(() => runGeminiCliBeforeToolHook(JSON.stringify({
      hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command: "ls" },
    })))).toEqual({ code: 0, output: "{}\n" });
  });

  it("retains the legacy AfterTool entrypoint", async () => {
    const payload = JSON.stringify({
      hook_event_name: "AfterTool",
      tool_name: "run_shell_command",
      cwd: "/repo",
      tool_input: {
        command: "git status",
      },
      tool_response: {
        llmContent: [
          "On branch pr-65478-security-fix",
          "Your branch and 'origin/pr-65478-security-fix' have diverged,",
          "and have 8 and 642 different commits each, respectively.",
          "",
          "Changes not staged for commit:",
          "\tmodified:   src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts",
          "\tmodified:   src/agents/pi-embedded-runner/run/attempt.test.ts",
          "",
          "no changes added to commit",
        ].join("\n"),
      },
    });

    const { code, output } = await captureStdout(() => runGeminiCliAfterToolHook(payload));
    const response = JSON.parse(output) as {
      decision?: string;
      reason?: string;
      suppressOutput?: boolean;
    };

    expect(code).toBe(0);
    expect(response.decision).toBe("deny");
    expect(response.suppressOutput).toBe(true);
    expect(response.reason).toContain("Changes not staged:");
    expect(response.reason).toContain("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts");
    expect(response.reason).not.toContain("and have 8 and 642");
    expect(response.reason).toContain("tokenjuice wrap --raw -- <command>");
  });

  it("keeps unrelated hook payloads silent", async () => {
    const payload = JSON.stringify({
      hook_event_name: "AfterTool",
      tool_name: "read_file",
      tool_input: { path: "README.md" },
      tool_response: { llmContent: "hello" },
    });

    const { code, output } = await captureStdout(() => runGeminiCliAfterToolHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });
});
