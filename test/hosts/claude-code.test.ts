import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorClaudeCodeHook,
  doctorInstalledHooks,
  installClaudeCodeHook,
  installCodeBuddyHook,
  installCodexHook,
  installCursorHook,
  installPiExtension,
  runClaudeCodePostToolUseHook,
  runClaudeCodePreToolUseHook,
} from "../../src/index.js";
import { getInstalledHookIntegrations } from "../../src/hosts/shared/hook-doctor.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalFactoryHome = process.env.FACTORY_HOME;

afterEach(async () => {
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CLAUDE_HOME;
  delete process.env.TOKENJUICE_CLAUDE_CODE_SHELL;
  delete process.env.CODEBUDDY_CONFIG_DIR;
  delete process.env.CODEBUDDY_HOME;
  delete process.env.CODEX_HOME;
  delete process.env.CURSOR_HOME;
  delete process.env.FACTORY_HOME;
  delete process.env.PI_CODING_AGENT_DIR;
  delete process.env.COPILOT_HOME;
  process.env.PATH = originalPath;
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalFactoryHome === undefined) {
    delete process.env.FACTORY_HOME;
  } else {
    process.env.FACTORY_HOME = originalFactoryHome;
  }
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

async function captureStdio(run: () => Promise<number>): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stderr.write;

  try {
    const code = await run();
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

describe("installClaudeCodeHook", () => {
  it("installs a single tokenjuice PreToolUse hook on an empty settings file", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    const result = await installClaudeCodeHook(settingsPath);
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; statusMessage?: string; timeout?: number }> }>>;
    };

    expect(result.settingsPath).toBe(settingsPath);
    expect(result.backupPath).toBeUndefined();
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse[0]?.matcher).toBe("Bash");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.command).toContain("claude-code-pre-tool-use");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.command).toContain("--wrap-launcher");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.statusMessage).toBe("wrapping bash through tokenjuice for compaction");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.timeout).toBe(10);
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
    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
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
    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse[0]?.matcher).toBe("Edit");
    expect(parsed.hooks.PostToolUse[0]?.hooks).toEqual([{ type: "agent", prompt: "summarize the edit" }]);
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse[0]?.matcher).toBe("Bash");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.command).toContain("claude-code-pre-tool-use");
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

    const expectedCommand = `${launcherPath} claude-code-pre-tool-use --wrap-launcher ${launcherPath}`;
    expect(result.command).toBe(expectedCommand);
    expect(parsed.hooks.PreToolUse?.[0]?.hooks[0]?.command).toBe(expectedCommand);
  });

  it("can force local repo routing instead of the PATH launcher", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const localCliPath = join(home, "dist", "cli", "main.js");
    const localNodePath = join(home, "node");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await mkdir(join(home, "dist", "cli"), { recursive: true });
    await writeFile(
      launcherPath,
      "#!/usr/bin/env bash\nexit 0\n",
      { encoding: "utf8", mode: 0o755 },
    );
    await writeFile(localCliPath, "console.log('tokenjuice');\n", "utf8");
    await writeFile(localNodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const result = await installClaudeCodeHook(settingsPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };

    const expectedCommand = `${localNodePath} ${resolve(localCliPath)} claude-code-pre-tool-use --wrap-launcher ${resolve(localCliPath)}`;
    expect(result.command).toBe(expectedCommand);
    expect(parsed.hooks.PreToolUse?.[0]?.hooks[0]?.command).toBe(expectedCommand);
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

    const tokenjuiceHooks = parsed.hooks.PreToolUse.filter((group) =>
      group.hooks.some((hook) => hook.statusMessage === "wrapping bash through tokenjuice for compaction" || hook.command.includes("claude-code-pre-tool-use")),
    );

    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse[0]?.matcher).toBe("Read");
    expect(parsed.hooks.PostToolUse[0]?.hooks[0]?.command).toBe("echo keep-read");
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(tokenjuiceHooks).toHaveLength(1);
    expect(tokenjuiceHooks[0]?.hooks[0]?.command).toContain("claude-code-pre-tool-use");
  });

  it("preserves other PostToolUse matchers while adding PreToolUse", async () => {
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

    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse[0]?.matcher).toBe("Write");
    expect(parsed.hooks.PostToolUse[0]?.hooks[0]?.command).toBe("echo keep-write");
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse[0]?.matcher).toBe("Bash");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.command).toContain("claude-code-pre-tool-use");
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
    expect(report.detectedCommand).toBe(`${launcherPath} claude-code-pre-tool-use --wrap-launcher ${launcherPath}`);
    expect(report.issues).toEqual([]);
  });

  it("reports a healthy local hook when asked to check local mode", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const localCliPath = join(home, "dist", "cli", "main.js");
    const localNodePath = join(home, "node");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await mkdir(join(home, "dist", "cli"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(localCliPath, "console.log('tokenjuice');\n", "utf8");
    await writeFile(localNodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installClaudeCodeHook(settingsPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });

    const report = await doctorClaudeCodeHook(settingsPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });

    expect(report.status).toBe("ok");
    expect(report.expectedCommand).toBe(`${localNodePath} ${resolve(localCliPath)} claude-code-pre-tool-use --wrap-launcher ${resolve(localCliPath)}`);
    expect(report.detectedCommand).toBe(report.expectedCommand);
    expect(report.fixCommand).toBe("tokenjuice install claude-code --local");
  });

  it("flags stale Homebrew Cellar hook commands as broken", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const staleCommand = `${process.execPath} /opt/homebrew/Cellar/tokenjuice/0.2.0/libexec/dist/cli/main.js claude-code-pre-tool-use --wrap-launcher /opt/homebrew/Cellar/tokenjuice/0.2.0/libexec/dist/cli/main.js`;

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(
      settingsPath,
      `${JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: staleCommand, statusMessage: "wrapping bash through tokenjuice for compaction", timeout: 10 }],
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

  it("warns when the tokenjuice Claude Code hook is missing the timeout safety cap", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(
      settingsPath,
      `${JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: `${launcherPath} claude-code-pre-tool-use --wrap-launcher ${launcherPath}`, statusMessage: "wrapping bash through tokenjuice for compaction" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorClaudeCodeHook(settingsPath);

    expect(report.status).toBe("warn");
    expect(report.issues).toContain(
      "configured Claude Code tokenjuice hook timeout is missing or stale; run tokenjuice install claude-code to add the 10s safety cap",
    );
  });

  it("warns when only the legacy PostToolUse hook is installed", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

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
              hooks: [{ type: "command", command: `${launcherPath} claude-code-post-tool-use`, statusMessage: "compacting bash output with tokenjuice" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorClaudeCodeHook(settingsPath);

    expect(report.status).toBe("warn");
    expect(report.detectedCommand).toBe(`${launcherPath} claude-code-post-tool-use`);
    expect(report.issues).toContain(
      "legacy Claude Code PostToolUse tokenjuice hook is installed; rerun tokenjuice install claude-code to migrate to PreToolUse",
    );
  });
});

