import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorQwenCodeHook,
  installQwenCodeHook,
  runQwenCodePostToolUseHook,
  uninstallQwenCodeHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.QWEN_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.QWEN_PROJECT_DIR;
  } else {
    process.env.QWEN_PROJECT_DIR = originalProjectDir;
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
  it("installs a PostToolUse hook into project Qwen Code settings", async () => {
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
        ],
      },
    }));

    const result = await installQwenCodeHook(settingsPath, { binaryPath: launcherPath, local: true });
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      selectedAuthType: string;
      hooks: { PostToolUse: Array<{ matcher: string; hooks: Array<{ command: string; name?: string }> }> };
    };

    await expect(access(`${settingsPath}.bak`)).resolves.toBeUndefined();
    expect(result.settingsPath).toBe(settingsPath);
    expect(result.command).toBe(`${launcherPath} qwen-code-post-tool-use`);
    expect(result.backupPath).toBe(`${settingsPath}.bak`);
    expect(parsed.selectedAuthType).toBe("openai");
    expect(parsed.hooks.PostToolUse).toHaveLength(2);
    expect(parsed.hooks.PostToolUse[1]?.matcher).toBe("^(Bash|Shell|run_shell_command)$");
    expect(parsed.hooks.PostToolUse[1]?.hooks[0]?.name).toBe("tokenjuice");
    expect(parsed.hooks.PostToolUse[1]?.hooks[0]?.command).toBe(`${launcherPath} qwen-code-post-tool-use`);
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
    expect(installed.detectedCommand).toBe(`${launcherPath} qwen-code-post-tool-use`);
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
    const parsed = JSON.parse(await readFile(expectedSettingsPath, "utf8")) as { hooks: { PostToolUse: unknown[] } };

    expect(removed.settingsPath).toBe(expectedSettingsPath);
    expect(removed.removed).toBe(1);
    expect(parsed.hooks.PostToolUse).toEqual([]);
  });

  it("injects compacted context for noisy Bash output", async () => {
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
