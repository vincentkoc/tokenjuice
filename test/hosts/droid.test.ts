import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorDroidHook,
  installDroidHook,
  runDroidPostToolUseHook,
  uninstallDroidHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalFactoryHome = process.env.FACTORY_HOME;

afterEach(async () => {
  if (originalFactoryHome === undefined) {
    delete process.env.FACTORY_HOME;
  } else {
    process.env.FACTORY_HOME = originalFactoryHome;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-droid-test-"));
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

describe("droid hooks", () => {
  it("installs a PostToolUse hook into Factory settings.json", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "bin", "tokenjuice");

    const result = await installDroidHook(settingsPath, { binaryPath: launcherPath, local: true });
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { PostToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string; timeout: number }> }> };
    };

    expect(result.settingsPath).toBe(settingsPath);
    expect(result.command).toBe(`${launcherPath} droid-post-tool-use`);
    expect(result.backupPath).toBeUndefined();
    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse[0]?.matcher).toBe("Execute");
    expect(parsed.hooks.PostToolUse[0]?.hooks[0]?.command).toBe(`${launcherPath} droid-post-tool-use`);
    expect(parsed.hooks.PostToolUse[0]?.hooks[0]?.timeout).toBe(60);
  });

  it("preserves unrelated settings and hooks on install", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "bin", "tokenjuice");
    await writeFile(settingsPath, JSON.stringify({
      theme: "dark",
      customModels: [{ model: "test" }],
      hooks: {
        PreToolUse: [
          {
            matcher: "Edit",
            hooks: [{ type: "command", command: "other-hook" }],
          },
        ],
      },
    }));

    const result = await installDroidHook(settingsPath, { binaryPath: launcherPath, local: true });
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;

    expect(result.backupPath).toBe(`${settingsPath}.bak`);
    expect(parsed.theme).toBe("dark");
    expect(parsed.customModels).toEqual([{ model: "test" }]);
    expect((parsed.hooks as Record<string, unknown>).PreToolUse).toHaveLength(1);
    expect((parsed.hooks as Record<string, unknown>).PostToolUse).toHaveLength(1);
  });

  it("replaces existing tokenjuice droid hook on reinstall", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "bin", "tokenjuice");

    await installDroidHook(settingsPath, { binaryPath: launcherPath, local: true });
    const first = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { PostToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
    };
    expect(first.hooks.PostToolUse).toHaveLength(1);

    const newLauncherPath = join(home, "bin", "tokenjuice-new");
    await installDroidHook(settingsPath, { binaryPath: newLauncherPath, local: true });
    const second = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { PostToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
    };

    expect(second.hooks.PostToolUse).toHaveLength(1);
    expect(second.hooks.PostToolUse[0]?.hooks[0]?.command).toBe(`${newLauncherPath} droid-post-tool-use`);
  });

  it("reports installed and uninstalled hook health", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "tokenjuice");
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    await installDroidHook(settingsPath, { binaryPath: launcherPath, local: true });
    const installed = await doctorDroidHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(installed.status).toBe("ok");
    expect(installed.detectedCommand).toBe(`${launcherPath} droid-post-tool-use`);
    expect(installed.advisories[0]).toContain("beta");

    const removed = await uninstallDroidHook(settingsPath);
    const disabled = await doctorDroidHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(removed.removed).toBe(1);
    expect(disabled.status).toBe("disabled");
  });

  it("reports disabled status when settings.json does not exist", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "tokenjuice");

    const report = await doctorDroidHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(report.status).toBe("disabled");
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toContain("not installed");
  });

  it("compacts noisy shell output and returns JSON with suppressOutput", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Execute",
      cwd: "/repo",
      tool_input: {
        command: "git status",
      },
      tool_response: [
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
    });

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(payload));
    const response = JSON.parse(output) as {
      suppressOutput?: boolean;
      hookSpecificOutput?: {
        hookEventName?: string;
        additionalContext?: string;
      };
    };

    expect(code).toBe(0);
    expect(response.suppressOutput).toBe(true);
    expect(response.hookSpecificOutput?.hookEventName).toBe("PostToolUse");
    expect(response.hookSpecificOutput?.additionalContext).toContain("Changes not staged:");
    expect(response.hookSpecificOutput?.additionalContext).toContain("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts");
    expect(response.hookSpecificOutput?.additionalContext).not.toContain("and have 8 and 642");
    expect(response.hookSpecificOutput?.additionalContext).toContain("tokenjuice wrap --raw");
  });

  it("keeps unrelated hook payloads silent", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "README.md" },
      tool_response: { content: "hello" },
    });

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });

  it("skips non-PostToolUse events", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Execute",
      tool_input: { command: "ls" },
    });

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });

  it("skips payloads with missing command", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Execute",
      tool_input: {},
      tool_response: "some output",
    });

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });

  it("skips payloads with empty tool response", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Execute",
      tool_input: { command: "ls" },
      tool_response: "",
    });

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });

  it("skips invalid JSON gracefully", async () => {
    const { code, output } = await captureStdout(() => runDroidPostToolUseHook("not json"));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });

  it("uninstall removes tokenjuice hooks but preserves other hooks", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "bin", "tokenjuice");

    await installDroidHook(settingsPath, { binaryPath: launcherPath, local: true });

    // Add another hook manually
    const current = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { PostToolUse: unknown[] };
    };
    current.hooks.PostToolUse.push({
      matcher: "Edit",
      hooks: [{ type: "command", command: "other-hook" }],
    });
    await writeFile(settingsPath, `${JSON.stringify(current, null, 2)}\n`);

    const result = await uninstallDroidHook(settingsPath);
    const after = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { PostToolUse: Array<{ matcher: string }> };
    };

    expect(result.removed).toBe(1);
    expect(after.hooks.PostToolUse).toHaveLength(1);
    expect(after.hooks.PostToolUse[0]?.matcher).toBe("Edit");
  });
});
