import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMiniMaxCodePreToolUseHook } from "../../src/hosts/minimax-code/index.js";
import { parseWrappedCommand } from "./shared/wrap-command.js";

const originalPath = process.env.PATH;
const originalPlatform = process.platform;
let output = "";

beforeEach(() => {
  process.env.PATH = "/usr/bin:/bin";
  Object.defineProperty(process, "platform", { value: "linux", configurable: true });
  output = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output += String(chunk);
    return true;
  });
});

afterEach(() => {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  vi.restoreAllMocks();
});

function payload(command: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "bash", tool_input: { command, ...extra } });
}

describe("MiniMax Code native pre-tool plugin", () => {
  it("preserves native input fields and leaves permission decisions to the host", async () => {
    await expect(runMiniMaxCodePreToolUseHook(payload("git status", { timeout: 17, description: "status" }), "/opt/tokenjuice"))
      .resolves.toBe(0);
    const response = JSON.parse(output);
    expect(response).toEqual({ hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: { command: expect.any(String), timeout: 17, description: "status" },
    } });
    const wrapped = parseWrappedCommand(response.hookSpecificOutput.updatedInput.command);
    expect(wrapped).toMatchObject({ launcher: ["/opt/tokenjuice"], inner: "git status", shellFlag: "-lc", wrapDepth: 1 });
    expect(response.hookSpecificOutput.updatedInput.command).toContain("--keep-failures");
    expect(response.hookSpecificOutput.updatedInput.command).toContain("--source 'minimax-code'");
  });

  it.each([
    "not json", "null", "[]", "{}",
    JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "bash", tool_input: { command: "git status" } }),
    JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git status" } }),
    JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "read", tool_input: { command: "git status" } }),
    JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "bash", tool_input: null }),
    payload(""), payload("   "), payload("git status", { run_in_background: true }),
    payload("tokenjuice wrap --raw -- git status"),
    payload("/opt/tokenjuice wrap -- git status"),
    payload("node /opt/tokenjuice/dist/cli/main.js wrap --raw -- git status"),
  ])("leaves unsupported or already wrapped input unchanged: %s", async (input) => {
    expect(await runMiniMaxCodePreToolUseHook(input)).toBe(0);
    expect(output).toBe("");
  });

  it("fails open when Bash is unavailable", async () => {
    process.env.PATH = "/tokenjuice-test-missing";
    expect(await runMiniMaxCodePreToolUseHook(payload("git status"))).toBe(0);
    expect(output).toBe("");
  });

  it("leaves native Windows tools unchanged until their shell contract is qualified", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    expect(await runMiniMaxCodePreToolUseHook(payload("git status"))).toBe(0);
    expect(output).toBe("");
  });
});
