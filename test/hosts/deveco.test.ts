import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as reducer from "../../src/core/integrations/compact-bash-result.js";
import plugin from "../../src/hosts/deveco/extension/runtime.js";

const stdout = ["On branch main", "Changes not staged for commit:", "", ...Array.from({ length: 80 }, (_, i) => `\tmodified:   src/file-${i}.ts`)].join("\n");
const input = { tool: "bash", args: { command: "git status" } };
const fixture = () => ({ title: "status", output: stdout, metadata: { exit: 0, truncated: false, output: "native preview", custom: true } });
beforeEach(() => { vi.stubEnv("TOKENJUICE_STATS", "off"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("DevEco Code native plugin", () => {
  it("replaces complete successful Bash output while preserving native fields", async () => {
    const hooks = await plugin();
    const output = fixture();
    await hooks["tool.execute.after"](input, output);
    expect(output.output.length).toBeLessThan(stdout.length);
    expect(output.title).toBe("status");
    expect(output.metadata).toMatchObject({ exit: 0, truncated: false, output: "native preview", custom: true });
    expect(output.metadata).toHaveProperty("tokenjuice");
  });

  it.each([{ exit: 7 }, { exit: null }, { exit: undefined }, { truncated: true }, { truncated: undefined }])("preserves failed, unfinished, unknown or truncated results: %j", async (patch) => {
    const output = { ...fixture(), metadata: { ...fixture().metadata, ...patch } };
    const before = structuredClone(output);
    await (await plugin())["tool.execute.after"](input, output);
    expect(output).toEqual(before);
  });

  it.each(["cat exact-file.txt", "tokenjuice wrap --raw -- git status"])("preserves exact/raw commands: %s", async (command) => {
    const output = fixture();
    const before = structuredClone(output);
    await (await plugin())["tool.execute.after"]({ ...input, args: { command } }, output);
    expect(output).toEqual(before);
  });

  it("preserves unrelated tools, malformed arguments and missing metadata", async () => {
    const hooks = await plugin();
    for (const changed of [{ ...input, tool: "read" }, { ...input, args: null }]) {
      const output = fixture();
      await hooks["tool.execute.after"](changed, output);
      expect(output).toEqual(fixture());
    }
    const output = { output: stdout };
    await hooks["tool.execute.after"](input, output);
    expect(output).toEqual({ output: stdout });
  });

  it("fails open when compaction throws", async () => {
    vi.spyOn(reducer, "compactBashResult").mockRejectedValueOnce(new Error("compaction failed"));
    const output = fixture();
    await (await plugin())["tool.execute.after"](input, output);
    expect(output).toEqual(fixture());
  });
});
