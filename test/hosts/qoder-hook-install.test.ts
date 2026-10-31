import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { doctorQoderHook, installQoderHook, uninstallQoderHook } from "../../src/hosts/qoder/hook-install.js";

let directory: string;
let path: string;
let options: { local: boolean; binaryPath: string };
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "tokenjuice-qoder-hook-"));
  path = join(directory, "settings.json");
  const launcher = join(directory, "tokenjuice");
  await writeFile(launcher, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  options = { local: true, binaryPath: launcher };
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
async function read() { return JSON.parse(await readFile(path, "utf8")); }

describe("Qoder native hook lifecycle", () => {
  it("installs a synchronous Bash replacement hook and is idempotent", async () => {
    expect((await doctorQoderHook(path, options)).status).toBe("disabled");
    const installed = await installQoderHook(path, options);
    expect((await read()).hooks.PostToolUse).toEqual([{ matcher: "Bash", hooks: [{
      type: "command", command: installed.command, timeout: 10, async: false,
    }] }]);
    expect((await doctorQoderHook(path, options)).status).toBe("ok");
    expect((await installQoderHook(path, options)).backupPath).toBeUndefined();
    expect((await readdir(directory)).some((name) => name.includes(".bak"))).toBe(false);
    expect((await uninstallQoderHook(path)).removed).toBe(1);
    expect((await uninstallQoderHook(path)).removed).toBe(0);
  });

  it("preserves unrelated settings and mixed matcher groups, backing up the original bytes", async () => {
    const original = JSON.stringify({ model: "custom", hooks: { SessionStart: [{ hooks: [{ command: "welcome" }] }],
      PostToolUse: [{ matcher: "*", extra: true, hooks: [
        { type: "command", command: "tokenjuice qoder-post-tool-use" },
        { type: "command", command: "echo qoder-post-tool-use" },
      ] }] } });
    await writeFile(path, original);
    const installed = await installQoderHook(path, options);
    expect(await readFile(installed.backupPath!, "utf8")).toBe(original);
    const config = await read();
    expect(config.model).toBe("custom");
    expect(config.hooks.SessionStart).toEqual([{ hooks: [{ command: "welcome" }] }]);
    expect(config.hooks.PostToolUse[0]).toEqual({ matcher: "*", extra: true,
      hooks: [{ type: "command", command: "echo qoder-post-tool-use" }] });
    expect((await uninstallQoderHook(path)).removed).toBe(1);
    expect((await read()).hooks.PostToolUse).toEqual([config.hooks.PostToolUse[0]]);
    expect(await readFile(installed.backupPath!, "utf8")).toBe(original);
  });

  it.each(["null", "[]", '{"hooks":[]}', '{"hooks":{"PostToolUse":{}}}', "{broken"])("refuses malformed settings without changing bytes: %s", async (text) => {
    await writeFile(path, text);
    await expect(installQoderHook(path, options)).rejects.toThrow();
    await expect(uninstallQoderHook(path)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(text);
  });

  it.each([{ async: true }, { once: true }, { args: [] }, { if: "Bash" }, { asyncRewake: true }])("reports replacement-incompatible hook options: %j", async (extra) => {
    await installQoderHook(path, options);
    const config = await read();
    Object.assign(config.hooks.PostToolUse[0].hooks[0], extra);
    await writeFile(path, JSON.stringify(config));
    expect((await doctorQoderHook(path, options)).status).toBe("broken");
  });

  it("preserves settings symlinks and unrelated hook scopes", async () => {
    const target = join(directory, "real-settings.json");
    await writeFile(target, '{"hooks":{"PreToolUse":[{"matcher":"Read","hooks":[]}]}}');
    await symlink(target, path);
    await installQoderHook(path, options);
    expect(await readFile(target, "utf8")).toContain("qoder-post-tool-use");
    await uninstallQoderHook(path);
    expect((await read()).hooks.PreToolUse).toEqual([{ matcher: "Read", hooks: [] }]);
  });
});
