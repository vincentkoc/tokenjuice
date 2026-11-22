import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { doctorOpenHandsHook, installOpenHandsHook, runOpenHandsPostToolUseHook, uninstallOpenHandsHook } from "../../src/index.js";
import * as settingsFiles from "../../src/hosts/shared/settings-file.js";

const directories: string[] = [];
const keys = ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "CURSOR_HOME", "PI_CODING_AGENT_DIR", "OPENCODE_CONFIG_DIR", "TOKENJUICE_CURSOR_SHELL", "SHELL", "HOME", "PATH", "OPENHANDS_PROJECT_DIR"] as const;
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
  const home = await mkdtemp(join(tmpdir(), "tokenjuice-openhands-"));
  directories.push(home);
  process.env.HOME = home;
  process.env.OPENHANDS_PROJECT_DIR = home;
  return { home, path: join(home, ".openhands", "hooks.json") };
}
const owned = { type: "command", command: "tokenjuice openhands-post-tool-use", timeout: 10 };
const config = (hooks: unknown[]) => ({ theme: "dark", stop: [{ hooks: [{ command: "custom" }] }], post_tool_use: [{ matcher: "terminal", hooks }] });
async function writeConfig(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), { mode: 0o640 });
}

describe("retired OpenHands additive hooks", () => {
  it("rejects installation before creating settings or backups", async () => {
    const { path } = await fixture();
    await expect(installOpenHandsHook()).rejects.toThrow("additive hooks do not replace tool output");
    await expect(stat(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await doctorOpenHandsHook()).status).toBe("disabled");
    expect((await uninstallOpenHandsHook()).removed).toBe(0);
    await expect(stat(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes only generated entries and preserves config, modes and existing sidecars", async () => {
    const { path } = await fixture();
    const custom = [
      { type: "command", command: "echo tokenjuice openhands-post-tool-use" },
      { type: "command", command: "tokenjuice openhands-post-tool-use && echo custom" },
      { type: "command", command: "node custom.js openhands-post-tool-use" },
      { type: "command", command: "tokenjuice 'openhands-post-tool-use" },
      { type: "webhook", command: owned.command },
    ];
    const original = config([owned, { ...owned, command: "node '/opt/tokenjuice/dist/cli/main.js' openhands-post-tool-use" }, ...custom]);
    original.post_tool_use.push({ matcher: "read", hooks: [] });
    await writeConfig(path, original);
    await writeFile(`${path}.bak`, "keep backup");
    await writeFile(`${path}.tmp`, "keep sidecar");
    const doctor = await doctorOpenHandsHook();
    expect(doctor.status).toBe("broken");
    expect(doctor.fixCommand).toBe("tokenjuice uninstall openhands");
    expect((await uninstallOpenHandsHook()).removed).toBe(2);
    original.post_tool_use[0]!.hooks = custom;
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(original);
    expect((await stat(path)).mode & 0o777).toBe(0o640);
    expect(await readFile(`${path}.bak`, "utf8")).toBe("keep backup");
    expect(await readFile(`${path}.tmp`, "utf8")).toBe("keep sidecar");
    expect((await doctorOpenHandsHook()).status).toBe("disabled");
    expect((await uninstallOpenHandsHook()).removed).toBe(0);
  });

  it("cleans both supported event formats and keeps project overrides scoped", async () => {
    const { home, path } = await fixture();
    await writeConfig(path, config([owned]));
    const project = join(home, "project");
    const projectPath = join(project, ".openhands", "hooks.json");
    await writeConfig(projectPath, {
      version: 1,
      hooks: { PostToolUse: [{ matcher: "terminal", hooks: [{ command: owned.command }] }], Stop: [] },
    });
    process.env.OPENHANDS_PROJECT_DIR = project;
    expect((await uninstallOpenHandsHook()).hooksPath).toBe(projectPath);
    expect(JSON.parse(await readFile(projectPath, "utf8"))).toEqual({ version: 1, hooks: { PostToolUse: [], Stop: [] } });
    expect((await doctorOpenHandsHook(path)).status).toBe("broken");
    expect((await doctorOpenHandsHook(undefined, { projectDir: home })).status).toBe("broken");
    expect((await uninstallOpenHandsHook(undefined, { projectDir: home })).removed).toBe(1);
  });

  it("preserves targets behind file, directory and project symlinks", async () => {
    const { home, path } = await fixture();
    const outside = join(home, "outside");
    await writeConfig(join(outside, "hooks.json"), config([owned]));
    await mkdir(dirname(path));
    await symlink(join(outside, "hooks.json"), path);
    await expect(uninstallOpenHandsHook()).rejects.toThrow("symlink");
    expect((await doctorOpenHandsHook()).status).toBe("broken");
    await rm(dirname(path), { recursive: true });
    await symlink(outside, dirname(path));
    await expect(uninstallOpenHandsHook()).rejects.toThrow("symlink");
    const project = join(home, "project-link");
    await symlink(outside, project);
    process.env.OPENHANDS_PROJECT_DIR = project;
    await expect(uninstallOpenHandsHook()).rejects.toThrow("symlink");
    expect(JSON.parse(await readFile(join(outside, "hooks.json"), "utf8"))).toEqual(config([owned]));
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
    await expect(uninstallOpenHandsHook()).rejects.toThrow("settings changed");
    expect(await readFile(path, "utf8")).toBe("concurrent user edit");
    await expect(uninstallOpenHandsHook()).rejects.toThrow(/JSON|Unexpected|token/u);
    expect(await readFile(path, "utf8")).toBe("concurrent user edit");
  });

  it("keeps stale runtime hooks silent for all payloads", async () => {
    let output = "";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => { output += chunk.toString(); return true; });
    for (const payload of ["{bad", "null", JSON.stringify({ event_type: "post_tool_use", tool_name: "terminal", tool_input: { command: "ls -la" }, tool_response: { output: "noisy output\n".repeat(80), exit_code: 0 } })]) {
      expect(await runOpenHandsPostToolUseHook(payload)).toBe(0);
    }
    spy.mockRestore();
    expect(output).toBe("{}\n{}\n{}\n");
  });
});
