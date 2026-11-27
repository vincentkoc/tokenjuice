import { chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { doctorCodelyCliHook, installCodelyCliHook, runCodelyCliBeforeToolHook, uninstallCodelyCliHook } from "../../src/hosts/codely-cli/index.js";
import { getAvailableHookIntegrationNames } from "../../src/hosts/shared/hook-doctor.js";

let home: string;
let launcher: string;
let savedEnv: NodeJS.ProcessEnv;
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;

beforeEach(async () => {
  savedEnv = { ...process.env };
  home = await mkdtemp(join(tmpdir(), "tokenjuice-codely-test-"));
  process.env.HOME = home;
  process.env.TOKENJUICE_CODELY_CLI_SHELL = "/bin/sh";
  launcher = join(home, "tokenjuice");
  await writeFile(launcher, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
});

afterEach(async () => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", originalPlatform);
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  await rm(home, { recursive: true, force: true });
});

const local = () => ({ local: true, binaryPath: launcher });
async function readConfig(path: string) { return JSON.parse(await readFile(path, "utf8")); }

async function hook(payload: unknown, wrapLauncher = "tokenjuice") {
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write);
  const code = await runCodelyCliBeforeToolHook(typeof payload === "string" ? payload : JSON.stringify(payload), wrapLauncher);
  vi.restoreAllMocks();
  return { code, value: JSON.parse(output) };
}

