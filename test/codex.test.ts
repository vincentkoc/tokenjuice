import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorCodexHook, installCodexHook, runCodexPostToolUseHook } from "../src/index.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;

afterEach(async () => {
  delete process.env.CODEX_HOME;
  process.env.PATH = originalPath;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-codex-test-"));
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

describe("installCodexHook", () => {
  it("installs a single tokenjuice PostToolUse hook and preserves unrelated hooks", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    process.env.PATH = "";
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [{ type: "command", command: "echo session" }],
            },
          ],
          PostToolUse: [
            {
              matcher: "^Bash$",
              hooks: [{ type: "command", command: "python3 /tmp/post_tool_use_tokenjuice.py" }],
            },
            {
              matcher: "^Bash$",
              hooks: [{ type: "command", command: "echo keep-me", statusMessage: "keep me" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const result = await installCodexHook(hooksPath);
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; statusMessage?: string }> }>>;
    };

    expect(result.hooksPath).toBe(hooksPath);
    expect(result.backupPath).toBe(`${hooksPath}.bak`);
    expect(parsed.hooks.SessionStart).toHaveLength(1);
    expect(parsed.hooks.PostToolUse).toHaveLength(2);
    expect(parsed.hooks.PostToolUse[0]?.hooks[0]?.command).toBe("echo keep-me");
    expect(parsed.hooks.PostToolUse[1]?.matcher).toBe("^Bash$");
    expect(parsed.hooks.PostToolUse[1]?.hooks[0]?.command).toContain("codex-post-tool-use");
    expect(parsed.hooks.PostToolUse[1]?.hooks[0]?.statusMessage).toBe("compacting bash output with tokenjuice");
  });

  it("prefers a stable tokenjuice launcher from PATH when installing the hook", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(
      launcherPath,
      "#!/usr/bin/env bash\nexit 0\n",
      { encoding: "utf8", mode: 0o755 },
    );

    const result = await installCodexHook(hooksPath);
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };

    expect(result.command).toBe(`${launcherPath} codex-post-tool-use`);
    expect(parsed.hooks.PostToolUse?.[0]?.hooks[0]?.command).toBe(`${launcherPath} codex-post-tool-use`);
  });

  it("can install a local codex hook without preferring PATH", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const localNodePath = join(home, "node");
    const localCliPath = join(home, "dist", "cli", "main.js");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await mkdir(join(home, "dist", "cli"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(localNodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(localCliPath, "console.log('tokenjuice');\n", "utf8");

    const result = await installCodexHook(hooksPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };

    expect(result.command).toBe(`${localNodePath} ${localCliPath} codex-post-tool-use`);
    expect(parsed.hooks.PostToolUse?.[0]?.hooks[0]?.command).toBe(`${localNodePath} ${localCliPath} codex-post-tool-use`);
  });
});

