import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { doctorZCodeHook, installZCodeHook, runZCodePreToolUseHook, uninstallZCodeHook } from "../../src/hosts/zcode/index.js";

let root: string;
let settingsPath: string;
let options: { local: boolean; binaryPath: string; nodePath: string };
let savedEnv: NodeJS.ProcessEnv;

beforeEach(async () => {
  savedEnv = { ...process.env };
  root = await mkdtemp(join(tmpdir(), "tokenjuice-zcode-"));
  settingsPath = join(root, "config.json");
  options = { local: true, binaryPath: join(root, "main.js"), nodePath: process.execPath };
  await writeFile(options.binaryPath, "// test launcher\n");
  process.env.PATH = "/bin:/usr/bin";
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  await rm(root, { recursive: true, force: true });
});

async function readConfig() {
  return JSON.parse(await readFile(settingsPath, "utf8"));
}

async function invoke(payload: unknown): Promise<Record<string, unknown> | undefined> {
  let output = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output += String(chunk);
    return true;
  });
  try {
    expect(await runZCodePreToolUseHook(typeof payload === "string" ? payload : JSON.stringify(payload), options.binaryPath)).toBe(0);
  } finally { spy.mockRestore(); }
  return output ? JSON.parse(output) : undefined;
}

describe("ZCode hook lifecycle", () => {
  it("installs idempotently and removes only its own entry from a mixed group", async () => {
    const first = await installZCodeHook(settingsPath, options);
    const config = await readConfig();
    config.custom = { keep: true };
    config.hooks.events.PreToolUse[0].hooks.push({ type: "command", command: "custom-check" });
    await writeFile(settingsPath, JSON.stringify(config));
    await installZCodeHook(settingsPath, options);
    await installZCodeHook(settingsPath, options);
    const installed = await readConfig();
    expect(installed.hooks.enabled).toBe(true);
    expect(installed.hooks.events.PreToolUse.flatMap((group: { hooks: unknown[] }) => group.hooks)).toEqual([
      { type: "command", command: "custom-check" },
      { type: "command", command: first.command, timeoutMs: 10000 },
    ]);
    expect((await doctorZCodeHook(settingsPath, options)).status).toBe("ok");
    expect((await uninstallZCodeHook(settingsPath)).removed).toBe(true);
    expect((await readConfig()).custom).toEqual({ keep: true });
    expect((await readConfig()).hooks.events.PreToolUse[0].hooks).toEqual([{ type: "command", command: "custom-check" }]);
    expect((await uninstallZCodeHook(settingsPath)).removed).toBe(false);
    expect((await doctorZCodeHook(settingsPath, options)).status).toBe("disabled");
  });

  it("preserves global disabling and reports it instead of enabling unrelated hooks", async () => {
    await writeFile(settingsPath, JSON.stringify({ hooks: { enabled: false, timeoutMs: 123, events: { Stop: [] } } }));
    await installZCodeHook(settingsPath, options);
    expect((await readConfig()).hooks).toMatchObject({ enabled: false, timeoutMs: 123, events: { Stop: [] } });
    expect((await doctorZCodeHook(settingsPath, options)).status).toBe("warn");
  });

  it("reports disabled, malformed and missing-path configuration", async () => {
    expect((await doctorZCodeHook(settingsPath, options)).status).toBe("disabled");
    await writeFile(settingsPath, '{"hooks":{"events":{"PreToolUse":{}}}}');
    const original = await readFile(settingsPath, "utf8");
    await expect(installZCodeHook(settingsPath, options)).rejects.toThrow("expected an array");
    expect(await readFile(settingsPath, "utf8")).toBe(original);
    await rm(settingsPath);
    await installZCodeHook(settingsPath, options);
    await rm(options.binaryPath);
    expect((await doctorZCodeHook(settingsPath, options)).status).toBe("broken");
  });

  it("preserves a settings symlink and refuses a dangling one", async () => {
    const target = join(root, "target.json");
    await writeFile(target, '{"custom":42}');
    await symlink(target, settingsPath);
    await installZCodeHook(settingsPath, options);
    expect(JSON.parse(await readFile(target, "utf8")).custom).toBe(42);
    await rm(target);
    await expect(installZCodeHook(settingsPath, options)).rejects.toThrow();
  });
});

describe("ZCode PreToolUse", () => {
  it("rewrites Bash with a complete input and no permission decision", async () => {
    process.env.SHELL = "/bin/zsh";
    const input = { command: "git status --short", timeout: 5000, description: "example", run_in_background: true, dangerouslyDisableSandbox: false };
    const response = await invoke({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: input });
    expect(response).toMatchObject({ hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: { ...input, command: expect.stringContaining("wrap --keep-failures --source zcode") },
    } });
    const hook = response?.hookSpecificOutput as Record<string, unknown>;
    expect(hook).not.toHaveProperty("permissionDecision");
    expect((hook.updatedInput as { command: string }).command).toContain("-- git status --short");
    expect((hook.updatedInput as { command: string }).command).not.toContain(" -lc ");
  });

  it("fails open for malformed, unrelated, empty and already wrapped commands", async () => {
    for (const payload of ["bad json", null, [], { hook_event_name: "PostToolUse" },
      { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { command: "cat file" } },
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: " " } },
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "tokenjuice wrap --raw -- cat file" } }]) {
      expect(await invoke(payload)).toBeUndefined();
    }
  });

  it("preserves native shell state, builtins and compound commands by leaving them unwrapped", async () => {
    for (const command of ["cd src", "cd src && git status", "export FOO=value", "umask 0077", "ls | sort", "git status >out", "source env.sh", "FOO=value git status", "printf '%s' hello", "pushd src", "popd", "dirs", "rehash", "setopt null_glob"]) {
      expect(await invoke({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } })).toBeUndefined();
    }
  });
});
