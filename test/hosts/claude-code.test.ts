import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorClaudeCodeHook, doctorInstalledHooks, installClaudeCodeHook, installCodexHook, installPiExtension, runClaudeCodePostToolUseHook } from "../../src/index.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;

afterEach(async () => {
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CLAUDE_HOME;
  delete process.env.CODEX_HOME;
  delete process.env.CURSOR_HOME;
  delete process.env.PI_CODING_AGENT_DIR;
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

describe("doctorClaudeCodeHook", () => {
  it("reports a healthy installed launcher hook", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installClaudeCodeHook(settingsPath);

    const report = await doctorClaudeCodeHook(settingsPath);

    expect(report.status).toBe("ok");
    expect(report.detectedCommand).toBe(`${launcherPath} claude-code-post-tool-use`);
    expect(report.issues).toEqual([]);
  });

  it("flags stale Homebrew Cellar hook commands as broken", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const staleCommand = `${process.execPath} /opt/homebrew/Cellar/tokenjuice/0.2.0/libexec/dist/cli/main.js claude-code-post-tool-use`;

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(
      settingsPath,
      `${JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: staleCommand, statusMessage: "compacting bash output with tokenjuice" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorClaudeCodeHook(settingsPath);

    expect(report.status).toBe("broken");
    expect(report.detectedCommand).toBe(staleCommand);
    expect(report.issues).toContain("configured Claude Code hook is pinned to a versioned Homebrew Cellar path");
    expect(report.missingPaths).toContain("/opt/homebrew/Cellar/tokenjuice/0.2.0/libexec/dist/cli/main.js");
    expect(report.fixCommand).toBe("tokenjuice install claude-code");
  });
});

describe("doctorInstalledHooks", () => {
  it("reports codex and claude-code health together", async () => {
    const home = await createTempDir();
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    process.env.CODEX_HOME = home;
    process.env.CLAUDE_HOME = home;
    process.env.CURSOR_HOME = home;
    process.env.PI_CODING_AGENT_DIR = join(home, "pi-agent");
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(join(home, "config.toml"), "[features]\ncodex_hooks = true\n", "utf8");
    await installCodexHook(join(home, "hooks.json"));
    await installClaudeCodeHook(join(home, "settings.json"));
    await installPiExtension(undefined, { local: true });

    const report = await doctorInstalledHooks();

    expect(report.status).toBe("ok");
    expect(report.integrations.codex.status).toBe("ok");
    expect(report.integrations["claude-code"].status).toBe("ok");
    expect(report.integrations.pi.status).toBe("ok");
  });

  it("treats a disabled Codex hook as disabled instead of warn", async () => {
    const home = await createTempDir();
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    process.env.CODEX_HOME = home;
    process.env.CLAUDE_HOME = home;
    process.env.CURSOR_HOME = home;
    process.env.PI_CODING_AGENT_DIR = join(home, "pi-agent");
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(
      join(home, "hooks.json"),
      `${JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [{ type: "command", command: "echo session" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );
    await installClaudeCodeHook(join(home, "settings.json"));
    await installPiExtension(undefined, { local: true });

    const report = await doctorInstalledHooks();

    expect(report.status).toBe("ok");
    expect(report.integrations.codex.status).toBe("disabled");
    expect(report.integrations["claude-code"].status).toBe("ok");
    expect(report.integrations.pi.status).toBe("ok");
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
    const response = JSON.parse(output) as {
      decision: string;
      reason: string;
      hookSpecificOutput?: { additionalContext?: string };
    };
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      matchedReducer?: string;
    };

    expect(code).toBe(0);
    expect(response.decision).toBe("block");
    expect(response.reason).toContain("Changes not staged:");
    expect(response.reason).toContain("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts");
    expect(response.reason).not.toContain("and have 8 and 642");
    expect(response.hookSpecificOutput?.additionalContext).toContain("tokenjuice wrap --raw -- <command>");
    expect(response.hookSpecificOutput?.additionalContext).toContain("tokenjuice wrap --full -- <command>");
    expect(debug.rewrote).toBe(true);
    expect(debug.matchedReducer).toBe("git/status");
  });

  it("skips file-content inspection commands", async () => {
    const home = await createTempDir();
    process.env.CLAUDE_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "cat src/core/reduce.ts",
      },
      tool_response: "export function reduceExecution() {}\n",
    });

    const { code, output } = await captureStdout(() => runClaudeCodePostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("file-content-inspection-command");
  });

  it("rewrites safe repository inventory commands", async () => {
    const home = await createTempDir();
    process.env.CLAUDE_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "rg --files src/rules",
      },
      tool_response: Array.from({ length: 30 }, (_, index) => `src/rules/example-${index + 1}.json`).join("\n"),
    });

    const { code, output } = await captureStdout(() => runClaudeCodePostToolUseHook(payload));
    const response = JSON.parse(output) as {
      decision: string;
      reason: string;
    };
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      matchedReducer?: string;
    };

    expect(code).toBe(0);
    expect(response.decision).toBe("block");
    expect(response.reason).toContain("30 paths");
    expect(debug.rewrote).toBe(true);
    expect(debug.matchedReducer).toBe("filesystem/rg-files");
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

  it("honors tokenjuice raw bypass commands without re-compacting them", async () => {
    const home = await createTempDir();
    process.env.CLAUDE_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "tokenjuice wrap --raw -- bash -lc 'git show HEAD --stat'",
      },
      tool_response: [
        "commit abcdef",
        "Author: Example",
        "",
        " README.md | 10 +++++-----",
        " src/hosts/claude-code/index.ts | 12 +++++++-----",
      ].join("\n"),
    });

    const { code, output } = await captureStdout(() => runClaudeCodePostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("explicit-raw-bypass");
  });

  it("honors tokenjuice full bypass commands without re-compacting them", async () => {
    const home = await createTempDir();
    process.env.CLAUDE_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "tokenjuice wrap --full -- git log --oneline -50",
      },
      tool_response: Array.from({ length: 50 }, (_, i) => `${String(i).padStart(7, "0")} commit ${i}`).join("\n"),
    });

    const { code, output } = await captureStdout(() => runClaudeCodePostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("explicit-raw-bypass");
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

describe("claude code config directory discovery", () => {
  it("prefers CLAUDE_CONFIG_DIR over CLAUDE_HOME when both are set", async () => {
    const configDir = await createTempDir();
    const legacyHome = await createTempDir();
    process.env.CLAUDE_CONFIG_DIR = configDir;
    process.env.CLAUDE_HOME = legacyHome;

    const result = await installClaudeCodeHook();

    expect(result.settingsPath).toBe(join(configDir, "settings.json"));
  });

  it("uses CLAUDE_CONFIG_DIR when CLAUDE_HOME is unset", async () => {
    const configDir = await createTempDir();
    process.env.CLAUDE_CONFIG_DIR = configDir;

    const result = await installClaudeCodeHook();

    expect(result.settingsPath).toBe(join(configDir, "settings.json"));
  });

  it("falls back to CLAUDE_HOME when CLAUDE_CONFIG_DIR is unset", async () => {
    const legacyHome = await createTempDir();
    process.env.CLAUDE_HOME = legacyHome;

    const result = await installClaudeCodeHook();

    expect(result.settingsPath).toBe(join(legacyHome, "settings.json"));
  });

  it("writes hook debug log under CLAUDE_CONFIG_DIR when set", async () => {
    const configDir = await createTempDir();
    const legacyHome = await createTempDir();
    process.env.CLAUDE_CONFIG_DIR = configDir;
    process.env.CLAUDE_HOME = legacyHome;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "git status" },
      tool_response: "",
    });

    await captureStdout(() => runClaudeCodePostToolUseHook(payload));

    const debugPath = join(configDir, "tokenjuice-hook.last.json");
    const debug = JSON.parse(await readFile(debugPath, "utf8")) as { skipped?: string };
    expect(debug.skipped).toBe("empty-tool-response");
  });
});