describe("Codely CLI integration", () => {
  it("installs the native BeforeTool shape in the user config and is idempotent", async () => {
    const result = await installCodelyCliHook(undefined, local());
    expect(result.settingsPath).toBe(join(home, ".codely-cli", "settings.json"));
    expect((await readConfig(result.settingsPath)).hooks).toEqual({
      enabled: true,
      BeforeTool: [{ matcher: "^run_shell_command$", sequential: true, hooks: [{
        type: "command", name: "tokenjuice-codely-cli", command: result.command, timeout: 60000,
      }] }],
    });
    await installCodelyCliHook(undefined, local());
    expect((await readConfig(result.settingsPath)).hooks.BeforeTool).toHaveLength(1);
    expect((await doctorCodelyCliHook(undefined, local())).status).toBe("ok");
    expect(getAvailableHookIntegrationNames()).toContain("codely-cli");
  });

  it("preserves custom settings and shared hooks when installing and uninstalling", async () => {
    const path = join(home, "settings.json");
    const custom = { type: "command", name: "custom", command: "echo codely-cli-before-tool" };
    await writeFile(path, JSON.stringify({ theme: "dark", hooks: {
      mode: "strict", BeforeTool: [{ matcher: "read_file", hooks: [custom] }],
      AfterTool: [{ hooks: [{ type: "command", command: "audit-tool" }] }],
    } }));
    const first = await installCodelyCliHook(path, local());
    expect((await readConfig(path)).theme).toBe("dark");
    const config = await readConfig(path);
    config.hooks.BeforeTool[1].hooks.push(custom);
    await writeFile(path, JSON.stringify(config));
    expect((await uninstallCodelyCliHook(path)).removed).toBe(1);
    const final = await readConfig(path);
    expect(final.hooks.BeforeTool).toEqual([{ matcher: "read_file", hooks: [custom] }, {
      matcher: "^run_shell_command$", sequential: true, hooks: [custom],
    }]);
    expect(final.hooks.AfterTool).toEqual(config.hooks.AfterTool);
    expect(final.hooks.mode).toBe("strict");
    expect(first.backupPath).toBe(`${path}.bak`);
    expect((await uninstallCodelyCliHook(path)).removed).toBe(0);
  });

  it.each([{ enabled: false }, { mode: "disabled" }, { disabled: ["tokenjuice-codely-cli"] }])(
    "preserves explicit hook disable controls and reports them: %j", async (controls) => {
      const path = join(home, "settings.json");
      await writeFile(path, JSON.stringify({ hooks: controls }));
      await installCodelyCliHook(path, local());
      expect((await readConfig(path)).hooks).toMatchObject(controls);
      const report = await doctorCodelyCliHook(path, local());
      expect(report.status).toBe("broken");
      expect(report.issues.join(" ")).toContain("disable");
    },
  );

  it("reports missing, mismatched, and absent launchers", async () => {
    const path = join(home, "settings.json");
    expect((await doctorCodelyCliHook(path, local())).status).toBe("disabled");
    await installCodelyCliHook(path, local());
    const mismatch = await doctorCodelyCliHook(path, { local: true, binaryPath: join(home, "other") });
    expect(mismatch.status).toBe("broken");
    await rm(launcher);
    expect((await doctorCodelyCliHook(path, local())).status).toBe("broken");
  });

  it("reports a changed matcher and repairs it without duplicating hooks", async () => {
    const { settingsPath } = await installCodelyCliHook(undefined, local());
    const config = await readConfig(settingsPath);
    config.hooks.BeforeTool[0].matcher = "read_file";
    await writeFile(settingsPath, JSON.stringify(config));
    expect((await doctorCodelyCliHook(settingsPath, local())).status).toBe("broken");
    await installCodelyCliHook(settingsPath, local());
    expect((await doctorCodelyCliHook(settingsPath, local())).status).toBe("ok");
    expect((await readConfig(settingsPath)).hooks.BeforeTool).toHaveLength(1);
  });

  it.each(["[]", "null", '{"hooks":[]}', '{"hooks":{"BeforeTool":false}}', "{invalid"])(
    "does not replace invalid user configuration: %s", async (text) => {
      const path = join(home, "settings.json");
      await writeFile(path, text);
      await expect(installCodelyCliHook(path, local())).rejects.toThrow(/JSON|must be an array/u);
      expect(await readFile(path, "utf8")).toBe(text);
    },
  );

  it.skipIf(process.platform === "win32")("preserves symlinks and target permissions", async () => {
    const target = join(home, "target.json");
    const path = join(home, "settings.json");
    await writeFile(target, "{}", { mode: 0o640 });
    await chmod(target, 0o640);
    await symlink(target, path);
    await installCodelyCliHook(path, local());
    expect((await lstat(path)).isSymbolicLink()).toBe(true);
    expect((await lstat(target)).mode & 0o777).toBe(0o640);
    await uninstallCodelyCliHook(path);
    expect((await lstat(path)).isSymbolicLink()).toBe(true);
  });

  it("rewrites only the shell command and leaves permission decisions to Codely", async () => {
    const input = { command: "printf '%s' \"hello\"", description: "example", dir_path: "/workspace", timeout: 1000 };
    const result = await hook({ hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: input });
    expect(result.code).toBe(0);
    expect(result.value).not.toHaveProperty("decision");
    expect(result.value.hookSpecificOutput.hookEventName).toBe("BeforeTool");
    expect(result.value.hookSpecificOutput.tool_input).toMatchObject({ description: input.description, dir_path: input.dir_path, timeout: 1000 });
    expect(result.value.hookSpecificOutput.tool_input.command).toContain("wrap --keep-failures --source codely-cli -- /bin/sh -lc");
  });

  it.each([
    "not-json", "null", "[]", {},
    { hook_event_name: "AfterTool", tool_name: "run_shell_command", tool_input: { command: "ls" } },
    { hook_event_name: "BeforeTool", tool_name: "read_file", tool_input: { command: "ls" } },
    { hook_event_name: "BeforeTool", tool_name: "mcp_shell", tool_input: { command: "ls" } },
    ...["", "  ", 42, "tokenjuice wrap --raw -- ls", "/usr/local/bin/tokenjuice wrap -- ls"].map((command) =>
      ({ hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command } })),
  ])("fails open without rewriting unsupported or explicit wrapper input: %j", async (payload) => {
    expect(await hook(payload)).toEqual({ code: 0, value: {} });
  });

  it("does not install or wrap on native Windows", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    await expect(installCodelyCliHook(undefined, local())).rejects.toThrow("WSL");
    expect(await hook({ hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command: "ls" } }))
      .toEqual({ code: 0, value: {} });
  });

  it("leaves input unchanged when no shell is available", async () => {
    process.env.TOKENJUICE_CODELY_CLI_SHELL = join(home, "missing-shell");
    process.env.PATH = "";
    expect(await hook({ hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command: "ls" } }))
      .toEqual({ code: 0, value: {} });
  });
});
