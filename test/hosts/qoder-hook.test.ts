import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runQoderPostToolUseHook } from "../../src/index.js";

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
const payload = {
  hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "git status" },
  tool_response: { stdout, stderr: "retained warning\n", exitCode: 0, extra: { value: 7 } },
};

async function invoke(value: unknown, raw = false) {
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  expect(await runQoderPostToolUseHook(raw ? String(value) : JSON.stringify(value))).toBe(0);
  expect(output.split("\n")).toHaveLength(2);
  return JSON.parse(output);
}

describe("Qoder PostToolUse replacement", () => {
  it("returns a string envelope while preserving stderr, exit status and unknown fields", async () => {
    const output = await invoke(payload);
    expect(output.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(typeof output.hookSpecificOutput.updatedToolOutput).toBe("string");
    const replacement = JSON.parse(output.hookSpecificOutput.updatedToolOutput);
    expect(replacement).toEqual({ ...payload.tool_response, stdout: expect.any(String) });
    expect(replacement.stdout.length).toBeLessThan(stdout.length);
    expect(replacement.stdout).toContain("src/file-0.ts");
    expect(output.hookSpecificOutput.additionalContext).toBeUndefined();
  });

  it.each([null, [], 7, "text", {},
    { ...payload, hook_event_name: "PostToolUseFailure" },
    { ...payload, tool_name: "Read" },
    { ...payload, tool_response: stdout },
    { ...payload, tool_response: { ...payload.tool_response, exitCode: 1 } },
    { ...payload, tool_response: { ...payload.tool_response, interrupted: true } },
    { ...payload, tool_response: { ...payload.tool_response, kind: "backgrounded", taskId: "job" } },
    { ...payload, tool_response: { stdout, exitCode: 0 } },
    { ...payload, tool_response: { ...payload.tool_response, stdout: "short output" } },
  ])("keeps unsupported or unsafe payloads: %j", async (value) => {
    expect(await invoke(value)).toEqual({});
  });

  it.each(["tokenjuice wrap --raw -- git status", "env X=1 tokenjuice wrap --raw -- git status",
    "node /opt/tokenjuice/dist/cli/main.js wrap --raw -- git status",
    "cat exact-file.txt"])("preserves raw/inspection semantics: %s", async (command) => {
    expect(await invoke({ ...payload, tool_input: { command } })).toEqual({});
  });

  it("fails open for malformed JSON", async () => {
    expect(await invoke("{broken", true)).toEqual({});
  });
});
