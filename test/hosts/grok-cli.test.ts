import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorGrokCliHook,
  installGrokCliHook,
  runGrokCliPostToolUseHook,
  uninstallGrokCliHook,
} from "../../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-grok-cli-test-"));
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

describe("grok-cli hooks", () => {
  it("installs a PostToolUse hook into Grok CLI user settings", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, ".grok", "user-settings.json");
    const launcherPath = join(home, "bin", "tokenjuice");
    await mkdir(join(home, ".grok"), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      defaultModel: "grok-code-fast-1",
      hooks: {
        PostToolUse: [
          {
            matcher: "read_file",
            hooks: [{ type: "command", command: "other-hook" }],
          },
        ],
      },
    }));

    const result = await installGrokCliHook(settingsPath, { binaryPath: launcherPath, local: true });
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      defaultModel: string;
      hooks: { PostToolUse: Array<{ matcher: string; hooks: Array<{ command: string; type?: string; timeout?: number }> }> };
    };

    await expect(access(`${settingsPath}.bak`)).resolves.toBeUndefined();
    expect(result.settingsPath).toBe(settingsPath);
    expect(result.command).toBe(`${launcherPath} grok-cli-post-tool-use`);
    expect(result.backupPath).toBe(`${settingsPath}.bak`);
    expect(parsed.defaultModel).toBe("grok-code-fast-1");
    expect(parsed.hooks.PostToolUse).toHaveLength(2);
    expect(parsed.hooks.PostToolUse[1]?.matcher).toBe("bash");
    expect(parsed.hooks.PostToolUse[1]?.hooks[0]?.type).toBe("command");
    expect(parsed.hooks.PostToolUse[1]?.hooks[0]?.timeout).toBe(30);
    expect(parsed.hooks.PostToolUse[1]?.hooks[0]?.command).toBe(`${launcherPath} grok-cli-post-tool-use`);
  });

  it("reports installed and uninstalled hook health", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, ".grok", "user-settings.json");
    const launcherPath = join(home, "tokenjuice");
    await mkdir(join(home, ".grok"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    await installGrokCliHook(settingsPath, { binaryPath: launcherPath, local: true });
    const installed = await doctorGrokCliHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(installed.status).toBe("ok");
    expect(installed.detectedCommand).toBe(`${launcherPath} grok-cli-post-tool-use`);
    expect(installed.advisories[0]).toContain("beta");

    const removed = await uninstallGrokCliHook(settingsPath);
    const disabled = await doctorGrokCliHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(removed.removed).toBe(1);
    expect(disabled.status).toBe("disabled");
  });

  it("injects compacted context for noisy bash output", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "bash",
      cwd: "/repo",
      tool_input: {
        command: "git status",
      },
      tool_output: {
        success: true,
        output: [
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

    const { code, output } = await captureStdout(() => runGrokCliPostToolUseHook(payload));
    const response = JSON.parse(output) as {
      additionalContext?: string;
    };

    expect(code).toBe(0);
    expect(response.additionalContext).toContain("Changes not staged:");
    expect(response.additionalContext).toContain("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts");
    expect(response.additionalContext).not.toContain("and have 8 and 642");
    expect(response.additionalContext).toContain("tokenjuice wrap --raw -- <command>");
  });

  it("accepts PostToolUse payloads without an event name", async () => {
    const payload = JSON.stringify({
      tool_name: "bash",
      tool_input: {
        command: "git status",
      },
      tool_output: {
        success: true,
        output: [
          "Changes not staged for commit:",
          "\tmodified:   README.md",
          "\tmodified:   docs/spec.md",
          "no changes added to commit",
        ].join("\n"),
      },
    });

    const { code, output } = await captureStdout(() => runGrokCliPostToolUseHook(payload));
    const response = JSON.parse(output) as {
      additionalContext?: string;
    };

    expect(code).toBe(0);
    expect(response.additionalContext).toContain("M: README.md");
    expect(response.additionalContext).toContain("M: docs/spec.md");
  });

  it("honors tokenjuice raw bypass commands without re-compacting them", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "bash",
      cwd: "/repo",
      tool_input: {
        command: "tokenjuice wrap --raw -- git log --oneline -50",
      },
      tool_output: {
        success: true,
        output: Array.from({ length: 50 }, (_, i) => `${String(i).padStart(7, "0")} commit message ${i}`).join("\n"),
      },
    });

    const { code, output } = await captureStdout(() => runGrokCliPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });

  it("honors tokenjuice full bypass commands with leading cd prefixes", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "bash",
      cwd: "/repo",
      tool_input: {
        command: "cd /data/code/project && tokenjuice wrap --full -- python scripts/dump.py --limit 500",
      },
      tool_output: {
        success: true,
        output: Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n"),
      },
    });

    const { code, output } = await captureStdout(() => runGrokCliPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });

  it("does not treat inner command flags as a raw bypass without the wrap separator", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "bash",
      cwd: "/repo",
      tool_input: {
        command: "tokenjuice wrap git diff --raw",
      },
      tool_output: {
        success: true,
        output: Array.from({ length: 80 }, (_, i) => `diff line ${i + 1}`).join("\n"),
      },
    });

    const { code, output } = await captureStdout(() => runGrokCliPostToolUseHook(payload));
    const response = JSON.parse(output) as {
      additionalContext?: string;
    };

    expect(code).toBe(0);
    expect(response.additionalContext).toContain("diff line");
  });

  it("honors absolute tokenjuice raw bypass commands", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "bash",
      cwd: "/repo",
      tool_input: {
        command: "/usr/local/bin/tokenjuice wrap --raw -- git status",
      },
      tool_output: {
        success: true,
        output: Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n"),
      },
    });

    const { code, output } = await captureStdout(() => runGrokCliPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });

  it("keeps unrelated hook payloads silent", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "read_file",
      tool_input: { path: "README.md" },
      tool_output: { output: "hello" },
    });

    const { code, output } = await captureStdout(() => runGrokCliPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });

  it("keeps failed bash payloads silent", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "bash",
      tool_input: {
        command: "pnpm test",
      },
      tool_output: {
        success: false,
        output: "FAIL test/example.test.ts\nexpected true to be false\n".repeat(20),
      },
    });

    const { code, output } = await captureStdout(() => runGrokCliPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });
});
