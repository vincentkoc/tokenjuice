import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorCodexHook, installCodexHook, listArtifactMetadata, runCodexPostToolUseHook, uninstallCodexHook } from "../src/index.js";

const tempDirs: string[] = [];
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version as string;
const originalHome = process.env.HOME;
const originalPath = process.env.PATH;

afterEach(async () => {
  delete process.env.CODEX_HOME;
  process.env.HOME = originalHome;
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

  it("can uninstall the tokenjuice Codex hook without touching unrelated hooks", async () => {
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
              hooks: [{ type: "command", command: "echo keep-me", statusMessage: "keep me" }],
            },
            {
              matcher: "^Bash$",
              hooks: [{ type: "command", command: "python3 /tmp/post_tool_use_tokenjuice.py", statusMessage: "compacting bash output with tokenjuice" }],
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const result = await uninstallCodexHook(hooksPath);
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; statusMessage?: string }> }>>;
    };

    expect(result.hooksPath).toBe(hooksPath);
    expect(result.backupPath).toBe(`${hooksPath}.bak`);
    expect(result.removed).toBe(1);
    expect(parsed.hooks.SessionStart).toHaveLength(1);
    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse?.[0]?.hooks[0]?.command).toBe("echo keep-me");
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
    const featureFlagConfigPath = join(home, "config.toml");
    await writeFile(featureFlagConfigPath, "[features]\ncodex_hooks = true\n", "utf8");
    await installCodexHook(hooksPath, { featureFlagConfigPath });

    const report = await doctorCodexHook(hooksPath, { featureFlagConfigPath });

    expect(report.status).toBe("ok");
    expect(report.detectedCommand).toBe(`${launcherPath} codex-post-tool-use`);
    expect(report.issues).toEqual([]);
    expect(report.featureFlag.enabled).toBe(true);
  });

  it("warns when codex_hooks feature flag is not enabled", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const featureFlagConfigPath = join(home, "config.toml");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installCodexHook(hooksPath, { featureFlagConfigPath });

    // featureFlagConfigPath doesn't exist → flag not enabled
    const report = await doctorCodexHook(hooksPath, { featureFlagConfigPath });

    expect(report.status).toBe("warn");
    expect(report.featureFlag.enabled).toBe(false);
    expect(report.issues).toContain(
      "Codex feature flag `codex_hooks` is not enabled — the configured hook will not fire",
    );
  });

  it("reports disabled when the tokenjuice Codex hook is not installed", async () => {
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
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCodexHook(hooksPath);

    expect(report.status).toBe("disabled");
    expect(report.detectedCommand).toBeUndefined();
    expect(report.issues).toEqual([]);
    expect(report.fixCommand).toBe("tokenjuice install codex");
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

    const featureFlagConfigPath = join(home, "config.toml");
    await writeFile(featureFlagConfigPath, "[features]\ncodex_hooks = true\n", "utf8");
    await installCodexHook(hooksPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
      featureFlagConfigPath,
    });

    const report = await doctorCodexHook(hooksPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
      featureFlagConfigPath,
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

  it("skips rewriting low-savings compaction even for non-generic reducers", async () => {
    const home = await createTempDir();
    process.env.CODEX_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "git status --short",
      },
      tool_response: " M src/core/codex.ts\n",
    });

    const { code, output } = await captureStdout(() => runCodexPostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
      matchedReducer?: string;
      rawChars?: number;
      reducedChars?: number;
      savedChars?: number;
      ratio?: number;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("low-savings-compaction");
    expect(debug.matchedReducer).toBe("git/status");
    expect(debug.rawChars).toBe(21);
    expect(debug.reducedChars).toBe(20);
    expect(debug.savedChars).toBe(1);
    expect(debug.ratio).toBeCloseTo(20 / 21, 5);
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
    expect(debug.matchedReducer).toBeUndefined();
    expect(debug.rawChars).toBeGreaterThan(0);
    expect(debug.reducedChars).toBe(debug.rawChars);
    expect(debug.savedChars).toBe(0);
    expect(debug.ratio).toBe(1);
  });

  it.each([
    {
      label: "cat",
      command: "cat src/core/reduce.ts",
      output: [
        "import { loadRules } from \"./rules.js\";",
        "throw new AssertionError();",
        "export function reduceExecution() {}",
      ].join("\n"),
    },
    {
      label: "sed",
      command: "sed -n '560,620p' src/core/codex.ts",
      output: [
        "function shouldStoreFromEnv(): boolean {",
        "  return value === \"yes\";",
        "}",
      ].join("\n"),
    },
    {
      label: "rg --files",
      command: "rg --files src/rules",
      output: Array.from({ length: 30 }, (_, index) => `src/rules/example-${index + 1}.json`).join("\n"),
    },
    {
      label: "git ls-files",
      command: "git ls-files src",
      output: Array.from({ length: 20 }, (_, index) => `src/file-${index + 1}.ts`).join("\n"),
    },
  ])("skips auto-rewrite for $label inspection commands", async ({ command, output: toolResponse }) => {
    const home = await createTempDir();
    process.env.CODEX_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command,
      },
      tool_response: toolResponse,
    });

    const { code, output } = await captureStdout(() => runCodexPostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
      matchedReducer?: string;
      rawChars?: number;
      reducedChars?: number;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("inspection-command");
    expect(debug.matchedReducer).toBeUndefined();
    expect(debug.rawChars).toBeGreaterThan(0);
    expect(debug.reducedChars).toBe(debug.rawChars);
    expect(debug.savedChars).toBe(0);
    expect(debug.ratio).toBe(1);
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
      matchedReducer?: string;
      rawChars?: number;
      reducedChars?: number;
      savedChars?: number;
      ratio?: number;
    };

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("explicit-raw-bypass");
    expect(debug.matchedReducer).toBeUndefined();
    expect(debug.rawChars).toBeGreaterThan(0);
    expect(debug.reducedChars).toBe(debug.rawChars);
    expect(debug.savedChars).toBe(0);
    expect(debug.ratio).toBe(1);
  });

  it("records metadata-only stats for immediate skip paths", async () => {
    const home = await createTempDir();
    process.env.CODEX_HOME = home;
    process.env.HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "tokenjuice wrap --raw -- printf 'ok\\n'",
      },
      tool_response: "ok\n",
    });

    const { code, output } = await captureStdout(() => runCodexPostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
    };
    const metadata = await listArtifactMetadata();

    expect(code).toBe(0);
    expect(output).toBe("");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("explicit-raw-bypass");
    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.metadata.command).toBe("tokenjuice wrap --raw -- printf 'ok\\n'");
    expect(metadata[0]?.metadata.rawChars).toBeGreaterThan(0);
    expect(metadata[0]?.metadata.reducedChars).toBe(metadata[0]?.metadata.rawChars);
    expect(metadata[0]?.metadata.ratio).toBe(1);
    expect(metadata[0]?.path).toBeUndefined();
  });

  it("writes rolling hook history entries alongside the last snapshot", async () => {
    const home = await createTempDir();
    process.env.CODEX_HOME = home;

    const firstPayload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "sed -n '1,40p' src/core/codex.ts",
      },
      tool_response: [
        "function example() {",
        "  throw new AssertionError();",
        "}",
      ].join("\n"),
    });
    const secondPayload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "git status --short",
      },
      tool_response: " M src/core/codex.ts\n",
    });

    await captureStdout(() => runCodexPostToolUseHook(firstPayload));
    await captureStdout(() => runCodexPostToolUseHook(secondPayload));

    const last = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      timestamp?: string;
      command?: string;
      tokenjuiceVersion?: string;
      hookCommandPath?: string;
    };
    const historyLines = (await readFile(join(home, "tokenjuice-hook.history.jsonl"), "utf8"))
      .trim()
      .split("\n");
    const history = historyLines.map((line) => JSON.parse(line) as {
      timestamp?: string;
      command?: string;
      skipped?: string;
      rewrote?: boolean;
      tokenjuiceVersion?: string;
      hookCommandPath?: string;
      savedChars?: number;
      ratio?: number;
    });

    expect(last.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(last.command).toBe("git status --short");
    expect(last.tokenjuiceVersion).toBe(PACKAGE_VERSION);
    expect(typeof last.hookCommandPath).toBe("string");
    expect(last.hookCommandPath).not.toBe("");
    expect(history).toHaveLength(2);
    expect(history.map((entry) => entry.command)).toEqual([
      "sed -n '1,40p' src/core/codex.ts",
      "git status --short",
    ]);
    expect(history[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(history[0]?.skipped).toBe("inspection-command");
    expect(history[0]?.tokenjuiceVersion).toBe(PACKAGE_VERSION);
    expect(history[0]?.savedChars).toBe(0);
    expect(history[0]?.ratio).toBe(1);
    expect(history[0]?.matchedReducer).toBeUndefined();
    expect(history[1]?.rewrote).toBe(false);
    expect(history[1]?.skipped).toBe("low-savings-compaction");
    expect(history[1]?.savedChars).toBe(1);
  });
});
