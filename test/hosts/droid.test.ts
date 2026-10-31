import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  doctorDroidHook,
  installDroidHook,
  runDroidPostToolUseHook,
  runDroidPreToolUseHook,
  uninstallDroidHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const originalEnv = {
  FACTORY_HOME: process.env.FACTORY_HOME,
  TOKENJUICE_DROID_SHELL: process.env.TOKENJUICE_DROID_SHELL,
  SHELL: process.env.SHELL,
  PATH: process.env.PATH,
  TOKENJUICE_ARTIFACT_DIR: process.env.TOKENJUICE_ARTIFACT_DIR,
  TOKENJUICE_STATS: process.env.TOKENJUICE_STATS,
  TOKENJUICE_DROID_STORE: process.env.TOKENJUICE_DROID_STORE,
  TOKENJUICE_DROID_MAX_INLINE_CHARS: process.env.TOKENJUICE_DROID_MAX_INLINE_CHARS,
};

beforeEach(async () => {
  const home = await createTempDir();
  process.env.FACTORY_HOME = home;
  process.env.TOKENJUICE_DROID_SHELL = "/bin/sh";
  process.env.TOKENJUICE_ARTIFACT_DIR = join(home, "artifacts");
  delete process.env.TOKENJUICE_STATS;
  delete process.env.TOKENJUICE_DROID_STORE;
  delete process.env.TOKENJUICE_DROID_MAX_INLINE_CHARS;
});

