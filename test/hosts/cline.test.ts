import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { doctorClineHook, installClineHook, runClinePreToolUseHook, runClinePostToolUseHook, uninstallClineHook } from "../../src/index.js";
import { rewriteClineInput } from "../../src/core/integrations/rewrite-cline-input.js";

const directories: string[] = [];
const keys = ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "CURSOR_HOME", "PI_CODING_AGENT_DIR", "OPENCODE_CONFIG_DIR", "TOKENJUICE_CURSOR_SHELL", "SHELL", "HOME", "PATH", "CLINE_HOOKS_DIR", "TOKENJUICE_STATS"] as const;
const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;

afterEach(async () => {
  Object.defineProperty(process, "platform", platform);
  for (const key of keys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "tokenjuice-cline-test-"));
  directories.push(home);
  process.env.HOME = home;
  delete process.env.CLINE_HOOKS_DIR;
  process.env.SHELL = "/bin/bash";
  const binaryPath = join(home, "tokenjuice");
  await writeFile(binaryPath, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
  return { home, options: { local: true, binaryPath } };
}

async function capture(fn: () => Promise<number>) {
  let output = "";
  const write = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => { output += chunk.toString(); return true; }) as typeof write;
  try { expect(await fn()).toBe(0); return JSON.parse(output); } finally { process.stdout.write = write; }
}

const event = (commands: unknown) => ({ hookName: "tool_call", tool_call: { name: "run_commands", input: { commands } } });
const legacy = (command: string) => `#!/usr/bin/env bash\nset -euo pipefail\nexec ${command}\n`;

describe("native Cline pre-tool wrapping", () => {
  it("installs a discoverable executable hook and reports its lifecycle", async () => {
    const { home, options } = await fixture();
    const installed = await installClineHook(undefined, options);
    expect(installed.hookPath).toBe(join(home, ".cline", "hooks", "PreToolUse"));
    expect(await readFile(installed.hookPath, "utf8")).toContain("cline-pre-tool-use --wrap-launcher");
    expect((await stat(installed.hookPath)).mode & 0o111).not.toBe(0);
    expect((await doctorClineHook(undefined, options)).status).toBe("ok");
    expect((await uninstallClineHook()).removed).toBe(true);
    expect((await uninstallClineHook()).removed).toBe(false);
    expect((await doctorClineHook(undefined, options)).status).toBe("disabled");
  });

  it("migrates only a recognized legacy script and honors CLINE_HOOKS_DIR", async () => {
    const { home, options } = await fixture();
    const hooks = join(home, "hooks");
    process.env.CLINE_HOOKS_DIR = hooks;
    const old = join(hooks, "tokenjuice-post-tool-use");
    await mkdir(hooks);
    await writeFile(old, legacy(`${options.binaryPath} cline-post-tool-use`));
    expect((await doctorClineHook(undefined, options)).status).toBe("broken");
    const installed = await installClineHook(undefined, options);
    expect(installed.hookPath).toBe(join(hooks, "PreToolUse"));
    await expect(readFile(old)).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(old, legacy("echo cline-post-tool-use"));
    await installClineHook(undefined, options);
    await uninstallClineHook();
    expect(await readFile(old, "utf8")).toBe(legacy("echo cline-post-tool-use"));
  });

  it("preserves unmanaged hooks and rejects undiscoverable filenames before writing", async () => {
    const { home, options } = await fixture();
    const path = join(home, "PreToolUse");
    await writeFile(path, "#!/usr/bin/env bash\necho custom\n");
    await expect(installClineHook(path, options)).rejects.toThrow("not managed by tokenjuice");
    expect((await uninstallClineHook(path)).removed).toBe(false);
    expect(await readFile(path, "utf8")).toContain("echo custom");
    await expect(installClineHook(join(home, "tokenjuice-post-tool-use"), options)).rejects.toThrow("Cline discovers hooks named");
    await expect(stat(join(home, "tokenjuice-post-tool-use"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves hook targets behind symlinks", async () => {
    const { home, options } = await fixture();
    const target = join(home, "target");
    await writeFile(target, "custom target");
    const path = join(home, "PreToolUse");
    await symlink(target, path);
    await expect(installClineHook(path, options)).rejects.toThrow("symlink");
    await expect(uninstallClineHook(path)).rejects.toThrow("symlink");
    expect((await doctorClineHook(path, options)).status).toBe("broken");
    expect(await readFile(target, "utf8")).toBe("custom target");
    const linked = join(home, "linked");
    await symlink(dirname(path), linked);
    await expect(installClineHook(join(linked, "PreToolUse"), options)).rejects.toThrow("symlink");
  });

  it("rewrites a batch while preserving input fields and explicit raw wrapping", async () => {
    await fixture();
    const payload = event(["find src -type f", "tokenjuice wrap --raw -- cat exact.txt"]);
    payload.tool_call.input = { ...payload.tool_call.input, future: "preserved" } as typeof payload.tool_call.input;
    const result = await capture(() => runClinePreToolUseHook(JSON.stringify(payload), "/tool/main.js"));
    expect(result.overrideInput.commands[0]).toContain("wrap --keep-failures --source cline -- /bin/bash -lc 'find src -type f'");
    expect(result.overrideInput.commands[1]).toBe("tokenjuice wrap --raw -- cat exact.txt");
    expect(result.overrideInput.future).toBe("preserved");
    expect(await capture(() => runClinePreToolUseHook(JSON.stringify(event(["tokenjuice wrap -- cat exact.txt"]))))).toEqual({});
  });

  it.each([null, [], {}, event([]), event(["find .", 5]), event([""]), { ...event(["find ."]), hookName: "tool_result" }, { hookName: "tool_call", tool_call: { name: "read_files", input: { commands: ["find ."] } } }])("ignores invalid or unrelated input: %j", payload => {
    expect(rewriteClineInput(payload, command => `wrapped ${command}`)).toBeUndefined();
  });

  it("keeps stale additive hooks silent and passes malformed input through", async () => {
    expect(await capture(() => runClinePostToolUseHook("anything"))).toEqual({ cancel: false, contextModification: "", errorMessage: "" });
    expect(await capture(() => runClinePreToolUseHook("{bad"))).toEqual({});
  });

  it("rejects native Windows installation before creating files", async () => {
    const { home, options } = await fixture();
    Object.defineProperty(process, "platform", { value: "win32" });
    await expect(installClineHook(undefined, options)).rejects.toThrow("requires a POSIX shell");
    await expect(stat(join(home, ".cline"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await capture(() => runClinePreToolUseHook(JSON.stringify(event(["find ."]))))).toEqual({});
  });
});
