import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as reducer from "../../src/core/integrations/compact-bash-result.js";
import { apply, inject, name, onDeepSeekPostExecute } from "../../src/hosts/deepseek-harness/runtime.js";

const originalStats = process.env.TOKENJUICE_STATS;
beforeEach(() => { process.env.TOKENJUICE_STATS = "off"; });
afterEach(() => {
  if (originalStats === undefined) delete process.env.TOKENJUICE_STATS;
  else process.env.TOKENJUICE_STATS = originalStats;
  vi.restoreAllMocks();
});

const stdout = ["On branch main", "Changes not staged for commit:",
  ...Array.from({ length: 40 }, (_, i) => `\tmodified:   src/file-${i}.ts`),
  "no changes added to commit"].join("\n");
function fixture() {
  const controller = new AbortController();
  const execution = { name: "bash", arguments: { command: "git status" }, signal: controller.signal };
  const value = { kind: "foreground", cwd: "/repo", exitCode: 0, signal: null, timedOut: false,
    aborted: false, timeoutMs: 1000, stdout: { text: stdout, truncated: false },
    stderr: { text: "retained warning\n", truncated: false } };
  const result = { isError: false, value, content: [{ type: "text", text: `${stdout}\n[stderr]\nretained warning\n`, extra: 7 }] };
  return { execution, result, controller };
}

describe("DeepSeek Harness native post-execute plugin", () => {
  it("registers a tools-dependent Cordis waterfall", () => {
    const on = vi.fn();
    apply({ on });
    expect(name).toBe("tokenjuice");
    expect(inject).toEqual(["tools"]);
    expect(on).toHaveBeenCalledWith("tools/post-execute", onDeepSeekPostExecute);
  });

  it("replaces only native content and retains downstream context and stream boundaries", async () => {
    const { execution, result } = fixture();
    const original = structuredClone(result);
    const decision = { kind: "accept", additionalContexts: [{ role: "user", content: [] }] };
    const next = vi.fn(async () => decision);
    const replacement = await onDeepSeekPostExecute(execution, result, next) as { content: Array<{ text: string; extra: number }>; additionalContexts: unknown };
    expect(next).toHaveBeenCalledOnce();
    expect(replacement.additionalContexts).toBe(decision.additionalContexts);
    expect(replacement.content[0].text.length).toBeLessThan(result.content[0].text.length);
    expect(replacement.content[0].text).toContain("src/file-0.ts");
    expect(replacement.content[0].text).toContain("[stderr]\nretained warning\n");
    expect(replacement.content[0].extra).toBe(7);
    expect(replacement).not.toHaveProperty("value");
    expect(result).toEqual(original);
  });

  it.each([{ kind: "block", feedback: [{ type: "text", text: "denied" }] },
    { kind: "accept", value: { policy: true } }, { kind: "accept", content: [] },
  ])("preserves downstream decisions: %j", async (decision) => {
    const { execution, result } = fixture();
    expect(await onDeepSeekPostExecute(execution, result, async () => decision)).toBe(decision);
  });

  it("propagates downstream failures but contains compactor failures", async () => {
    const { execution, result } = fixture();
    await expect(onDeepSeekPostExecute(execution, result, async () => { throw new Error("policy failed"); })).rejects.toThrow("policy failed");
    vi.spyOn(reducer, "compactBashResult").mockRejectedValueOnce(new Error("compactor failed"));
    const decision = { kind: "accept" };
    expect(await onDeepSeekPostExecute(execution, result, async () => decision)).toBe(decision);
  });

  it.each([
    { kind: "background" }, { kind: "promoted" }, { exitCode: 7 }, { signal: "SIGTERM" },
    { timedOut: true }, { aborted: true }, { stopped: "user request" },
    { stdout: { text: stdout, truncated: true, spillPath: "/output" } },
    { sandbox: { mode: "workspace", denied: true } }, { sandbox: { runnerFailed: true } },
  ])("keeps unsafe or non-foreground outcomes: %j", async (patch) => {
    const { execution, result } = fixture();
    const decision = { kind: "accept" };
    expect(await onDeepSeekPostExecute(execution, { ...result, value: { ...result.value, ...patch } }, async () => decision)).toBe(decision);
  });

  it.each(["tokenjuice wrap --raw -- git status", "env X=1 tokenjuice wrap --raw -- git status",
    "node /opt/tokenjuice/dist/cli/main.js wrap --raw -- git status", "cat exact-file.txt",
  ])("keeps explicit wrappers and exact reads: %s", async (command) => {
    const { execution, result } = fixture();
    execution.arguments.command = command;
    const decision = { kind: "accept" };
    expect(await onDeepSeekPostExecute(execution, result, async () => decision)).toBe(decision);
  });

  it("keeps PTC sub-dispatches, infrastructure errors and altered/mixed content", async () => {
    const { execution, result } = fixture();
    const decision = { kind: "accept" };
    for (const [exec, outcome] of [
      [{ ...execution, parent: {} }, result], [execution, { ...result, isError: true }],
      [execution, { ...result, content: [{ type: "text", text: "policy notice" }] }],
      [execution, { ...result, content: [...result.content, { type: "image" }] }],
    ]) expect(await onDeepSeekPostExecute(exec, outcome, async () => decision)).toBe(decision);
  });

  it("honors cancellation before and after asynchronous compaction", async () => {
    const { execution, result, controller } = fixture();
    const decision = { kind: "accept" };
    const compact = reducer.compactBashResult;
    vi.spyOn(reducer, "compactBashResult").mockImplementationOnce(async (input) => {
      const outcome = await compact(input);
      controller.abort();
      return outcome;
    });
    expect(await onDeepSeekPostExecute(execution, result, async () => decision)).toBe(decision);
    expect(await onDeepSeekPostExecute(execution, result, async () => decision)).toBe(decision);
  });
});
