import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { installClaudeCodeHook, runClaudeCodePostToolUseHook } from "../src/index.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;

afterEach(async () => {
  delete process.env.CLAUDE_HOME;
  process.env.PATH = originalPath;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-claude-code-test-"));
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

describe("installClaudeCodeHook", () => {
  it("installs a single tokenjuice PostToolUse hook on an empty settings file", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    const result = await installClaudeCodeHook(settingsPath);
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; statusMessage?: string }> }>>;
    };

    expect(result.settingsPath).toBe(settingsPath);
    expect(result.backupPath).toBeUndefined();
    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse[0]?.matcher).toBe("Bash");
    expect(parsed.hooks.PostToolUse[0]?.hooks[0]?.command).toContain("claude-code-post-tool-use");
    expect(parsed.hooks.PostToolUse[0]?.hooks[0]?.statusMessage).toBe("compacting bash output with tokenjuice");
  });

  it("preserves unrelated top-level settings keys across install", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    await writeFile(
      settingsPath,
      `${JSON.stringify({
        permissions: {
          allow: ["Bash(git status)", "Bash(pnpm test)"],
          deny: ["Read(./.env)", "Bash(rm -rf /)"],
        },
        env: {
          NODE_ENV: "development",
          FEATURE_FLAG: "1",
        },
        statusLine: {
          type: "command",
          command: "echo status",
        },
        randomUserKey: {
          enabled: true,
          nested: {
            count: 2,
          },
        },
        hooks: {
          SessionStart: [
            {
              hooks: [{ type: "command", command: "echo session" }],
            },
          ],
          PostToolUse: [
            {
              matcher: "Edit",
              hooks: [{ type: "command", command: "echo keep-edit" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const result = await installClaudeCodeHook(settingsPath);
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      permissions?: unknown;
      env?: unknown;
      statusLine?: unknown;
      randomUserKey?: unknown;
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; statusMessage?: string }> }>>;
    };

    expect(result.settingsPath).toBe(settingsPath);
    expect(result.backupPath).toBe(`${settingsPath}.bak`);
    expect(parsed.permissions).toEqual({
      allow: ["Bash(git status)", "Bash(pnpm test)"],
      deny: ["Read(./.env)", "Bash(rm -rf /)"],
    });
    expect(parsed.env).toEqual({
      NODE_ENV: "development",
      FEATURE_FLAG: "1",
    });
    expect(parsed.statusLine).toEqual({
      type: "command",
      command: "echo status",
    });
    expect(parsed.randomUserKey).toEqual({
      enabled: true,
      nested: {
        count: 2,
      },
    });
    expect(parsed.hooks.SessionStart).toHaveLength(1);
    expect(parsed.hooks.PostToolUse).toHaveLength(2);
  });

  it("preserves non-command Claude Code hooks and extra handler fields", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    await writeFile(
      settingsPath,
      `${JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "Bash",
              extraGroupField: "keep-me",
              hooks: [
                { type: "command", command: "echo session", async: true, shell: "/bin/bash" },
                { type: "prompt", prompt: "session prompt" },
                { type: "http", url: "https://example.com/hooks" },
              ],
            },
          ],
          PostToolUse: [
            {
              matcher: "Edit",
              hooks: [{ type: "agent", prompt: "summarize the edit" }],
            },
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: "tokenjuice claude-code-post-tool-use --old",
                  statusMessage: "compacting bash output with tokenjuice",
                  async: true,
                },
              ],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    await installClaudeCodeHook(settingsPath);
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<Record<string, unknown> & { hooks: Array<Record<string, unknown>> }>>;
    };

    expect(parsed.hooks.SessionStart).toHaveLength(1);
    expect(parsed.hooks.SessionStart[0]?.extraGroupField).toBe("keep-me");
    expect(parsed.hooks.SessionStart[0]?.hooks).toEqual([
      { type: "command", command: "echo session", async: true, shell: "/bin/bash" },
      { type: "prompt", prompt: "session prompt" },
      { type: "http", url: "https://example.com/hooks" },
    ]);
    expect(parsed.hooks.PostToolUse).toHaveLength(2);
    expect(parsed.hooks.PostToolUse[0]?.matcher).toBe("Edit");
    expect(parsed.hooks.PostToolUse[0]?.hooks).toEqual([{ type: "agent", prompt: "summarize the edit" }]);
    expect(parsed.hooks.PostToolUse[1]?.matcher).toBe("Bash");
    expect(parsed.hooks.PostToolUse[1]?.hooks[0]?.command).toContain("claude-code-post-tool-use");
  });

  it("prefers a stable tokenjuice launcher from PATH when installing the hook", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(
      launcherPath,
      "#!/usr/bin/env bash\nexit 0\n",
      { encoding: "utf8", mode: 0o755 },
    );

    const result = await installClaudeCodeHook(settingsPath);
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };

    expect(result.command).toBe(`${launcherPath} claude-code-post-tool-use`);
    expect(parsed.hooks.PostToolUse?.[0]?.hooks[0]?.command).toBe(`${launcherPath} claude-code-post-tool-use`);
  });

  it("is idempotent and replaces old tokenjuice entries", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    await writeFile(
      settingsPath,
      `${JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: "tokenjuice claude-code-post-tool-use --old",
                  statusMessage: "compacting bash output with tokenjuice",
                },
              ],
            },
            {
              matcher: "Read",
              hooks: [{ type: "command", command: "echo keep-read" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    await installClaudeCodeHook(settingsPath);
    await installClaudeCodeHook(settingsPath);

    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; statusMessage?: string }> }>>;
    };

    const tokenjuiceHooks = parsed.hooks.PostToolUse.filter((group) =>
      group.hooks.some((hook) => hook.statusMessage === "compacting bash output with tokenjuice" || hook.command.includes("claude-code-post-tool-use")),
    );

    expect(parsed.hooks.PostToolUse).toHaveLength(2);
    expect(tokenjuiceHooks).toHaveLength(1);
    expect(tokenjuiceHooks[0]?.hooks[0]?.command).toContain("claude-code-post-tool-use");
  });

  it("preserves other PostToolUse matchers", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    await writeFile(
      settingsPath,
      `${JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "Write",
              hooks: [{ type: "command", command: "echo keep-write" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    await installClaudeCodeHook(settingsPath);
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; statusMessage?: string }> }>>;
    };

    expect(parsed.hooks.PostToolUse).toHaveLength(2);
    expect(parsed.hooks.PostToolUse[0]?.matcher).toBe("Write");
    expect(parsed.hooks.PostToolUse[0]?.hooks[0]?.command).toBe("echo keep-write");
    expect(parsed.hooks.PostToolUse[1]?.matcher).toBe("Bash");
    expect(parsed.hooks.PostToolUse[1]?.hooks[0]?.command).toContain("claude-code-post-tool-use");
  });
});

