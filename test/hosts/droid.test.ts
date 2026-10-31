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
    expect(response.updatedInput).toEqual({ ...toolInput, command: expect.stringContaining("wrap --keep-failures --source") });
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

  it("keeps retired post-tool hooks silent without changing diagnostics or creating artifacts", async () => {
    const home = process.env.FACTORY_HOME!;
    const diagnostic = join(home, "tokenjuice-hook.last.json");
    await writeFile(diagnostic, "preserved diagnostic\n");
    process.env.TOKENJUICE_STATS = "1";
    process.env.TOKENJUICE_DROID_STORE = "true";
    const noisy = { hook_event_name: "PostToolUse", tool_name: "Execute",
      tool_input: { command: "find fixtures -type f" },
      tool_response: Array.from({ length: 80 }, (_, i) => `fixtures/file-${i}.txt`).join("\n") };
    for (const raw of ["{bad", "null", "[]", JSON.stringify(noisy), JSON.stringify({ ...noisy, exit_code: 7 })]) {
      expect(await captureStdout(() => runDroidPostToolUseHook(raw))).toEqual({ code: 0, output: "{}\n" });
    }
    expect(await readFile(diagnostic, "utf8")).toBe("preserved diagnostic\n");
    expect(await readdir(home)).toEqual(["tokenjuice-hook.last.json"]);
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
