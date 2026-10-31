import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  doctorQwenCodeHook,
  installQwenCodeHook,
  runQwenCodePostToolUseHook,
  runQwenCodePreToolUseHook,
  uninstallQwenCodeHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const envNames = ["QWEN_PROJECT_DIR", "TOKENJUICE_QWEN_CODE_SHELL", "SHELL", "PATH", "TOKENJUICE_STATS", "TOKENJUICE_ARTIFACT_DIR"] as const;
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

beforeEach(async () => {
  const home = await createTempDir();
  process.env.TOKENJUICE_QWEN_CODE_SHELL = "/bin/sh";
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-qwen-code-test-"));
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

describe("qwen-code hooks", () => {
  it("migrates legacy hooks to one PreToolUse wrapper while preserving shared groups", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, ".qwen", "settings.json");
    const launcherPath = join(home, "bin", "tokenjuice");
    await mkdir(join(home, ".qwen"), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      selectedAuthType: "openai",
      hooks: {
        PostToolUse: [
          {
            matcher: "ReadFile",
            hooks: [{ type: "command", command: "other-hook" }],
          },
          {
            matcher: "run_shell_command",
            hooks: [{ type: "command", command: "tokenjuice qwen-code-post-tool-use" }, { type: "command", command: "custom-hook" }],
          },
        ],
      },
    }));

    const result = await installQwenCodeHook(settingsPath, { binaryPath: launcherPath, local: true });
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      selectedAuthType: string;
      hooks: Record<string, Array<{ matcher: string; hooks: Array<{ command: string; name?: string }> }>>;
    };

    await expect(access(`${settingsPath}.bak`)).resolves.toBeUndefined();
    expect(result.settingsPath).toBe(settingsPath);
    expect(result.command).toBe(`${launcherPath} qwen-code-pre-tool-use --wrap-launcher ${launcherPath}`);
    expect(result.backupPath).toBe(`${settingsPath}.bak`);
    expect(parsed.selectedAuthType).toBe("openai");
    expect(parsed.hooks.PostToolUse).toHaveLength(2);
    expect(parsed.hooks.PostToolUse[1]?.hooks).toEqual([{ type: "command", command: "custom-hook" }]);
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse[0]?.matcher).toBe("^(Bash|Shell|run_shell_command)$");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.name).toBe("tokenjuice");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.command).toBe(result.command);
    await installQwenCodeHook(settingsPath, { binaryPath: launcherPath, local: true });
    expect(JSON.parse(await readFile(settingsPath, "utf8")).hooks.PreToolUse).toHaveLength(1);
    expect((await uninstallQwenCodeHook(settingsPath)).removed).toBe(1);
    expect(JSON.parse(await readFile(settingsPath, "utf8")).hooks.PostToolUse).toEqual(parsed.hooks.PostToolUse);
  });

  it("reports installed and uninstalled hook health", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, ".qwen", "settings.json");
    const launcherPath = join(home, "tokenjuice");
    await mkdir(join(home, ".qwen"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    await installQwenCodeHook(settingsPath, { binaryPath: launcherPath, local: true });
    const installed = await doctorQwenCodeHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(installed.status).toBe("ok");
    expect(installed.detectedCommand).toBe(`${launcherPath} qwen-code-pre-tool-use --wrap-launcher ${launcherPath}`);
    expect(installed.advisories[0]).toContain("beta");

    const removed = await uninstallQwenCodeHook(settingsPath);
    const disabled = await doctorQwenCodeHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(removed.removed).toBe(1);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken health when Qwen Code hooks are globally disabled", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, ".qwen", "settings.json");
    const launcherPath = join(home, "tokenjuice");
    await mkdir(join(home, ".qwen"), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ disableAllHooks: true, hooks: {} }), "utf8");
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    await installQwenCodeHook(settingsPath, { binaryPath: launcherPath, local: true });
    const doctor = await doctorQwenCodeHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("Qwen Code has disableAllHooks enabled; configured hooks will not run");
  });

  it("uses QWEN_PROJECT_DIR for the default project-local settings file", async () => {
    const home = await createTempDir();
    process.env.QWEN_PROJECT_DIR = home;

    const installed = await installQwenCodeHook(undefined, { local: true });
    const expectedSettingsPath = join(home, ".qwen", "settings.json");
    const doctor = await doctorQwenCodeHook(undefined, { local: true });

    expect(installed.settingsPath).toBe(expectedSettingsPath);
    expect(doctor.settingsPath).toBe(expectedSettingsPath);
    expect(doctor.status).toBe("ok");
  });

  it("uses projectDir when uninstalling the default project-local settings file", async () => {
    const home = await createTempDir();
    const expectedSettingsPath = join(home, ".qwen", "settings.json");

    await installQwenCodeHook(undefined, { projectDir: home, local: true });
    const removed = await uninstallQwenCodeHook(undefined, { projectDir: home, local: true });
    const parsed = JSON.parse(await readFile(expectedSettingsPath, "utf8")) as { hooks: { PreToolUse?: unknown[] } };

    expect(removed.settingsPath).toBe(expectedSettingsPath);
    expect(removed.removed).toBe(1);
    expect(parsed.hooks.PreToolUse).toBeUndefined();
  });

  it("flags a legacy context-only installation for migration", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "tokenjuice");
    await writeFile(launcherPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    await writeFile(settingsPath, JSON.stringify({ hooks: { PostToolUse: [{
      matcher: "run_shell_command", hooks: [{ type: "command", command: `${launcherPath} qwen-code-post-tool-use` }],
    }] } }));
    const report = await doctorQwenCodeHook(settingsPath, { binaryPath: launcherPath, local: true });
    expect(report.status).toBe("broken");
    expect(report.advisories).toContain("Legacy Qwen Code PostToolUse hook cannot replace terminal output; reinstall to enable pre-tool wrapping.");
    expect((await uninstallQwenCodeHook(settingsPath)).removed).toBe(1);
  });

  it.each(["run_shell_command", "Bash", "Shell"])("wraps %s input without changing other fields or granting permission", async (toolName) => {
    const toolInput = { command: "printf '%s\\n' \"a b\" && exit 7", timeout: 45000, is_background: false };
    const { code, output } = await captureStdout(() => runQwenCodePreToolUseHook(JSON.stringify({
      hook_event_name: "PreToolUse", tool_name: toolName, tool_input: toolInput,
    }), "/opt/tokenjuice/bin/tokenjuice"));
    const response = JSON.parse(output).hookSpecificOutput;
    expect(code).toBe(0);
    expect(response.hookEventName).toBe("PreToolUse");
    expect(response.updatedInput).toEqual({ ...toolInput, command: expect.stringContaining("wrap --source") });
    expect(response.updatedInput.command).toContain("/bin/sh -lc");
    expect(response.updatedInput.command).toContain("exit 7");
    expect(response.permissionDecision).toBeUndefined();
  });

  it.each([
    "not json", "null", "[]",
    JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "run_shell_command", tool_input: { command: "ls" } }),
    JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "read_file", tool_input: { command: "ls" } }),
    JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "run_shell_command", tool_input: {} }),
  ])("leaves unsupported pre-tool payloads unchanged: %s", async (payload) => {
    expect(await captureStdout(() => runQwenCodePreToolUseHook(payload))).toEqual({ code: 0, output: "{}\n" });
  });

  it.each([
    "tokenjuice wrap --raw -- find fixtures -type f",
    "node /opt/tokenjuice/dist/cli/main.js wrap --raw -- find fixtures -type f",
    "cd /repo && /opt/bin/tokenjuice wrap --full -- cat exact.txt",
  ])("does not rewrap explicit wrappers: %s", async (command) => {
    expect(await captureStdout(() => runQwenCodePreToolUseHook(JSON.stringify({
      hook_event_name: "PreToolUse", tool_name: "run_shell_command", tool_input: { command },
    })))).toEqual({ code: 0, output: "{}\n" });
  });

  it("requires WSL for native Windows wrapping", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    await expect(installQwenCodeHook(undefined, { local: true })).rejects.toThrow("WSL");
    const report = await doctorQwenCodeHook(undefined, { projectDir: await createTempDir(), binaryPath: "/opt/tokenjuice", local: true });
    expect(report.status).toBe("disabled");
    expect(report.fixCommand).toContain("WSL");
    expect(await captureStdout(() => runQwenCodePreToolUseHook(JSON.stringify({
      hook_event_name: "PreToolUse", tool_name: "run_shell_command", tool_input: { command: "ls" },
    })))).toEqual({ code: 0, output: "{}\n" });
  });

  it("retains the legacy context hook entrypoint", async () => {
    const payload = JSON.stringify({
      tool_name: "Bash",
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

    const { code, output } = await captureStdout(() => runQwenCodePostToolUseHook(payload));
    const response = JSON.parse(output) as {
      decision?: string;
      reason?: string;
      hookSpecificOutput?: {
        hookEventName?: string;
        additionalContext?: string;
      };
    };

    expect(code).toBe(0);
    expect(response.decision).toBe("allow");
    expect(response.reason).toContain("tokenjuice compacted");
    expect(response.hookSpecificOutput?.hookEventName).toBe("PostToolUse");
    expect(response.hookSpecificOutput?.additionalContext).toContain("Changes not staged:");
    expect(response.hookSpecificOutput?.additionalContext).toContain("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts");
    expect(response.hookSpecificOutput?.additionalContext).not.toContain("and have 8 and 642");
    expect(response.hookSpecificOutput?.additionalContext).toContain("tokenjuice wrap --raw -- <command>");
  });

  it("accepts camelCase payload fields and run_shell_command aliases", async () => {
    const payload = JSON.stringify({
      hookEventName: "PostToolUse",
      toolName: "run_shell_command",
      toolInput: {
        cmd: "git status",
      },
      toolResponse: {
        output: [
          "Changes not staged for commit:",
          "\tmodified:   README.md",
          "\tmodified:   docs/spec.md",
          "no changes added to commit",
        ].join("\n"),
      },
    });

    const { code, output } = await captureStdout(() => runQwenCodePostToolUseHook(payload));
    const response = JSON.parse(output) as { hookSpecificOutput?: { additionalContext?: string } };

    expect(code).toBe(0);
    expect(response.hookSpecificOutput?.additionalContext).toContain("M: README.md");
    expect(response.hookSpecificOutput?.additionalContext).toContain("M: docs/spec.md");
  });

  it("keeps unrelated hook payloads silent", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "ReadFile",
      tool_input: { path: "README.md" },
      tool_response: { llmContent: "hello" },
    });

    const { code, output } = await captureStdout(() => runQwenCodePostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });
});
