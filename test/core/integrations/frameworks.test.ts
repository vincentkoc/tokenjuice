import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compactFrameworkResult } from "../../../src/core/integrations/compact-framework-result.js";
import { createCopilotSdkHooks } from "../../../src/hosts/copilot-sdk/index.js";
import { createMastraProcessor } from "../../../src/hosts/mastra/index.js";

const output = Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`).join("\n");
const execution = { command: "find fixtures -type f", output, exitCode: 0 };

describe("native framework adapters", () => {
  beforeEach(() => vi.stubEnv("TOKENJUICE_STATS", "off"));
  afterEach(() => vi.unstubAllEnvs());

  it.each(["hermes", "copilot-sdk", "langchain", "mastra", "fastmcp"] as const)("shares inventory compaction for %s", async source => {
    const text = await compactFrameworkResult(source, execution);
    expect(text).toContain("80 matches");
    expect(text!.length).toBeLessThan(output.length);
  });

  it.each([
    ["null", null], ["array", []], ["empty", {}],
    ["missing exit", { ...execution, exitCode: undefined }], ["failed", { ...execution, exitCode: 7 }],
    ["string exit", { ...execution, exitCode: "0" }], ["background", { ...execution, background: true }],
    ["truncated", { ...execution, truncated: true }], ["invalid cwd", { ...execution, cwd: 3 }],
    ["exact", { ...execution, command: "cat exact.txt" }],
    ["raw", { ...execution, command: "tokenjuice wrap --raw -- find fixtures -type f" }],
  ])("preserves unsafe or exact results: %s", async (_name, value) => {
    expect(await compactFrameworkResult("langchain", value)).toBeUndefined();
  });

  it("preserves Copilot completion status and structured metadata", async () => {
    const toolResult = { resultType: "success", textResultForLlm: `${output}\n<exited with exit code 0>`, sessionLog: "native log", toolTelemetry: { native: true } };
    const hooks = createCopilotSdkHooks();
    const replacement = await hooks.onPostToolUse({ toolName: "bash", toolArgs: { command: execution.command }, toolResult });
    expect(replacement?.modifiedResult).toMatchObject({ resultType: "success", sessionLog: "native log", toolTelemetry: { native: true } });
    expect(replacement?.modifiedResult.textResultForLlm).toContain("80 matches");
    expect(replacement?.modifiedResult.textResultForLlm).toMatch(/\n<exited with exit code 0>$/u);
    expect(toolResult.textResultForLlm).toContain(output);
    for (const text of [output, `${output}\n<exited with exit code 7>`]) {
      expect(await hooks.onPostToolUse({ toolName: "bash", toolArgs: { command: execution.command }, toolResult: { ...toolResult, textResultForLlm: text } })).toBeUndefined();
    }
  });

  it("updates Mastra's native invocation without mutating the original result", async () => {
    const updateToolInvocation = vi.fn();
    const result = { ...execution, metadata: { native: true } };
    const input = { toolName: "bash", toolCallId: "call-1", args: { command: execution.command }, result, messageList: { updateToolInvocation } };
    const processor = createMastraProcessor({ decode: () => result, replace: (original, text) => ({ ...(original as object), output: text }) });
    await processor.processToolResult(input);
    expect(updateToolInvocation).toHaveBeenCalledWith({ type: "tool-invocation", toolInvocation: {
      state: "result", toolCallId: "call-1", toolName: "bash", args: input.args,
      result: { ...result, output: expect.stringContaining("80 matches") },
    } });
    expect(result.output).toBe(output);
    updateToolInvocation.mockImplementation(() => { throw new Error("host state failed"); });
    await expect(processor.processToolResult(input)).rejects.toThrow("host state failed");
  });

  it("keeps Mastra results when mapping or execution cannot be trusted", async () => {
    const updateToolInvocation = vi.fn();
    const input = { toolName: "bash", toolCallId: "call-1", args: {}, result: execution, messageList: { updateToolInvocation } };
    for (const decode of [() => undefined, () => ({ ...execution, exitCode: 1 }), () => { throw new Error("bad schema"); }]) {
      await createMastraProcessor({ decode, replace: () => { throw new Error("must not run"); } }).processToolResult(input);
    }
    expect(updateToolInvocation).not.toHaveBeenCalled();
  });
});