afterEach(async () => {
  Object.defineProperty(process, "platform", originalPlatform);
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
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

const noisyPayload = {
  hook_event_name: "PostToolUse",
  tool_name: "Execute",
  tool_input: { command: "git status" },
  tool_response: [
    "On branch main",
    "Changes not staged for commit:",
    ...Array.from({ length: 20 }, (_, index) => `\tmodified:   src/file-${index}.ts`),
    "no changes added to commit",
  ].join("\n"),
};

describe("droid hooks", () => {
  it.each(["hooks.json", "hooks/hooks.json"])("uses the standalone %s event map ahead of settings.json", async (relativePath) => {
    const home = process.env.FACTORY_HOME!;
    const hooksPath = join(home, relativePath);
    await mkdir(join(home, "hooks"), { recursive: true });
    const settingsPath = join(home, "settings.json");
    const settingsText = JSON.stringify({ model: "custom", hooks: { PreToolUse: [{ hooks: [{ command: "settings-only" }] }] } });
    await writeFile(settingsPath, settingsText);
    const existing = { SessionStart: [{ hooks: [{ type: "command", command: "other-hook" }] }], PostToolUse: [{
      matcher: "Execute", hooks: [{ type: "command", command: "tokenjuice droid-post-tool-use" }],
    }] };
    await writeFile(hooksPath, JSON.stringify(existing));
    const launcherPath = join(home, "tokenjuice");
    await writeFile(launcherPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const options = { binaryPath: launcherPath, local: true };

    const installed = await installDroidHook(undefined, options);
    expect(installed.settingsPath).toBe(hooksPath);
    expect(JSON.parse(await readFile(installed.backupPath!, "utf8"))).toEqual(existing);
    const config = JSON.parse(await readFile(hooksPath, "utf8"));
    expect(config.hooks).toBeUndefined();
    expect(config.SessionStart).toEqual(existing.SessionStart);
    expect(config.PostToolUse).toBeUndefined();
    expect(config.PreToolUse[0].matcher).toBe("Execute");
    expect(await readFile(settingsPath, "utf8")).toBe(settingsText);
    expect(await doctorDroidHook(undefined, options)).toMatchObject({ settingsPath: hooksPath, status: "ok" });
    expect(await uninstallDroidHook()).toEqual({ settingsPath: hooksPath, removed: 1 });
    expect(JSON.parse(await readFile(hooksPath, "utf8"))).toEqual({ SessionStart: existing.SessionStart });
    expect((await doctorDroidHook(undefined, options)).status).toBe("disabled");
  });

  it("does not report a shadowed settings.json hook as active", async () => {
    const home = process.env.FACTORY_HOME!;
    const options = { binaryPath: "/opt/tokenjuice", local: true };
    await installDroidHook(undefined, options);
    await mkdir(join(home, "hooks"));
    await writeFile(join(home, "hooks", "hooks.json"), "{}");
    await writeFile(join(home, "hooks.json"), "{}");
    expect(await doctorDroidHook(undefined, options)).toMatchObject({ settingsPath: join(home, "hooks.json"), status: "disabled" });
  });

  it("does not install or run POSIX wrappers on native Windows", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    await expect(installDroidHook(undefined, { binaryPath: "/opt/tokenjuice", local: true }))
      .rejects.toThrow("WSL");
    const report = await doctorDroidHook(undefined, { binaryPath: "/opt/tokenjuice", local: true });
    expect(report.status).toBe("disabled");
    expect(report.fixCommand).toContain("WSL");
    expect(await captureStdout(() => runDroidPreToolUseHook(JSON.stringify({
      hook_event_name: "PreToolUse", tool_name: "Execute", tool_input: { command: "ls" },
    })))).toEqual({ code: 0, output: "{}\n" });
  });

  it("wraps Execute input without changing other fields or granting permission", async () => {
    const toolInput = { command: "printf '%s\\n' \"a b\" && exit 7", timeout: 45, runInBackground: false };
    const { code, output } = await captureStdout(() => runDroidPreToolUseHook(JSON.stringify({
      hook_event_name: "PreToolUse", tool_name: "Execute", tool_input: toolInput,
    }), "/opt/tokenjuice/bin/tokenjuice"));
    const response = JSON.parse(output).hookSpecificOutput;
    expect(code).toBe(0);
    expect(response.hookEventName).toBe("PreToolUse");
    expect(response.updatedInput).toEqual({ ...toolInput, command: expect.stringContaining("wrap --source") });
    expect(response.updatedInput.command).toContain("/bin/sh -lc");
    expect(response.updatedInput.command).toContain("exit 7");
    expect(response.permissionDecision).toBeUndefined();
  });

  it.each([
    "not json", "null", "[]",
    JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Execute", tool_input: { command: "ls" } }),
    JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { command: "ls" } }),
    JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Execute", tool_input: {} }),
  ])("leaves unsupported pre-tool payloads unchanged: %s", async (payload) => {
    expect(await captureStdout(() => runDroidPreToolUseHook(payload))).toEqual({ code: 0, output: "{}\n" });
  });

  it.each([
    "tokenjuice wrap --raw -- git status",
    "/opt/bin/tokenjuice wrap -- git status",
    "cd /repo && tokenjuice wrap --raw -- git status",
    "node /opt/tokenjuice/dist/cli/main.js wrap --raw -- git status",
  ])("does not rewrap an explicit wrapper: %s", async (command) => {
    expect(await captureStdout(() => runDroidPreToolUseHook(JSON.stringify({
      hook_event_name: "PreToolUse", tool_name: "Execute", tool_input: { command },
    })))).toEqual({ code: 0, output: "{}\n" });
  });

  it("leaves commands unchanged when no shell is available", async () => {
    process.env.TOKENJUICE_DROID_SHELL = "/missing/tokenjuice-shell";
    process.env.SHELL = "/missing/tokenjuice-shell";
    process.env.PATH = "";
    expect(await captureStdout(() => runDroidPreToolUseHook(JSON.stringify({
      hook_event_name: "PreToolUse", tool_name: "Execute", tool_input: { command: "ls" },
    })))).toEqual({ code: 0, output: "{}\n" });
  });

  it("migrates a mixed legacy group while preserving unrelated hooks", async () => {
    const home = process.env.FACTORY_HOME!;
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "tokenjuice");
    await writeFile(launcherPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    await writeFile(settingsPath, JSON.stringify({ hooks: { PostToolUse: [{
      matcher: "Execute", hooks: [
        { type: "command", command: `${launcherPath} droid-post-tool-use` },
        { type: "command", command: "other-hook" },
      ],
    }] } }));
    expect((await doctorDroidHook(settingsPath, { binaryPath: launcherPath, local: true })).status).toBe("broken");
    await installDroidHook(settingsPath, { binaryPath: launcherPath, local: true });
    const config = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(config.hooks.PostToolUse[0].hooks).toEqual([{ type: "command", command: "other-hook" }]);
    expect(config.hooks.PreToolUse[0].matcher).toBe("Execute");
    expect((await doctorDroidHook(settingsPath, { binaryPath: launcherPath, local: true })).status).toBe("ok");
  });

  it.each([
    ["rewrite", {}],
    ["non-post-tool-use", { hook_event_name: "PreToolUse" }],
    ["non-execute", { tool_name: "Read" }],
    ["missing-command", { tool_input: {} }],
    ["empty-tool-response", { tool_response: "" }],
    ["explicit-raw-bypass", { tool_input: { command: "tokenjuice wrap --raw -- git status" } }],
    ["unsupported-command", { tool_input: { command: "unknown-command" }, tool_response: "short output" }],
  ])("does not create diagnostic or metadata files with stats off: %s", async (path, overrides) => {
    const home = process.env.FACTORY_HOME!;
    process.env.FACTORY_HOME = join(home, "unused-factory-home");
    process.env.TOKENJUICE_STATS = "off";

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(JSON.stringify({
      ...noisyPayload,
      ...overrides,
    })));

    const response = JSON.parse(output);
    expect(code).toBe(0);
    expect(response.suppressOutput).toBe(path === "rewrite" ? true : undefined);
    expect(output).toBe(path === "rewrite" ? `${JSON.stringify(response)}\n` : "{}\n");
    expect(await readdir(home)).toEqual([]);
  });

  it("leaves existing diagnostics unchanged when stats are disabled", async () => {
    const home = process.env.FACTORY_HOME!;
    const debugPath = join(home, "tokenjuice-hook.last.json");
    const previous = '{"previous":"diagnostic"}\n';
    await writeFile(debugPath, previous);
    process.env.TOKENJUICE_STATS = "off";

    await captureStdout(() => runDroidPostToolUseHook(JSON.stringify(noisyPayload)));
    await captureStdout(() => runDroidPostToolUseHook(JSON.stringify({ ...noisyPayload, tool_name: "Read" })));

    expect(await readFile(debugPath, "utf8")).toBe(previous);
    expect(await readdir(home)).toEqual(["tokenjuice-hook.last.json"]);
  });

  it.each([
    ["mkdir", "rewrite"],
    ["mkdir", "early-skip"],
    ["write", "rewrite"],
    ["write", "early-skip"],
  ])("keeps exactly one hook response when diagnostic %s fails on %s", async (operation, path) => {
    const home = process.env.FACTORY_HOME!;
    if (operation === "mkdir") {
      const blockedHome = join(home, "blocked-home");
      await writeFile(blockedHome, "occupied");
      process.env.FACTORY_HOME = blockedHome;
    } else {
      await mkdir(join(home, "tokenjuice-hook.last.json"));
    }

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(JSON.stringify({
      ...noisyPayload,
      ...(path === "early-skip" ? { tool_name: "Read" } : {}),
    })));

    const response = JSON.parse(output);
    expect(code).toBe(0);
    expect(response.suppressOutput).toBe(path === "rewrite" ? true : undefined);
    expect(output).toBe(path === "rewrite" ? `${JSON.stringify(response)}\n` : "{}\n");
  });

  it("preserves explicitly requested raw artifacts with statistics disabled", async () => {
    const home = process.env.FACTORY_HOME!;
    const artifactDir = process.env.TOKENJUICE_ARTIFACT_DIR!;
    process.env.TOKENJUICE_STATS = "off";
    process.env.TOKENJUICE_DROID_STORE = "true";

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(JSON.stringify(noisyPayload)));
    const files = await readdir(artifactDir);
    const rawFile = files.find((file) => file.endsWith(".txt"));

    expect(code).toBe(0);
    expect(JSON.parse(output).suppressOutput).toBe(true);
    expect(files).toHaveLength(2);
    expect(rawFile).toBeDefined();
    expect(files).toContain(rawFile!.replace(/\.txt$/, ".json"));
    expect(await readFile(join(artifactDir, rawFile!), "utf8")).toBe(noisyPayload.tool_response);
    expect(await readdir(home)).toEqual(["artifacts"]);
  });

  it("keeps the error response free of diagnostics when statistics are disabled", async () => {
    const home = process.env.FACTORY_HOME!;
    const artifactDir = process.env.TOKENJUICE_ARTIFACT_DIR!;
    await writeFile(artifactDir, "occupied");
    process.env.TOKENJUICE_STATS = "off";
    process.env.TOKENJUICE_DROID_STORE = "true";

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(JSON.stringify(noisyPayload)));

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
    expect(await readdir(home)).toEqual(["artifacts"]);
    expect(await readFile(artifactDir, "utf8")).toBe("occupied");
  });

  it("installs a PreToolUse hook into Factory settings.json", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "bin", "tokenjuice");

    const result = await installDroidHook(settingsPath, { binaryPath: launcherPath, local: true });
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string; timeout: number }> }> };
    };

    expect(result.settingsPath).toBe(settingsPath);
    expect(result.command).toBe(`${launcherPath} droid-pre-tool-use --wrap-launcher ${launcherPath}`);
    expect(result.backupPath).toBeUndefined();
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse[0]?.matcher).toBe("Execute");
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.command).toBe(`${launcherPath} droid-pre-tool-use --wrap-launcher ${launcherPath}`);
    expect(parsed.hooks.PreToolUse[0]?.hooks[0]?.timeout).toBe(60);
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
    expect((parsed.hooks as Record<string, unknown>).PreToolUse).toHaveLength(2);
  });

  it("replaces existing tokenjuice droid hook on reinstall", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "bin", "tokenjuice");

    await installDroidHook(settingsPath, { binaryPath: launcherPath, local: true });
    const first = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
    };
    expect(first.hooks.PreToolUse).toHaveLength(1);

    const newLauncherPath = join(home, "bin", "tokenjuice-new");
    await installDroidHook(settingsPath, { binaryPath: newLauncherPath, local: true });
    const second = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
    };

    expect(second.hooks.PreToolUse).toHaveLength(1);
    expect(second.hooks.PreToolUse[0]?.hooks[0]?.command).toBe(`${newLauncherPath} droid-pre-tool-use --wrap-launcher ${newLauncherPath}`);
  });

  it("reports installed and uninstalled hook health", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "tokenjuice");
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    await installDroidHook(settingsPath, { binaryPath: launcherPath, local: true });
    const installed = await doctorDroidHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(installed.status).toBe("ok");
    expect(installed.detectedCommand).toBe(`${launcherPath} droid-pre-tool-use --wrap-launcher ${launcherPath}`);
    expect(installed.advisories[0]).toContain("PreToolUse");

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

  it("honors tokenjuice raw bypass commands without re-compacting them", async () => {
    const home = await createTempDir();
    process.env.FACTORY_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Execute",
      cwd: "/repo",
      tool_input: {
        command: "tokenjuice wrap --raw -- git log --oneline -50",
      },
      tool_response: Array.from({ length: 50 }, (_, i) => `${String(i).padStart(7, "0")} commit message ${i}`).join("\n"),
    });

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("explicit-raw-bypass");
  });

  it("honors tokenjuice raw bypass commands with leading cd prefixes", async () => {
    const home = await createTempDir();
    process.env.FACTORY_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Execute",
      cwd: "/repo",
      tool_input: {
        command: "cd /data/code/project && tokenjuice wrap --raw -- python scripts/dump.py --limit 500",
      },
      tool_response: Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n"),
    });

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("explicit-raw-bypass");
  });

  it("does not treat inner command flags as a raw bypass without the wrap separator", async () => {
    const home = await createTempDir();
    process.env.FACTORY_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Execute",
      cwd: "/repo",
      tool_input: {
        command: "tokenjuice wrap git diff --raw",
      },
      tool_response: Array.from({ length: 40 }, (_, i) => `diff line ${i + 1}`).join("\n"),
    });

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      skipped?: string;
    };

    expect(code).toBe(0);
    expect(() => JSON.parse(output)).not.toThrow();
    expect(debug.skipped).not.toBe("explicit-raw-bypass");
  });

  it("honors absolute tokenjuice raw bypass commands", async () => {
    const home = await createTempDir();
    process.env.FACTORY_HOME = home;

    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Execute",
      cwd: "/repo",
      tool_input: {
        command: "/usr/local/bin/tokenjuice wrap --raw -- git status",
      },
      tool_response: Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n"),
    });

    const { code, output } = await captureStdout(() => runDroidPostToolUseHook(payload));
    const debug = JSON.parse(await readFile(join(home, "tokenjuice-hook.last.json"), "utf8")) as {
      rewrote: boolean;
      skipped?: string;
    };

    expect(code).toBe(0);
    expect(output).toBe("{}\n");
    expect(debug.rewrote).toBe(false);
    expect(debug.skipped).toBe("explicit-raw-bypass");
  });

  it("uninstall removes tokenjuice hooks but preserves other hooks", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "settings.json");
    const launcherPath = join(home, "bin", "tokenjuice");

    await installDroidHook(settingsPath, { binaryPath: launcherPath, local: true });

    // Add another hook manually
    const current = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { PreToolUse: unknown[] };
    };
    current.hooks.PreToolUse.push({
      matcher: "Edit",
      hooks: [{ type: "command", command: "other-hook" }],
    });
    await writeFile(settingsPath, `${JSON.stringify(current, null, 2)}\n`);

    const result = await uninstallDroidHook(settingsPath);
    const after = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string }> };
    };

    expect(result.removed).toBe(1);
    expect(after.hooks.PreToolUse).toHaveLength(1);
    expect(after.hooks.PreToolUse[0]?.matcher).toBe("Edit");
  });
});
