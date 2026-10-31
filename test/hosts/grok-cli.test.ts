import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorGrokCliHook,
  installGrokCliHook,
  runGrokCliPostToolUseHook,
  uninstallGrokCliHook,
} from "../../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-grok-cli-test-"));
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

describe("retired grok-cli hooks", () => {
  it("refuses installation without creating or changing config", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "user-settings.json");
    await expect(installGrokCliHook(settingsPath)).rejects.toThrow(/do not replace tool output/u);
    await expect(readFile(settingsPath)).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(settingsPath, '{"apiKey":"fixture-no-secret"}');
    await expect(installGrokCliHook(settingsPath)).rejects.toThrow(/tokenjuice wrap/u);
    await expect(readFile(settingsPath, "utf8")).resolves.toBe('{"apiKey":"fixture-no-secret"}');
  });

  it("finds retired hooks and removes only their commands from mixed groups", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "user-settings.json");
    const keep = { type: "command", command: 'echo "grok-cli-post-tool-use"' };
    const unrelated = { matcher: "read_file", hooks: [{ type: "command", command: "other-hook" }] };
    await writeFile(settingsPath, JSON.stringify({ defaultModel: "keep", hooks: {
      PostToolUse: [unrelated, { matcher: "bash", hooks: [keep, { type: "command", command: "tokenjuice grok-cli-post-tool-use" }] }],
      Stop: [{ hooks: [{ command: "other-hook" }] }],
    } }));
    expect((await doctorGrokCliHook(settingsPath)).status).toBe("broken");
    expect((await doctorGrokCliHook(settingsPath)).fixCommand).toBe("tokenjuice uninstall grok-cli");
    expect(await uninstallGrokCliHook(settingsPath)).toEqual({ settingsPath, removed: 1 });
    expect(JSON.parse(await readFile(settingsPath, "utf8"))).toEqual({ defaultModel: "keep", hooks: {
      PostToolUse: [unrelated, { matcher: "bash", hooks: [keep] }], Stop: [{ hooks: [{ command: "other-hook" }] }],
    } });
    expect((await doctorGrokCliHook(settingsPath)).status).toBe("disabled");
    expect((await uninstallGrokCliHook(settingsPath)).removed).toBe(0);
  });

  it("removes old Node-launched hooks and preserves malformed commands", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "user-settings.json");
    const malformed = { command: "tokenjuice 'grok-cli-post-tool-use" };
    await writeFile(settingsPath, JSON.stringify({ hooks: { PostToolUse: [{ hooks: [
      { command: "node '/opt/tokenjuice/dist/cli/main.js' grok-cli-post-tool-use" }, malformed,
    ] }] } }));
    expect((await uninstallGrokCliHook(settingsPath)).removed).toBe(1);
    expect(JSON.parse(await readFile(settingsPath, "utf8")).hooks.PostToolUse[0].hooks).toEqual([malformed]);
  });

  it("keeps malformed JSON unchanged during cleanup", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, "user-settings.json");
    await writeFile(settingsPath, "{malformed");
    await expect(uninstallGrokCliHook(settingsPath)).rejects.toThrow(/JSON|property|Unexpected/u);
    await expect(readFile(settingsPath, "utf8")).resolves.toBe("{malformed");
  });

  it("keeps stale hook commands inert for noisy successful output and malformed input", async () => {
    const payload = JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "bash",
      tool_input: { command: "find src -type f" }, tool_output: { success: true,
        output: Array.from({ length: 80 }, (_, i) => `src/file-${i}.ts`).join("\n") } });
    for (const input of [payload, "null", "[]", "7", "true", "{malformed"]) {
      expect(await captureStdout(() => runGrokCliPostToolUseHook(input))).toEqual({ code: 0, output: "{}\n" });
    }
  });
});
