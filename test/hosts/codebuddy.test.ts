import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorCodeBuddyHook,
  doctorInstalledHooks,
  installClaudeCodeHook,
  installCodeBuddyHook,
  installCodexHook,
  installCursorHook,
  installPiExtension,
  runCodeBuddyPreToolUseHook,
} from "../../src/index.js";
import { parseWrappedCommand } from "./shared/wrap-command.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;
const originalShell = process.env.SHELL;
const originalCodeBuddyShell = process.env.TOKENJUICE_CODEBUDDY_SHELL;
const originalFactoryHome = process.env.FACTORY_HOME;
const originalPlatform = process.platform;

afterEach(async () => {
  process.env.PATH = originalPath;
  if (originalShell === undefined) {
    delete process.env.SHELL;
  } else {
    process.env.SHELL = originalShell;
  }
  if (originalCodeBuddyShell === undefined) {
    delete process.env.TOKENJUICE_CODEBUDDY_SHELL;
  } else {
    process.env.TOKENJUICE_CODEBUDDY_SHELL = originalCodeBuddyShell;
  }
  delete process.env.CODEBUDDY_CONFIG_DIR;
  delete process.env.CODEBUDDY_HOME;
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CLAUDE_HOME;
  delete process.env.CODEX_HOME;
  delete process.env.CURSOR_HOME;
  if (originalFactoryHome === undefined) {
    delete process.env.FACTORY_HOME;
  } else {
    process.env.FACTORY_HOME = originalFactoryHome;
  }
  delete process.env.PI_CODING_AGENT_DIR;
  Object.defineProperty(process, "platform", { value: originalPlatform });
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-codebuddy-test-"));
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

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value });
}

