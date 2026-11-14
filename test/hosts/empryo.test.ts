import { chmod, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { doctorEmpryoHook, installEmpryoHook, runEmpryoPreToolUseHook, uninstallEmpryoHook } from "../../src/hosts/empryo/index.js";
import { parseWrappedCommand } from "./shared/wrap-command.js";

let root: string;
let savedEnv: NodeJS.ProcessEnv;
const platform = process.platform;
let options: { projectDir: string; local: boolean; binaryPath: string };

beforeEach(async () => {
  savedEnv = { ...process.env };
  root = await mkdtemp(join(tmpdir(), "tokenjuice-empryo-"));
  process.env.HOME = join(root, "home");
  process.env.USERPROFILE = process.env.HOME;
  process.env.PATH = join(root, "bin");
  process.env.SHELL = "/not-the-host-shell/zsh";
  await mkdir(process.env.PATH, { recursive: true });
  const binaryPath = join(process.env.PATH, "tokenjuice");
  await writeFile(binaryPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  await writeFile(join(process.env.PATH, "sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  options = { projectDir: join(root, "project"), local: true, binaryPath };
});

afterEach(async () => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", { value: platform });
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  await rm(root, { recursive: true, force: true });
});

async function capture(payload: unknown): Promise<string> {
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  expect(await runEmpryoPreToolUseHook(typeof payload === "string" ? payload : JSON.stringify(payload), options.binaryPath)).toBe(0);
  return output;
}

describe("Empryo / SoulForge lifecycle", () => {
  it("installs once in the native project config, preserving custom and inherited hooks", async () => {
    const settingsPath = join(options.projectDir, ".soulforge", "config.json");
    const inheritedPath = join(process.env.HOME!, ".claude", "settings.json");
    await mkdir(join(options.projectDir, ".soulforge"), { recursive: true });
    await mkdir(join(process.env.HOME!, ".claude"), { recursive: true });
    const inherited = '{"hooks":{"PreToolUse":[{"hooks":[{"command":"custom"}]}]}}';
    await writeFile(inheritedPath, inherited);
    const custom = { matcher: "Bash", hooks: [{ type: "command", command: "echo custom", async: true }] };
    await writeFile(settingsPath, JSON.stringify({ provider: "keep", hooks: { PreToolUse: [custom], Stop: [custom] } }));
    await installEmpryoHook(undefined, options);
    await installEmpryoHook(undefined, options);
    const config = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(config.provider).toBe("keep");
    expect(config.hooks.PreToolUse).toHaveLength(2);
    expect(config.hooks.PreToolUse[0]).toEqual(custom);
    expect(config.hooks.Stop).toEqual([custom]);
    expect(config.hooks.PreToolUse[1]).toMatchObject({ matcher: "Bash", hooks: [{ type: "command", timeout: 10 }] });
    expect(await readFile(inheritedPath, "utf8")).toBe(inherited);
    expect((await doctorEmpryoHook(undefined, options)).status).toBe("ok");
    expect((await uninstallEmpryoHook(undefined, options)).removed).toBe(true);
    expect(JSON.parse(await readFile(settingsPath, "utf8")).hooks.PreToolUse).toEqual([custom]);
    expect((await uninstallEmpryoHook(undefined, options)).removed).toBe(false);
    expect((await doctorEmpryoHook(undefined, options)).status).toBe("disabled");
  });

  it("preserves settings symlinks and malformed configurations", async () => {
    const target = join(root, "settings.json");
    const link = join(root, "settings-link.json");
    await writeFile(target, '{"custom":true}');
    await symlink(target, link);
    await installEmpryoHook(link, options);
    expect(await readlink(link)).toBe(target);
    await uninstallEmpryoHook(link, options);
    expect(JSON.parse(await readFile(target, "utf8")).custom).toBe(true);
    for (const invalid of ["{", "[]", '{"hooks":[]}', '{"hooks":{"PreToolUse":{}}}']) {
      await writeFile(target, invalid);
      await expect(installEmpryoHook(target, options)).rejects.toThrow();
      expect(await readFile(target, "utf8")).toBe(invalid);
    }
  });

  it("detects inherited global disable, stale launchers and missing executables", async () => {
    const installed = await installEmpryoHook(undefined, options);
    const global = join(process.env.HOME!, ".soulforge", "config.json");
    await mkdir(join(process.env.HOME!, ".soulforge"), { recursive: true });
    await writeFile(global, '{"disableAllHooks":true}');
    expect(await doctorEmpryoHook(undefined, options)).toMatchObject({ status: "broken", issues: [expect.stringContaining("disableAllHooks")] });
    await rm(global);
    expect((await doctorEmpryoHook(undefined, { ...options, binaryPath: join(root, "other") })).status).toBe("warn");
    await chmod(options.binaryPath, 0o644);
    expect((await doctorEmpryoHook(installed.settingsPath, options)).status).toBe("broken");
  });

  it("does not remove custom commands mentioning the hook subcommand", async () => {
    const installed = await installEmpryoHook(undefined, options);
    const config = JSON.parse(await readFile(installed.settingsPath, "utf8"));
    const custom = { type: "command", command: "echo empryo-pre-tool-use" };
    config.hooks.PreToolUse[0].hooks.push(custom);
    await writeFile(installed.settingsPath, JSON.stringify(config));
    await uninstallEmpryoHook(installed.settingsPath, options);
    expect(JSON.parse(await readFile(installed.settingsPath, "utf8")).hooks.PreToolUse[0].hooks).toEqual([custom]);
  });
});

describe("Empryo native PreToolUse payload", () => {
  it("preserves input fields and sh -c semantics without granting permission", async () => {
    const input = { command: "printf '%s\\n' 'a b' && exit 7", cwd: "/workspace/sub", timeout: 1234 };
    const output = JSON.parse(await capture({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: input }));
    const specific = output.hookSpecificOutput;
    expect(specific.hookEventName).toBe("PreToolUse");
    expect(specific.permissionDecision).toBeUndefined();
    expect(specific.updatedInput).toMatchObject({ cwd: input.cwd, timeout: input.timeout });
    const wrapped = parseWrappedCommand(specific.updatedInput.command);
    expect(wrapped.inner).toBe(input.command);
    expect(wrapped.shellPath).toBe(join(process.env.PATH!, "sh"));
    expect(wrapped.shellFlag).toBe("-c");
    expect(wrapped.wrapArgs).toEqual(["--keep-failures", "--source", "empryo"]);
  });

  it.each(["{", "null", "[]", {}, { hook_event_name: "PostToolUse", tool_name: "Bash" },
    { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { command: "cat file" } },
    { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "" } },
    { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "tokenjuice wrap --raw -- cat file" } },
  ])("fails open for non-target, invalid and already wrapped inputs: %j", async (payload) => {
    expect(await capture(payload)).toBe("");
  });

  it("leaves input unchanged when sh is missing or the platform is native Windows", async () => {
    const payload = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } };
    await rm(join(process.env.PATH!, "sh"));
    expect(await capture(payload)).toBe("");
    Object.defineProperty(process, "platform", { value: "win32" });
    expect(await capture(payload)).toBe("");
    await expect(installEmpryoHook(undefined, options)).rejects.toThrow("POSIX");
  });
});