describe("doctorCodexHook", () => {
  it("reports a healthy installed launcher hook", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installCodexHook(hooksPath);

    const report = await doctorCodexHook(hooksPath);

    expect(report.status).toBe("ok");
    expect(report.detectedCommand).toBe(`${launcherPath} codex-post-tool-use`);
    expect(report.issues).toEqual([]);
  });

  it("flags stale Homebrew Cellar hook commands as broken", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const staleCommand = `${process.execPath} /opt/homebrew/Cellar/tokenjuice/0.2.0/libexec/dist/cli/main.js codex-post-tool-use`;

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "^Bash$",
              hooks: [{ type: "command", command: staleCommand, statusMessage: "compacting bash output with tokenjuice" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCodexHook(hooksPath);

    expect(report.status).toBe("broken");
    expect(report.detectedCommand).toBe(staleCommand);
    expect(report.issues).toContain("configured Codex hook is pinned to a versioned Homebrew Cellar path");
    expect(report.missingPaths).toContain("/opt/homebrew/Cellar/tokenjuice/0.2.0/libexec/dist/cli/main.js");
    expect(report.fixCommand).toBe("tokenjuice install codex");
  });

  it("reports a healthy local codex hook when asked to check local mode", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const localNodePath = join(home, "node");
    const localCliPath = join(home, "dist", "cli", "main.js");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await mkdir(join(home, "dist", "cli"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(localNodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(localCliPath, "console.log('tokenjuice');\n", "utf8");

    await installCodexHook(hooksPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });

    const report = await doctorCodexHook(hooksPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });

    expect(report.status).toBe("ok");
    expect(report.detectedCommand).toBe(`${localNodePath} ${localCliPath} codex-post-tool-use`);
    expect(report.fixCommand).toBe("tokenjuice install codex --local");
    expect(report.issues).toEqual([]);
  });

  it("flags stale local codex builds when source is newer than dist", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    const localNodePath = join(home, "node");
    const localCliPath = join(home, "dist", "cli", "main.js");
    const sourcePath = join(home, "src", "core", "codex.ts");
    const oldTime = new Date("2026-04-15T00:00:00.000Z");
    const newTime = new Date("2026-04-16T00:00:00.000Z");

    await mkdir(join(home, "dist", "cli"), { recursive: true });
    await mkdir(join(home, "src", "core"), { recursive: true });
    await writeFile(localNodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(localCliPath, "console.log('tokenjuice');\n", "utf8");
    await writeFile(sourcePath, "export const changed = true;\n", "utf8");
    await utimes(localCliPath, oldTime, oldTime);
    await utimes(sourcePath, newTime, newTime);

    await installCodexHook(hooksPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });

    const report = await doctorCodexHook(hooksPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });

    expect(report.status).toBe("warn");
    expect(report.issues).toContain("local Codex hook target is older than the source tree");
    expect(report.fixCommand).toBe("pnpm build && tokenjuice install codex --local");
  });
});

describe("runCodexPostToolUseHook", () => {
  it("rewrites bash post-tool output when tokenjuice compacts it", async () => {
    const home = await createTempDir();
    process.env.CODEX_HOME = home;

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

    const { code, output } = await captureStdout(() => runCodexPostToolUseHook(payload));
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

  it("skips rewriting generic fallback output for compound shell diagnostics", async () => {
    const home = await createTempDir();
    process.env.CODEX_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "printf 'cwd: '; pwd; printf 'repo: '; git rev-parse --show-toplevel; git status --short --branch",
      },
      tool_response: Array.from({ length: 18 }, (_, index) => {
        if (index === 0) {
          return "cwd: /Users/vincentkoc/GIT/_Perso/openclaw";
        }
        if (index === 1) {
          return "repo: /Users/vincentkoc/GIT/_Perso/openclaw";
        }
        return `worktree /Users/vincentkoc/GIT/_Perso/openclaw/.worktrees/pr-${66200 + index}`;
      }).join("\n"),
    });

    const { code, output } = await captureStdout(() => runCodexPostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
      matchedReducer?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("generic-compound-command");
    expect(debug.matchedReducer).toBe("generic/fallback");
  });

  it("skips rewriting weak generic fallback compaction", async () => {
    const home = await createTempDir();
    process.env.CODEX_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "node -e \"console.log('x')\"",
      },
      tool_response: Array.from({ length: 18 }, (_, index) => `line ${index + 1} ${"x".repeat(24)}`).join("\n"),
    });

    const { code, output } = await captureStdout(() => runCodexPostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
      matchedReducer?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("generic-weak-compaction");
    expect(debug.matchedReducer).toBe("generic/fallback");
  });

  it("skips auto-rewriting repository inspection commands", async () => {
    const home = await createTempDir();
    process.env.CODEX_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "find src/rules -maxdepth 2 -type f | head -n 40",
      },
      tool_response: Array.from({ length: 40 }, (_, index) => `src/rules/example-${index + 1}.json`).join("\n"),
    });

    const { code, output } = await captureStdout(() => runCodexPostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
      matchedReducer?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("inspection-command");
    expect(debug.matchedReducer).toBe("filesystem/find");
  });

  it("honors tokenjuice raw bypass commands without re-compacting them", async () => {
    const home = await createTempDir();
    process.env.CODEX_HOME = home;

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
        " src/core/codex.ts | 12 +++++++-----",
      ].join("\n"),
    });

    const { code, output } = await captureStdout(() => runCodexPostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("explicit-raw-bypass");
  });
});