describe("installCodeBuddyHook", () => {
  it("installs a single tokenjuice PreToolUse Bash hook on an empty settings file", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    const result = await installCodeBuddyHook(settingsPath);
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type?: string; command: string; statusMessage?: string }> }>>;
    };

    expect(result.settingsPath).toBe(settingsPath);
    expect(result.backupPath).toBeUndefined();
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse[0]?.matcher).toBe("Bash");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.type).toBe("command");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.command).toContain("codebuddy-pre-tool-use");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.command).toContain("--wrap-launcher");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.statusMessage).toBe("wrapping bash through tokenjuice for compaction");
  });

  it("preserves unrelated top-level settings keys across install", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    await writeFile(
      settingsPath,
      `${JSON.stringify({
        permissions: {
          allow: ["Bash(git status)"],
          deny: ["Read(./.env)"],
        },
        env: { NODE_ENV: "development" },
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: "echo session" }] },
          ],
          PreToolUse: [
            { matcher: "Write", hooks: [{ type: "command", command: "echo keep-write" }] },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const result = await installCodeBuddyHook(settingsPath);
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      permissions?: unknown;
      env?: unknown;
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
    };

    expect(result.settingsPath).toBe(settingsPath);
    expect(result.backupPath).toBe(`${settingsPath}.bak`);
    expect(parsed.permissions).toEqual({
      allow: ["Bash(git status)"],
      deny: ["Read(./.env)"],
    });
    expect(parsed.env).toEqual({ NODE_ENV: "development" });
    expect(parsed.hooks.SessionStart).toHaveLength(1);
    expect(parsed.hooks.PreToolUse).toHaveLength(2);
    expect(parsed.hooks.PreToolUse[0]?.matcher).toBe("Write");
    expect(parsed.hooks.PreToolUse[1]?.matcher).toBe("Bash");
  });

  it("prefers a stable tokenjuice launcher from PATH when installing the hook", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const result = await installCodeBuddyHook(settingsPath);
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };

    expect(result.command).toContain(`${launcherPath} codebuddy-pre-tool-use`);
    expect(result.command).toContain(`--wrap-launcher ${launcherPath}`);
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.command).toBe(result.command);
  });

  it("picks the first tokenjuice on PATH when multiple directories have one", async () => {
    // Pins first-match-wins semantics of the PATH walk. A refactor that
    // reordered the walk (e.g. reversing delimiter.split) would change
    // which launcher ends up baked into the settings file.
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const firstDir = join(home, "a-bin");
    const secondDir = join(home, "b-bin");
    const firstLauncher = join(firstDir, "tokenjuice");
    const secondLauncher = join(secondDir, "tokenjuice");

    await mkdir(firstDir, { recursive: true });
    await mkdir(secondDir, { recursive: true });
    await writeFile(firstLauncher, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(secondLauncher, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    process.env.PATH = `${firstDir}:${secondDir}`;

    const result = await installCodeBuddyHook(settingsPath);

    expect(result.command).toContain(firstLauncher);
    expect(result.command).not.toContain(secondLauncher);
  });

  it("tolerates empty segments in PATH", async () => {
    // Pins that empty PATH segments (leading/trailing ':' or '::') are
    // skipped rather than resolved to something like the cwd's tokenjuice
    // or throwing on a join with "".
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    process.env.PATH = `:${binDir}::`;

    const result = await installCodeBuddyHook(settingsPath);

    expect(result.command).toContain(launcherPath);
  });

  it("can force local repo routing instead of the PATH launcher", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const localCliPath = join(home, "dist", "cli", "main.js");
    const localNodePath = join(home, "node");
    const resolvedCliPath = resolve(localCliPath);

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await mkdir(join(home, "dist", "cli"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(localCliPath, "console.log('tokenjuice');\n", "utf8");
    await writeFile(localNodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const result = await installCodeBuddyHook(settingsPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };

    const expectedCommand = `${localNodePath} ${resolvedCliPath} codebuddy-pre-tool-use --wrap-launcher ${resolvedCliPath}`;
    expect(result.command).toBe(expectedCommand);
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.command).toBe(expectedCommand);
  });

  it("is idempotent and replaces old tokenjuice PreToolUse entries", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    await writeFile(
      settingsPath,
      `${JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: "tokenjuice codebuddy-pre-tool-use --old",
                  statusMessage: "wrapping bash through tokenjuice for compaction",
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

    await installCodeBuddyHook(settingsPath);
    await installCodeBuddyHook(settingsPath);

    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; statusMessage?: string }> }>>;
    };

    const tokenjuiceHooks = parsed.hooks.PreToolUse.filter((group) =>
      group.hooks.some((hook) => hook.statusMessage === "wrapping bash through tokenjuice for compaction" || hook.command.includes("codebuddy-pre-tool-use")),
    );

    expect(parsed.hooks.PreToolUse).toHaveLength(2);
    expect(tokenjuiceHooks).toHaveLength(1);
    expect(tokenjuiceHooks[0]?.hooks[0]?.command).toContain("codebuddy-pre-tool-use");
  });

  it("preserves unrelated hooks that live in the same matcher group as the tokenjuice hook", async () => {
    // Regression for review finding P2: reinstalling must not delete
    // user-authored hooks just because they share a matcher group with the
    // tokenjuice entry.
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    await writeFile(
      settingsPath,
      `${JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                { type: "command", command: "echo pre-bash-audit", statusMessage: "audit hook" },
                {
                  type: "command",
                  command: "tokenjuice codebuddy-pre-tool-use --wrap-launcher tokenjuice",
                  statusMessage: "wrapping bash through tokenjuice for compaction",
                },
                { type: "agent", prompt: "summarize this bash call" },
              ],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    await installCodeBuddyHook(settingsPath);

    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>>;
    };

    // Two groups now: the original Bash group (tokenjuice entry removed,
    // siblings preserved) and the fresh tokenjuice-only Bash group appended
    // by install.
    expect(parsed.hooks.PreToolUse).toHaveLength(2);

    const preservedGroup = parsed.hooks.PreToolUse[0];
    expect(preservedGroup?.matcher).toBe("Bash");
    expect(preservedGroup?.hooks).toHaveLength(2);
    expect(preservedGroup?.hooks[0]).toEqual({
      type: "command",
      command: "echo pre-bash-audit",
      statusMessage: "audit hook",
    });
    expect(preservedGroup?.hooks[1]).toEqual({
      type: "agent",
      prompt: "summarize this bash call",
    });

    const tokenjuiceGroup = parsed.hooks.PreToolUse[1];
    expect(tokenjuiceGroup?.matcher).toBe("Bash");
    expect(tokenjuiceGroup?.hooks).toHaveLength(1);
    expect(tokenjuiceGroup?.hooks[0]?.command).toContain("codebuddy-pre-tool-use");
  });

  it("migrates a legacy PostToolUse install to the new PreToolUse install", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    // Simulate a settings file left by an earlier (PostToolUse) version of
    // the codebuddy host alongside an unrelated PostToolUse hook the user
    // cares about.
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
                  command: "tokenjuice codebuddy-post-tool-use",
                  statusMessage: "compacting bash output with tokenjuice",
                },
              ],
            },
            {
              matcher: "Edit",
              hooks: [{ type: "command", command: "echo unrelated" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    await installCodeBuddyHook(settingsPath);

    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
    };

    // Legacy tokenjuice PostToolUse entry was removed; unrelated Edit hook
    // preserved.
    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse?.[0]?.matcher).toBe("Edit");
    expect(parsed.hooks.PostToolUse?.[0]?.hooks[0]?.command).toBe("echo unrelated");

    // New tokenjuice PreToolUse entry written.
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse?.[0]?.matcher).toBe("Bash");
    expect(parsed.hooks.PreToolUse?.[0]?.hooks[0]?.command).toContain("codebuddy-pre-tool-use");
  });

  it("preserves sibling hooks when migrating a legacy PostToolUse group", async () => {
    // Regression for review finding P2 on the legacy-migration path: if the
    // old PostToolUse Bash group also had user-authored siblings, they must
    // survive the migration.
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
                { type: "command", command: "echo keep-me" },
                {
                  type: "command",
                  command: "tokenjuice codebuddy-post-tool-use",
                  statusMessage: "compacting bash output with tokenjuice",
                },
              ],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    await installCodeBuddyHook(settingsPath);

    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
    };

    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse?.[0]?.matcher).toBe("Bash");
    expect(parsed.hooks.PostToolUse?.[0]?.hooks).toHaveLength(1);
    expect(parsed.hooks.PostToolUse?.[0]?.hooks[0]?.command).toBe("echo keep-me");
    expect(parsed.hooks.PreToolUse?.[0]?.hooks[0]?.command).toContain("codebuddy-pre-tool-use");
  });

  it("rejects native Windows installs instead of writing a broken hook", async () => {
    setPlatform("win32");
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    await expect(installCodeBuddyHook(settingsPath)).rejects.toThrow(
      "tokenjuice codebuddy integration does not support native Windows shells",
    );
  });
});

describe("doctorCodeBuddyHook", () => {
  it("reports a healthy installed launcher hook", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installCodeBuddyHook(settingsPath);

    const report = await doctorCodeBuddyHook(settingsPath);

    expect(report.status).toBe("ok");
    expect(report.detectedCommand).toContain(`${launcherPath} codebuddy-pre-tool-use`);
    expect(report.issues).toEqual([]);
  });

  it("reports disabled when no tokenjuice hook is present", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    await writeFile(
      settingsPath,
      `${JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "Write", hooks: [{ type: "command", command: "echo keep-write" }] },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCodeBuddyHook(settingsPath);

    expect(report.status).toBe("disabled");
    expect(report.detectedCommand).toBeUndefined();
  });

  it("reports disabled when settings file is missing", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    const report = await doctorCodeBuddyHook(settingsPath);

    expect(report.status).toBe("disabled");
    expect(report.detectedCommand).toBeUndefined();
  });

  it("flags stale Homebrew Cellar hook commands as broken", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const staleCommand = `${process.execPath} /opt/homebrew/Cellar/tokenjuice/0.2.0/libexec/dist/cli/main.js codebuddy-pre-tool-use --wrap-launcher /opt/homebrew/Cellar/tokenjuice/0.2.0/libexec/dist/cli/main.js`;

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
              hooks: [{ type: "command", command: staleCommand, statusMessage: "wrapping bash through tokenjuice for compaction" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCodeBuddyHook(settingsPath);

    expect(report.status).toBe("broken");
    expect(report.detectedCommand).toBe(staleCommand);
    expect(report.issues).toContain("configured CodeBuddy hook is pinned to a versioned Homebrew Cellar path");
    expect(report.missingPaths).toContain("/opt/homebrew/Cellar/tokenjuice/0.2.0/libexec/dist/cli/main.js");
    expect(report.fixCommand).toBe("tokenjuice install codebuddy");
  });

  it("flags a configured native Windows hook as broken", async () => {
    setPlatform("win32");
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");

    await writeFile(
      settingsPath,
      `${JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "tokenjuice codebuddy-pre-tool-use", statusMessage: "wrapping bash through tokenjuice for compaction" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCodeBuddyHook(settingsPath);

    expect(report.status).toBe("broken");
    expect(report.issues).toContain("configured CodeBuddy hook cannot run on native Windows; use CodeBuddy in WSL instead.");
    expect(report.detectedCommand).toContain("codebuddy-pre-tool-use");
    expect(report.fixCommand).toBe("run CodeBuddy in WSL, then run tokenjuice install codebuddy");
  });
});

describe("doctorInstalledHooks includes codebuddy", () => {
  it("reports codebuddy alongside codex and claude-code when all installed", async () => {
    const home = await createTempDir();
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const claudeHome = join(home, "claude");
    const codebuddyHome = join(home, "codebuddy");

    process.env.PATH = binDir;
    process.env.CODEX_HOME = home;
    process.env.CLAUDE_HOME = claudeHome;
    process.env.CODEBUDDY_HOME = codebuddyHome;
    process.env.CURSOR_HOME = home;
    process.env.FACTORY_HOME = join(home, "factory");
    process.env.PI_CODING_AGENT_DIR = join(home, "pi-agent");
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(join(home, "config.toml"), "[features]\ncodex_hooks = true\n", "utf8");
    await installCodexHook(join(home, "hooks.json"));
    await installClaudeCodeHook();
    await installCodeBuddyHook();
    await installCursorHook(join(home, "cursor-hooks.json"));
    await installPiExtension(undefined, { local: true });

    const report = await doctorInstalledHooks();

    expect(report.integrations.codebuddy.status).toBe("ok");
    expect(report.integrations["claude-code"].status).toBe("ok");
    expect(report.integrations.codex.status).toBe("ok");
  });
});

describe("runCodeBuddyPreToolUseHook", () => {
  it("wraps Bash commands with tokenjuice wrap using the provided host shell", async () => {
    const home = await createTempDir();
    const hostShellPath = join(home, "host-shell");
    await writeFile(hostShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "git status --short",
        shell: hostShellPath,
        description: "Check working tree",
      },
    });

    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as {
      hookSpecificOutput: {
        hookEventName: string;
        permissionDecision: string;
        modifiedInput: { command: string; description?: string };
      };
    };

    expect(code).toBe(0);
    expect(response.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(response.hookSpecificOutput.permissionDecision).toBe("allow");

    // Behavioral contract (not byte-for-byte quoting):
    //   (1) wrapped exactly once through tokenjuice wrap,
    //   (2) against the shell the caller asked for,
    //   (3) with the original command preserved for the shell to execute.
    const parsed = parseWrappedCommand(response.hookSpecificOutput.modifiedInput.command);
    expect(parsed.launcher).toEqual(["/usr/local/bin/tokenjuice"]);
    expect(parsed.subcommand).toBe("wrap");
    expect(parsed.wrapArgs).toEqual(["--source", "codebuddy"]);
    expect(parsed.shellPath).toBe(hostShellPath);
    expect(parsed.inner).toBe("git status --short");
    expect(parsed.wrapDepth).toBe(1);
    // Untouched fields from the original tool_input pass through unchanged.
    expect(response.hookSpecificOutput.modifiedInput.description).toBe("Check working tree");
  });

  it("skips commands that are already wrapped", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "tokenjuice wrap -- bash -lc 'git status --short'",
      },
    });

    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it("skips node-based local wrap commands to preserve raw bypass", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "node dist/cli/main.js wrap --raw -- git status",
      },
    });

    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it.each([
    ["/usr/local/bin/tokenjuice wrap -- bash -lc 'git status'", "absolute POSIX path"],
    ["/root/.local/share/pnpm/tokenjuice wrap --raw -- git log", "pnpm-linked absolute path"],
  ])(
    "skips already-wrapped commands invoked via %s (%s)",
    async (command) => {
      // Regression for review finding P3: absolute tokenjuice launchers must
      // also be recognised as already wrapped, otherwise the hook will nest
      // wrap invocations.
      const payload = JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command },
      });

      const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));

      expect(code).toBe(0);
      expect(output).toBe("");
    },
  );

  it("uses node to execute a js wrap launcher path", async () => {
    const home = await createTempDir();
    const hostShellPath = join(home, "host-shell");
    await writeFile(hostShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "git status --short",
        shell: hostShellPath,
      },
    });

    const { code, output } = await captureStdout(() =>
      runCodeBuddyPreToolUseHook(payload, "/repo/dist/cli/main.js"),
    );
    const response = JSON.parse(output) as {
      hookSpecificOutput: { modifiedInput: { command: string } };
    };

    expect(code).toBe(0);
    const parsed = parseWrappedCommand(response.hookSpecificOutput.modifiedInput.command);
    expect(parsed.launcher[0]).toBe(process.execPath);
    expect(parsed.launcher[1]).toBe("/repo/dist/cli/main.js");
    expect(parsed.wrapArgs).toEqual(["--source", "codebuddy"]);
    expect(parsed.shellPath).toBe(hostShellPath);
    expect(parsed.inner).toBe("git status --short");
    expect(parsed.wrapDepth).toBe(1);
  });

  it("falls back to SHELL when tool_input.shell is absent", async () => {
    const home = await createTempDir();
    const shellDir = join(home, "bin");
    const hostShellPath = join(shellDir, "zsh");
    process.env.PATH = shellDir;
    process.env.SHELL = "zsh";
    await mkdir(shellDir, { recursive: true });
    await writeFile(hostShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git status --short" },
    });
    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as {
      hookSpecificOutput: { modifiedInput: { command: string } };
    };

    expect(code).toBe(0);
    const parsed = parseWrappedCommand(response.hookSpecificOutput.modifiedInput.command);
    expect(parsed.shellPath).toBe(hostShellPath);
    expect(parsed.inner).toBe("git status --short");
    expect(parsed.wrapDepth).toBe(1);
  });

  it("prefers TOKENJUICE_CODEBUDDY_SHELL over SHELL when both resolve", async () => {
    // Pins precedence of the candidate chain:
    //   tool_input.shell > TOKENJUICE_CODEBUDDY_SHELL > SHELL > bash > sh
    const home = await createTempDir();
    const shellDir = join(home, "bin");
    const tjShellPath = join(shellDir, "fish");
    const defaultShellPath = join(shellDir, "zsh");
    process.env.PATH = shellDir;
    process.env.SHELL = "zsh";
    process.env.TOKENJUICE_CODEBUDDY_SHELL = "fish";
    await mkdir(shellDir, { recursive: true });
    await writeFile(tjShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(defaultShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git status --short" },
    });
    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as { hookSpecificOutput: { modifiedInput: { command: string } } };

    expect(code).toBe(0);
    const parsed = parseWrappedCommand(response.hookSpecificOutput.modifiedInput.command);
    expect(parsed.shellPath).toBe(tjShellPath);
    expect(parsed.inner).toBe("git status --short");
    expect(parsed.wrapDepth).toBe(1);
  });

  it("prefers tool_input.shell over TOKENJUICE_CODEBUDDY_SHELL and SHELL", async () => {
    const home = await createTempDir();
    const shellDir = join(home, "bin");
    const payloadShellPath = join(home, "payload-shell");
    const tjShellPath = join(shellDir, "fish");
    const defaultShellPath = join(shellDir, "zsh");
    process.env.PATH = shellDir;
    process.env.SHELL = "zsh";
    process.env.TOKENJUICE_CODEBUDDY_SHELL = "fish";
    await mkdir(shellDir, { recursive: true });
    await writeFile(payloadShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(tjShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(defaultShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git status --short", shell: payloadShellPath },
    });
    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as { hookSpecificOutput: { modifiedInput: { command: string } } };

    expect(code).toBe(0);
    const parsed = parseWrappedCommand(response.hookSpecificOutput.modifiedInput.command);
    expect(parsed.shellPath).toBe(payloadShellPath);
    expect(parsed.inner).toBe("git status --short");
    expect(parsed.wrapDepth).toBe(1);
  });

  it("falls back to bash before sh when no configured shell resolves", async () => {
    // Codebuddy-specific: the candidate chain ends `... > bash > sh`, so
    // if bash is on PATH it must win over sh. A refactor that dropped this
    // extra fallback rung (e.g. flattening with cursor's `... > sh` chain)
    // would change which interpreter runs the wrapped command.
    const home = await createTempDir();
    const shellDir = join(home, "bin");
    const bashPath = join(shellDir, "bash");
    const shPath = join(shellDir, "sh");
    process.env.PATH = shellDir;
    process.env.SHELL = "/definitely/missing";
    process.env.TOKENJUICE_CODEBUDDY_SHELL = "/also/missing";
    await mkdir(shellDir, { recursive: true });
    await writeFile(bashPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(shPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git status --short" },
    });
    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as { hookSpecificOutput: { modifiedInput: { command: string } } };

    expect(code).toBe(0);
    const parsed = parseWrappedCommand(response.hookSpecificOutput.modifiedInput.command);
    expect(parsed.shellPath).toBe(bashPath);
    expect(parsed.inner).toBe("git status --short");
    expect(parsed.wrapDepth).toBe(1);
  });

  it("falls back to sh only when bash is also missing", async () => {
    const home = await createTempDir();
    const shellDir = join(home, "bin");
    const shPath = join(shellDir, "sh");
    process.env.PATH = shellDir;
    process.env.SHELL = "/definitely/missing";
    process.env.TOKENJUICE_CODEBUDDY_SHELL = "/also/missing";
    await mkdir(shellDir, { recursive: true });
    await writeFile(shPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    // Note: no bash in shellDir — only sh.

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git status --short" },
    });
    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as { hookSpecificOutput: { modifiedInput: { command: string } } };

    expect(code).toBe(0);
    const parsed = parseWrappedCommand(response.hookSpecificOutput.modifiedInput.command);
    expect(parsed.shellPath).toBe(shPath);
    expect(parsed.inner).toBe("git status --short");
    expect(parsed.wrapDepth).toBe(1);
  });

  it("leaves command unchanged when no host shell can be resolved", async () => {
    process.env.PATH = "";
    process.env.SHELL = "/definitely/missing-shell";
    process.env.TOKENJUICE_CODEBUDDY_SHELL = "/definitely/missing-shell";

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git status --short" },
    });
    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it("denies native Windows shell interception with a WSL message", async () => {
    setPlatform("win32");
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git status --short" },
    });

    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as {
      hookSpecificOutput: {
        permissionDecision: string;
        permissionDecisionReason: string;
      };
    };

    expect(code).toBe(0);
    expect(response.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(response.hookSpecificOutput.permissionDecisionReason).toBe(
      "tokenjuice codebuddy integration does not support native Windows shells yet. run CodeBuddy in WSL instead.",
    );
  });

  it("preserves the original command semantics when it contains an apostrophe", async () => {
    // The wrap host must round-trip the command through whatever POSIX
    // quoting scheme it prefers — single quotes today, possibly something
    // else in a future refactor. Test against the observable contract:
    // whatever the shell would execute for `inner` equals the original.
    const home = await createTempDir();
    const hostShellPath = join(home, "host-shell");
    await writeFile(hostShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "echo it's raining",
        shell: hostShellPath,
      },
    });

    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as { hookSpecificOutput: { modifiedInput: { command: string } } };

    expect(code).toBe(0);
    const parsed = parseWrappedCommand(response.hookSpecificOutput.modifiedInput.command);
    expect(parsed.shellPath).toBe(hostShellPath);
    expect(parsed.inner).toBe("echo it's raining");
    expect(parsed.wrapDepth).toBe(1);
  });

  it("skips non-PreToolUse events", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "git status" },
    });

    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it("skips non-Bash tools", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/tmp/x" },
    });

    const { code, output } = await captureStdout(() => runCodeBuddyPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));

    expect(code).toBe(0);
    expect(output).toBe("");
  });
});

describe("codebuddy config directory discovery", () => {
  it("prefers CODEBUDDY_CONFIG_DIR over CODEBUDDY_HOME when both are set", async () => {
    const configDir = await createTempDir();
    const legacyHome = await createTempDir();
    process.env.CODEBUDDY_CONFIG_DIR = configDir;
    process.env.CODEBUDDY_HOME = legacyHome;

    const result = await installCodeBuddyHook();

    expect(result.settingsPath).toBe(join(configDir, "settings.json"));
  });

  it("uses CODEBUDDY_CONFIG_DIR when CODEBUDDY_HOME is unset", async () => {
    const configDir = await createTempDir();
    process.env.CODEBUDDY_CONFIG_DIR = configDir;

    const result = await installCodeBuddyHook();

    expect(result.settingsPath).toBe(join(configDir, "settings.json"));
  });

  it("falls back to CODEBUDDY_HOME when CODEBUDDY_CONFIG_DIR is unset", async () => {
    const legacyHome = await createTempDir();
    process.env.CODEBUDDY_HOME = legacyHome;

    const result = await installCodeBuddyHook();

    expect(result.settingsPath).toBe(join(legacyHome, "settings.json"));
  });

  it("doctor reads settings.json from CODEBUDDY_CONFIG_DIR when no path is provided", async () => {
    const configDir = await createTempDir();
    process.env.CODEBUDDY_CONFIG_DIR = configDir;
    await installCodeBuddyHook();

    const report = await doctorCodeBuddyHook();

    expect(report.settingsPath).toBe(join(configDir, "settings.json"));
  });
});