describe("doctorInstalledHooks", () => {
  it("does not treat missing command-backed provider configs as installed hooks", async () => {
    const home = await createTempDir();
    const binDir = join(home, "bin");

    process.env.PATH = binDir;
    process.env.HOME = home;
    process.env.CODEX_HOME = join(home, "codex");
    process.env.CLAUDE_HOME = join(home, "claude");
    process.env.CODEBUDDY_HOME = join(home, "codebuddy");
    process.env.CURSOR_HOME = join(home, "cursor");
    process.env.FACTORY_HOME = join(home, "factory");
    process.env.COPILOT_HOME = join(home, "copilot");
    process.env.PI_CODING_AGENT_DIR = join(home, "pi-agent");
    await mkdir(binDir, { recursive: true });
    await writeFile(join(binDir, "tokenjuice"), "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const report = await doctorInstalledHooks();

    expect(report.status).toBe("disabled");
    expect(report.integrations["claude-code"].status).toBe("warn");
    expect(getInstalledHookIntegrations(report)).toEqual([]);
  });

  it("reports codex and claude-code health together", async () => {
    const home = await createTempDir();
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const codebuddyHome = join(home, "codebuddy");

    process.env.PATH = binDir;
    process.env.HOME = home;
    process.env.CODEX_HOME = home;
    process.env.CLAUDE_HOME = home;
    process.env.CODEBUDDY_HOME = codebuddyHome;
    process.env.CURSOR_HOME = home;
    process.env.FACTORY_HOME = join(home, "factory");
    process.env.COPILOT_HOME = home;
    process.env.PI_CODING_AGENT_DIR = join(home, "pi-agent");
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(join(home, "config.toml"), "[features]\ncodex_hooks = true\n", "utf8");
    await installCodexHook(join(home, "hooks.json"));
    await installClaudeCodeHook(join(home, "settings.json"));
    await installCodeBuddyHook();
    await installPiExtension(undefined, { local: true });

    const report = await doctorInstalledHooks();

    expect(report.status).toBe("ok");
    expect(report.integrations.codex.status).toBe("ok");
    expect(report.integrations["claude-code"].status).toBe("ok");
    expect(report.integrations.codebuddy.status).toBe("ok");
    expect(report.integrations.pi.status).toBe("ok");
  });

  it("treats a disabled Codex hook as disabled instead of warn", async () => {
    const home = await createTempDir();
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const codebuddyHome = join(home, "codebuddy");

    process.env.PATH = binDir;
    process.env.HOME = home;
    process.env.CODEX_HOME = home;
    process.env.CLAUDE_HOME = home;
    process.env.CODEBUDDY_HOME = codebuddyHome;
    process.env.CURSOR_HOME = home;
    process.env.FACTORY_HOME = join(home, "factory");
    process.env.COPILOT_HOME = home;
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
    await installCodeBuddyHook();
    await installPiExtension(undefined, { local: true });

    const report = await doctorInstalledHooks();

    expect(report.status).toBe("ok");
    expect(report.integrations.codex.status).toBe("disabled");
    expect(report.integrations["claude-code"].status).toBe("ok");
    expect(report.integrations.codebuddy.status).toBe("ok");
    expect(report.integrations.pi.status).toBe("ok");
  });

  it("passes local hook expectations through to codex, claude-code, and cursor", async () => {
    const home = await createTempDir();
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const codexHome = join(home, "codex");
    const claudeHome = join(home, "claude");
    const codebuddyHome = join(home, "codebuddy");
    const cursorHome = join(home, "cursor");
    const piAgentDir = join(home, "pi-agent");
    const localBinaryPath = join(home, "dist", "cli", "main.js");
    const localNodePath = join(home, "node");
    const expectedHookPrefix = `${localNodePath} ${resolve(localBinaryPath)}`;

    process.env.PATH = binDir;
    process.env.HOME = home;
    process.env.CODEX_HOME = codexHome;
    process.env.CLAUDE_HOME = claudeHome;
    process.env.CODEBUDDY_HOME = codebuddyHome;
    process.env.CURSOR_HOME = cursorHome;
    process.env.FACTORY_HOME = join(home, "factory");
    process.env.COPILOT_HOME = home;
    process.env.PI_CODING_AGENT_DIR = piAgentDir;
    await mkdir(binDir, { recursive: true });
    await mkdir(join(home, "dist", "cli"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(localBinaryPath, "console.log('tokenjuice');\n", "utf8");
    await writeFile(localNodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await mkdir(codexHome, { recursive: true });
    await writeFile(join(codexHome, "config.toml"), "[features]\ncodex_hooks = true\n", "utf8");

    await installCodexHook(undefined, {
      local: true,
      binaryPath: localBinaryPath,
      nodePath: localNodePath,
      featureFlagConfigPath: join(codexHome, "config.toml"),
    });
    await installClaudeCodeHook(undefined, {
      local: true,
      binaryPath: localBinaryPath,
      nodePath: localNodePath,
    });
    await installCodeBuddyHook(undefined, {
      local: true,
      binaryPath: localBinaryPath,
      nodePath: localNodePath,
    });
    await installCursorHook(undefined, {
      local: true,
      binaryPath: localBinaryPath,
      nodePath: localNodePath,
    });
    await installPiExtension(undefined, { local: true });

    const report = await doctorInstalledHooks({
      local: true,
      binaryPath: localBinaryPath,
      nodePath: localNodePath,
      featureFlagConfigPath: join(codexHome, "config.toml"),
    });

    expect(report.status).toBe("ok");
    expect(report.integrations.codex.status).toBe("ok");
    expect(report.integrations["claude-code"].status).toBe("ok");
    expect(report.integrations.codebuddy.status).toBe("ok");
    expect(report.integrations.cursor.status).toBe("ok");
    expect(report.integrations.pi.status).toBe("ok");
    expect(report.integrations.codex.expectedCommand).toContain(expectedHookPrefix);
    expect(report.integrations["claude-code"].expectedCommand).toContain(expectedHookPrefix);
    expect(report.integrations.codebuddy.expectedCommand).toContain(expectedHookPrefix);
    expect(report.integrations.cursor.expectedCommand).toContain(expectedHookPrefix);
  });
});

describe("runClaudeCodePreToolUseHook", () => {
  it("rewrites Bash command input without granting permission", async () => {
    const home = await createTempDir();
    const shellPath = join(home, "bash");
    process.env.TOKENJUICE_CLAUDE_CODE_SHELL = shellPath;
    await writeFile(shellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "git status --short && pnpm test",
        description: "check status",
        timeout: 120000,
        run_in_background: false,
      },
    });

    const { code, output } = await captureStdout(() => runClaudeCodePreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as {
      hookSpecificOutput?: {
        hookEventName?: string;
        permissionDecision?: string;
        updatedInput?: {
          command?: string;
          description?: string;
          timeout?: number;
          run_in_background?: boolean;
        };
      };
    };

    expect(code).toBe(0);
    expect(response.hookSpecificOutput?.hookEventName).toBe("PreToolUse");
    expect(response.hookSpecificOutput).not.toHaveProperty("permissionDecision");
    expect(response.hookSpecificOutput?.updatedInput?.description).toBe("check status");
    expect(response.hookSpecificOutput?.updatedInput?.timeout).toBe(120000);
    expect(response.hookSpecificOutput?.updatedInput?.run_in_background).toBe(false);
    expect(response.hookSpecificOutput?.updatedInput?.command).toContain("/usr/local/bin/tokenjuice wrap --source claude-code --");
    expect(response.hookSpecificOutput?.updatedInput?.command).toContain(shellPath);
    expect(response.hookSpecificOutput?.updatedInput?.command).toContain("git status --short && pnpm test");
  });

  it("uses a node launcher when the wrap launcher is a local js entrypoint", async () => {
    const home = await createTempDir();
    const shellPath = join(home, "sh");
    const launcherPath = join(home, "dist", "cli", "main.js");
    process.env.TOKENJUICE_CLAUDE_CODE_SHELL = shellPath;
    await writeFile(shellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "pnpm test",
      },
    });

    const { code, output } = await captureStdout(() => runClaudeCodePreToolUseHook(payload, launcherPath));
    const response = JSON.parse(output) as {
      hookSpecificOutput?: {
        updatedInput?: {
          command?: string;
        };
      };
    };

    expect(code).toBe(0);
    expect(response.hookSpecificOutput?.updatedInput?.command).toContain(`${process.execPath} ${launcherPath} wrap --source claude-code --`);
  });

  it("skips non-PreToolUse events", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "git status",
      },
    });

    const { code, output } = await captureStdout(() => runClaudeCodePreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it("skips non-Bash tools", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: {
        command: "cat README.md",
      },
    });

    const { code, output } = await captureStdout(() => runClaudeCodePreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it("skips missing commands", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: {
        description: "no command",
      },
    });

    const { code, output } = await captureStdout(() => runClaudeCodePreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it("skips commands that are already wrapped", async () => {
    const home = await createTempDir();
    const shellPath = join(home, "bash");
    process.env.TOKENJUICE_CLAUDE_CODE_SHELL = shellPath;
    await writeFile(shellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "tokenjuice wrap --raw -- bash -lc 'git show HEAD --stat'",
      },
    });

    const { code, output } = await captureStdout(() => runClaudeCodePreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it("keeps the legacy PostToolUse subcommand as a no-op migration shim", async () => {
    const { code, stdout, stderr } = await captureStdio(() => runClaudeCodePostToolUseHook("{}"));

    expect(code).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("claude-code-post-tool-use is deprecated");
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

  it("writes the PreToolUse hook under CLAUDE_CONFIG_DIR when set", async () => {
    const configDir = await createTempDir();
    const legacyHome = await createTempDir();
    process.env.CLAUDE_CONFIG_DIR = configDir;
    process.env.CLAUDE_HOME = legacyHome;

    await installClaudeCodeHook();

    const settings = JSON.parse(await readFile(join(configDir, "settings.json"), "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    expect(settings.hooks.PreToolUse?.[0]?.hooks[0]?.command).toContain("claude-code-pre-tool-use");
  });

  it("doctor reads settings.json from CLAUDE_CONFIG_DIR when no path is provided", async () => {
    const configDir = await createTempDir();
    process.env.CLAUDE_CONFIG_DIR = configDir;
    await installClaudeCodeHook();

    const report = await doctorClaudeCodeHook();

    expect(report.settingsPath).toBe(join(configDir, "settings.json"));
  });
});
