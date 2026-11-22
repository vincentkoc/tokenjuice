import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as reducer from "../../src/core/integrations/compact-bash-result.js";
import plugin, { onOpenCodeV2ToolResult } from "../../src/hosts/opencode/v2/runtime.js";

beforeEach(() => { vi.stubEnv("TOKENJUICE_STATS", "off"); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const stdout = ["On branch main", "Changes not staged for commit:",
  ...Array.from({ length: 40 }, (_, i) => `\tmodified:   src/file-${i}.ts`),
  "no changes added to commit"].join("\n");
function fixture() {
  return { tool: "shell", status: "completed", input: { command: "git status" },
    result: { output: { output: stdout, status: "completed", exit: 0, truncated: false, extra: 7 },
      content: [{ type: "text", text: stdout, extra: 9 }], metadata: { status: "completed", exit: 0, truncated: false }, extra: 11 } };
}

describe("OpenCode V2 tool result plugin", () => {
  it("registers the V2 object API and disposes its hook", async () => {
    const dispose = vi.fn<() => Promise<void>>(async () => {});
    const hook = vi.fn<Parameters<typeof plugin.setup>[0]["tool"]["hook"]>(async () => ({ dispose }));
    const cleanup = await plugin.setup({ tool: { hook } });
    expect(plugin.id).toBe("tokenjuice");
    expect(hook).toHaveBeenCalledWith("execute.after", onOpenCodeV2ToolResult);
    await cleanup();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("replaces matching text and structured output coherently, preserving metadata", async () => {
    const event = fixture();
    const original = event.result;
    const snapshot = structuredClone(original);
    await onOpenCodeV2ToolResult(event);
    expect(event.result).not.toBe(original);
    expect(event.result.output.output.length).toBeLessThan(stdout.length);
    expect(event.result.content[0]?.text).toBe(event.result.output.output);
    expect(event.result.output.extra).toBe(7);
    expect(event.result.content[0]?.extra).toBe(9);
    expect(event.result.extra).toBe(11);
    expect(event.result.metadata).toBe(original.metadata);
    expect(original).toEqual(snapshot);
  });

  it.each([{ exit: 7 }, { signal: "SIGTERM" }, { timeout: true }, { truncated: true },
    { status: "running" }, { shellID: "background-id" }, { exit: undefined },
  ])("keeps unsuccessful, truncated and background output: %j", async (patch) => {
    const event = fixture();
    const original = { ...event.result, output: { ...event.result.output, ...patch } };
    const input = { ...event, result: original };
    await onOpenCodeV2ToolResult(input);
    expect(input.result).toBe(original);
  });

  it.each(["tokenjuice wrap --raw -- git status", "env X=1 tokenjuice wrap --raw -- git status",
    "node /opt/tokenjuice/dist/cli/main.js wrap --raw -- git status", "cat exact-file.txt", "git ls-files",
  ])("keeps wrappers, exact reads and inventories without a trusted cwd: %s", async (command) => {
    const event = fixture();
    event.input.command = command;
    const original = event.result;
    await onOpenCodeV2ToolResult(event);
    expect(event.result).toBe(original);
  });

  it("preserves error events, unrelated tools, background inputs and altered content", async () => {
    const event = fixture();
    const inputs = [null, [], { ...event, tool: "bash" }, { ...event, status: "error", error: { message: "denied" } },
      { ...event, input: { command: "git status", background: true } },
      { ...event, result: { ...event.result, content: [{ type: "text", text: "policy notice" }] } },
      { ...event, result: { ...event.result, content: [...event.result.content, { type: "image" }] } },
      { ...event, result: { ...event.result, metadata: { truncated: true } } }];
    for (const input of inputs) {
      const snapshot = structuredClone(input);
      await onOpenCodeV2ToolResult(input);
      expect(input).toEqual(snapshot);
    }
  });

  it("contains compaction failures without mutating results", async () => {
    const event = fixture();
    const original = event.result;
    vi.spyOn(reducer, "compactBashResult").mockRejectedValueOnce(new Error("compactor failed"));
    await onOpenCodeV2ToolResult(event);
    expect(event.result).toBe(original);
  });
});
