import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli/main.js";
import { doctorSnowCliHook, installSnowCliHook, uninstallSnowCliHook, runSnowCliAfterToolCallHook } from "../../src/hosts/snow-cli/index.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "tokenjuice-snow-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("SNOW_CONFIG_DIR", join(home, "config"));
  vi.stubEnv("TOKENJUICE_STATS", "off");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

const stdout = ["On branch main", "Changes not staged for commit:",
  ...Array.from({ length: 40 }, (_, i) => `\tmodified:   src/file-${i}.ts`),
  "no changes added to commit"].join("\n");
function payload(command = "git status", changes: Record<string, unknown> = {}) {
  return {
    toolName: "terminal-execute", args: { command, workingDirectory: home, enableAiSummary: false },
    error: null, result: { tool_call_id: "call-1", role: "tool", content: JSON.stringify({
      command, stdout, stderr: "warning\n", exitCode: 0, executedAt: "2026-01-01", extra: { keep: true }, ...changes,
    }) },
  };
}
async function invoke(value: unknown, raw = false) {
  let output = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const exitCode = await runSnowCliAfterToolCallHook(raw ? String(value) : JSON.stringify(value));
  spy.mockRestore();
  return { output, exitCode };
}

describe("Snow CLI native afterToolCall", () => {
  it("uses exit 1 only for smaller replacement content and preserves status fields", async () => {
    const original = payload();
    const { output, exitCode } = await invoke(original);
    expect(exitCode).toBe(1);
    expect(output.length).toBeLessThan(original.result.content.length);
    expect(JSON.parse(output)).toEqual({ ...JSON.parse(original.result.content), stdout: expect.any(String) });
    expect(JSON.parse(output).stdout).toContain("src/file-0.ts");
    expect(original.result.tool_call_id).toBe("call-1");
  });
  it.each([7, 1, -1])("preserves complete failed output for exit %s", async exitCode => {
    expect(await invoke(payload("git status", { exitCode }))).toEqual({ output: "", exitCode: 0 });
  });
  it.each(["cat exact.txt", "tokenjuice wrap --raw -- git status", "env X=1 tokenjuice wrap --raw -- git status"])("keeps exact/raw commands: %s", async command => {
    expect(await invoke(payload(command))).toEqual({ output: "", exitCode: 0 });
  });
  it.each([null, [], 1, {}, { toolName: "filesystem-read" }])("ignores unknown payloads: %j", async value => {
    expect(await invoke(value)).toEqual({ output: "", exitCode: 0 });
  });
  it("keeps malformed JSON, unknown content, background, remote and pre-summarized output", async () => {
    expect(await invoke("{bad", true)).toEqual({ output: "", exitCode: 0 });
    const original = payload();
    for (const value of [
      { ...original, error: {} },
      { ...original, result: { ...original.result, content: "not JSON" } },
      payload("git status", { taskId: "job" }),
      payload("git status", { stdout: "[Command moved to background, execution continues...]" }),
      { ...original, args: { ...original.args, workingDirectory: "ssh://example.test/work" } },
      { ...original, args: { ...original.args, enableAiSummary: true } },
      { ...original, args: { ...original.args, isInteractive: true } },
    ]) expect(await invoke(value)).toEqual({ output: "", exitCode: 0 });
  });
  it("installs idempotently and preserves custom rules in the native file", async () => {
    const options = { local: true, binaryPath: process.execPath };
    expect((await doctorSnowCliHook(undefined, options)).status).toBe("disabled");
    const result = await installSnowCliHook(undefined, options);
    expect(result.settingsPath).toBe(join(home, "config", "hooks", "afterToolCall.json"));
    const config = JSON.parse(await readFile(result.settingsPath, "utf8"));
    const custom = { matcher: "*", hooks: [{ type: "command", command: "custom", enabled: true }] };
    config.afterToolCall.unshift(custom);
    config.extra = true;
    await writeFile(result.settingsPath, JSON.stringify(config));
    await installSnowCliHook(undefined, options);
    await installSnowCliHook(undefined, options);
    expect((await doctorSnowCliHook(undefined, options)).status).toBe("ok");
    expect((await uninstallSnowCliHook()).removed).toBe(1);
    expect(JSON.parse(await readFile(result.settingsPath, "utf8"))).toEqual({ afterToolCall: [custom], extra: true });
  });
  it("accepts native array config and diagnoses disabled or malformed entries", async () => {
    const options = { local: true, binaryPath: process.execPath };
    const result = await installSnowCliHook(undefined, options);
    const config = JSON.parse(await readFile(result.settingsPath, "utf8"));
    await writeFile(result.settingsPath, JSON.stringify(config.afterToolCall));
    expect((await doctorSnowCliHook(undefined, options)).status).toBe("ok");
    config.afterToolCall[0].hooks[0].enabled = false;
    await writeFile(result.settingsPath, JSON.stringify(config));
    expect((await doctorSnowCliHook(undefined, options)).status).toBe("broken");
    await writeFile(result.settingsPath, '{"afterToolCall":false}');
    await expect(installSnowCliHook(undefined, options)).rejects.toThrow("invalid Snow CLI hooks");
    expect((await doctorSnowCliHook(undefined, options)).status).toBe("broken");
  });
  it("registers the JSON install, doctor and uninstall CLI lifecycle", async () => {
    const results: Record<string, unknown>[] = [];
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
      expect(await main([operation, "snow-cli", "--local", "--format", "json"])).toBe(0);
      spy.mockRestore();
      results.push(JSON.parse(output));
    }
    expect(results[0].settingsPath).toBe(join(home, "config", "hooks", "afterToolCall.json"));
    expect(results[1].detectedCommand).toContain("snow-cli-after-tool-call");
    expect(results[2].removed).toBe(1);
  });
});
