import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorGeminiCliHook,
  installGeminiCliHook,
  runGeminiCliAfterToolHook,
  uninstallGeminiCliHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalGeminiHome = process.env.GEMINI_HOME;

afterEach(async () => {
  if (originalGeminiHome === undefined) {
    delete process.env.GEMINI_HOME;
  } else {
    process.env.GEMINI_HOME = originalGeminiHome;
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
  it("installs an AfterTool hook into Gemini CLI settings", async () => {
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
        ],
      },
    }));

    const result = await installGeminiCliHook(settingsPath, { binaryPath: launcherPath, local: true });
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      theme: string;
      hooks: { AfterTool: Array<{ matcher: string; hooks: Array<{ command: string; name?: string }> }> };
    };

    expect(result.settingsPath).toBe(settingsPath);
    expect(result.command).toBe(`${launcherPath} gemini-cli-after-tool`);
    expect(result.backupPath).toBe(`${settingsPath}.bak`);
    expect(parsed.theme).toBe("dark");
    expect(parsed.hooks.AfterTool).toHaveLength(2);
    expect(parsed.hooks.AfterTool[1]?.matcher).toBe("run_shell_command");
    expect(parsed.hooks.AfterTool[1]?.hooks[0]?.name).toBe("tokenjuice");
    expect(parsed.hooks.AfterTool[1]?.hooks[0]?.command).toBe(`${launcherPath} gemini-cli-after-tool`);
  });

  it("reports installed and uninstalled hook health", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "tokenjuice");
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    await installGeminiCliHook(settingsPath, { binaryPath: launcherPath, local: true });
    const installed = await doctorGeminiCliHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(installed.status).toBe("ok");
    expect(installed.detectedCommand).toBe(`${launcherPath} gemini-cli-after-tool`);
    expect(installed.advisories[0]).toContain("beta");

    const removed = await uninstallGeminiCliHook(settingsPath);
    const disabled = await doctorGeminiCliHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(removed.removed).toBe(1);
    expect(disabled.status).toBe("disabled");
  });

  it("replaces noisy shell output with compacted context", async () => {
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
