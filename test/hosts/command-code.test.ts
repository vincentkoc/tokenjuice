import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { doctorCommandCodeHook, installCommandCodeHook, runCommandCodePostToolUseHook, uninstallCommandCodeHook } from "../../src/index.js";
import * as settingsFiles from "../../src/hosts/shared/settings-file.js";

const directories: string[] = [];
const keys = ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "CURSOR_HOME", "PI_CODING_AGENT_DIR", "OPENCODE_CONFIG_DIR", "TOKENJUICE_CURSOR_SHELL", "SHELL", "HOME", "PATH", "COMMANDCODE_HOME", "COMMANDCODE_PROJECT_DIR"] as const;
const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
afterEach(async () => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", platform);
  for (const key of keys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "tokenjuice-command-code-"));
  directories.push(home);
  process.env.HOME = home;
  process.env.COMMANDCODE_HOME = join(home, ".commandcode");
  delete process.env.COMMANDCODE_PROJECT_DIR;
  return { home, path: join(home, ".commandcode", "settings.json") };
}
const owned = { type: "command", command: "tokenjuice command-code-post-tool-use", timeout: 10 };
const config = (hooks: unknown[]) => ({ theme: "dark", hooks: { PreToolUse: [{ hooks: [{ command: "custom" }] }], PostToolUse: [{ matcher: "shell", hooks }] } });
async function writeConfig(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), { mode: 0o640 });
}

describe("retired Command Code additive hooks", () => {
  it("rejects installation before creating settings or backups", async () => {
    const { path } = await fixture();
    await expect(installCommandCodeHook()).rejects.toThrow("additive hooks do not replace tool output");
    await expect(stat(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await doctorCommandCodeHook()).status).toBe("disabled");
    expect((await uninstallCommandCodeHook()).removed).toBe(0);
    await expect(stat(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes only generated entries and preserves config, modes and existing sidecars", async () => {
    const { path } = await fixture();
    const custom = [
      { type: "command", command: "echo tokenjuice command-code-post-tool-use" },
      { type: "command", command: "tokenjuice command-code-post-tool-use && echo custom" },
      { type: "command", command: "node custom.js command-code-post-tool-use" },
      { type: "command", command: "tokenjuice 'command-code-post-tool-use" },
      { type: "webhook", command: owned.command },
    ];
    const original = config([owned, { ...owned, command: "node '/opt/tokenjuice/dist/cli/main.js' command-code-post-tool-use" }, ...custom]);
    original.hooks.PostToolUse.push({ matcher: "read", hooks: [] });
    await writeConfig(path, original);
    await writeFile(`${path}.bak`, "keep backup");
    await writeFile(`${path}.tmp`, "keep sidecar");
    const doctor = await doctorCommandCodeHook();
    expect(doctor.status).toBe("broken");
    expect(doctor.fixCommand).toBe("tokenjuice uninstall command-code");
    expect((await uninstallCommandCodeHook()).removed).toBe(2);
    original.hooks.PostToolUse[0]!.hooks = custom;
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(original);
    expect((await stat(path)).mode & 0o777).toBe(0o640);
    expect(await readFile(`${path}.bak`, "utf8")).toBe("keep backup");
    expect(await readFile(`${path}.tmp`, "utf8")).toBe("keep sidecar");
    expect((await doctorCommandCodeHook()).status).toBe("disabled");
    expect((await uninstallCommandCodeHook()).removed).toBe(0);
  });

  it("retains the project override and explicit settings path for scoped cleanup", async () => {
    const { home, path } = await fixture();
    await writeConfig(path, config([owned]));
    const project = join(home, "project");
    const projectPath = join(project, ".commandcode", "settings.json");
    await writeConfig(projectPath, config([owned]));
    process.env.COMMANDCODE_PROJECT_DIR = project;
    expect((await uninstallCommandCodeHook()).settingsPath).toBe(projectPath);
    expect((await doctorCommandCodeHook(path)).status).toBe("broken");
    expect((await uninstallCommandCodeHook(path)).removed).toBe(1);
  });

  it("preserves targets behind file, directory and project symlinks", async () => {
    const { home, path } = await fixture();
    const outside = join(home, "outside");
    await writeConfig(join(outside, "settings.json"), config([owned]));
    await mkdir(dirname(path));
    await symlink(join(outside, "settings.json"), path);
    await expect(uninstallCommandCodeHook()).rejects.toThrow("symlink");
    expect((await doctorCommandCodeHook()).status).toBe("broken");
    await rm(dirname(path), { recursive: true });
    await symlink(outside, dirname(path));
    await expect(uninstallCommandCodeHook()).rejects.toThrow("symlink");
    const project = join(home, "project-link");
    await symlink(outside, project);
    process.env.COMMANDCODE_PROJECT_DIR = project;
    await expect(uninstallCommandCodeHook()).rejects.toThrow("symlink");
    expect(JSON.parse(await readFile(join(outside, "settings.json"), "utf8"))).toEqual(config([owned]));
  });

  it("preserves malformed files and edits made after the cleanup read", async () => {
    const { path } = await fixture();
    await writeConfig(path, config([owned]));
    const originalRead = settingsFiles.readSettingsFile;
    vi.spyOn(settingsFiles, "readSettingsFile").mockImplementationOnce(async path => {
      const file = await originalRead(path);
      await writeFile(path, "concurrent user edit");
      return file;
    });
    await expect(uninstallCommandCodeHook()).rejects.toThrow("settings changed");
    expect(await readFile(path, "utf8")).toBe("concurrent user edit");
    await expect(uninstallCommandCodeHook()).rejects.toThrow(/JSON|Unexpected|token/u);
    expect(await readFile(path, "utf8")).toBe("concurrent user edit");
  });

  it("keeps stale runtime hooks silent for all payloads", async () => {
    let output = "";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => { output += chunk.toString(); return true; });
    for (const payload of ["{bad", "null", JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "shell_command", tool_response: "noisy output" })]) {
      expect(await runCommandCodePostToolUseHook(payload)).toBe(0);
    }
    spy.mockRestore();
    expect(output).toBe("{}\n{}\n{}\n");
  });
});
