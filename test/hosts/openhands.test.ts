import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorOpenHandsHook,
  installOpenHandsHook,
  runOpenHandsPostToolUseHook,
  uninstallOpenHandsHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.OPENHANDS_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.OPENHANDS_PROJECT_DIR;
  } else {
    process.env.OPENHANDS_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-openhands-test-"));
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

describe("openhands hooks", () => {
  it("installs a PostToolUse hook into OpenHands hooks config", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".openhands", "hooks.json");
    const launcherPath = join(home, "bin", "tokenjuice");
    await mkdir(join(home, ".openhands"), { recursive: true });
    await writeFile(hooksPath, JSON.stringify({
      stop: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: ".openhands/hooks/require-tests.sh" }],
        },
      ],
      post_tool_use: [
        {
          matcher: "browser",
          hooks: [{ type: "command", command: ".openhands/hooks/log-browser.sh" }],
        },
      ],
    }));

    const result = await installOpenHandsHook(hooksPath, { binaryPath: launcherPath, local: true });
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      stop: Array<{ matcher: string }>;
      post_tool_use: Array<{ matcher: string; hooks: Array<{ command: string; type?: string; timeout?: number }> }>;
    };

    await expect(access(`${hooksPath}.bak`)).resolves.toBeUndefined();
    expect(result.hooksPath).toBe(hooksPath);
    expect(result.command).toBe(`${launcherPath} openhands-post-tool-use`);
    expect(result.backupPath).toBe(`${hooksPath}.bak`);
    expect(parsed.stop).toHaveLength(1);
    expect(parsed.post_tool_use).toHaveLength(2);
    expect(parsed.post_tool_use[1]?.matcher).toBe("terminal");
    expect(parsed.post_tool_use[1]?.hooks[0]?.type).toBe("command");
    expect(parsed.post_tool_use[1]?.hooks[0]?.timeout).toBe(60);
    expect(parsed.post_tool_use[1]?.hooks[0]?.command).toBe(`${launcherPath} openhands-post-tool-use`);
  });

  it("reports installed and uninstalled hook health", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".openhands", "hooks.json");
    const launcherPath = join(home, "tokenjuice");
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    await installOpenHandsHook(hooksPath, { binaryPath: launcherPath, local: true });
    const installed = await doctorOpenHandsHook(hooksPath, { binaryPath: launcherPath, local: true });

    expect(installed.status).toBe("ok");
    expect(installed.detectedCommand).toBe(`${launcherPath} openhands-post-tool-use`);
    expect(installed.advisories[0]).toContain("beta");

    const removed = await uninstallOpenHandsHook(hooksPath);
    const disabled = await doctorOpenHandsHook(hooksPath, { binaryPath: launcherPath, local: true });

    expect(removed.removed).toBe(1);
    expect(disabled.status).toBe("disabled");
  });

  it("uses OPENHANDS_PROJECT_DIR for default project-local hooks", async () => {
    const home = await createTempDir();
    process.env.OPENHANDS_PROJECT_DIR = home;

    const installed = await installOpenHandsHook(undefined, { local: true });
    const expectedHooksPath = join(home, ".openhands", "hooks.json");
    const doctor = await doctorOpenHandsHook(undefined, { local: true });

    expect(installed.hooksPath).toBe(expectedHooksPath);
    expect(doctor.hooksPath).toBe(expectedHooksPath);
    expect(doctor.status).toBe("ok");
  });

  it("injects compacted context for noisy terminal output", async () => {
    const payload = JSON.stringify({
      event_type: "PostToolUse",
      tool_name: "terminal",
      working_dir: "/repo",
      tool_input: {
        command: "git status",
      },
      tool_response: {
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

    const { code, output } = await captureStdout(() => runOpenHandsPostToolUseHook(payload));
    const response = JSON.parse(output) as {
      additionalContext?: string;
    };

    expect(code).toBe(0);
    expect(response.additionalContext).toContain("Changes not staged:");
    expect(response.additionalContext).toContain("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts");
    expect(response.additionalContext).not.toContain("and have 8 and 642");
    expect(response.additionalContext).toContain("tokenjuice wrap --raw -- <command>");
  });

  it("keeps unrelated hook payloads silent", async () => {
    const payload = JSON.stringify({
      event_type: "PostToolUse",
      tool_name: "browser",
      tool_input: { url: "https://example.com" },
      tool_response: { output: "hello" },
    });

    const { code, output } = await captureStdout(() => runOpenHandsPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
  });
});