describe("runClaudeCodePostToolUseHook", () => {
  it("writes a block/reason decision on compactable bash output", async () => {
    const home = await createTempDir();
    process.env.CLAUDE_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
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

    const { code, output } = await captureStdout(() => runClaudeCodePostToolUseHook(payload));
    const response = JSON.parse(output) as { decision: string; reason: string };
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      matchedReducer?: string;
    };

    expect(code).toBe(0);
    expect(response.decision).toBe("block");
    expect(response.reason).toContain("Changes not staged:");
    expect(response.reason).toContain("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts");
    expect(response.reason).not.toContain("and have 8 and 642");
    expect(debug.rewrote).toBe(true);
    expect(debug.matchedReducer).toBe("git/status");
  });

  it("skips non-PostToolUse events", async () => {
    const home = await createTempDir();
    process.env.CLAUDE_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "Stop",
      tool_name: "Bash",
      tool_input: {
        command: "git status",
      },
      tool_response: "output",
    });

    const { code, output } = await captureStdout(() => runClaudeCodePostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("non-post-tool-use");
  });

  it("skips non-Bash tools", async () => {
    const home = await createTempDir();
    process.env.CLAUDE_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: {
        command: "cat README.md",
      },
      tool_response: "output",
    });

    const { code, output } = await captureStdout(() => runClaudeCodePostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("non-bash");
  });

  it("skips empty tool_response", async () => {
    const home = await createTempDir();
    process.env.CLAUDE_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "git status",
      },
      tool_response: "",
    });

    const { code, output } = await captureStdout(() => runClaudeCodePostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("empty-tool-response");
  });
});
