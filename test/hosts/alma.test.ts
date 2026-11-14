import { describe, expect, it } from "vitest";
import { activate, createAlmaPreToolUseHandler } from "../../src/hosts/alma/index.js";

const handler = createAlmaPreToolUseHandler({ wrapLauncher: "/opt/tokenjuice", shellPath: "/bin/bash" });

describe("Alma pre-tool plugin", () => {
  it("wraps the effective foreground command and preserves earlier hook changes", async () => {
    const output = { args: { command: "git status --short", timeout: 5000, description: "changed by another hook" } };
    await handler({ tool: "Bash", args: { command: "ignored" } }, output);
    if (process.platform === "win32") {
      expect(output.args.command).toBe("git status --short");
      return;
    }
    expect(output.args.command).toContain("wrap --keep-failures --source 'alma'");
    expect(output.args.command).toContain("'git status --short'");
    expect(output.args.timeout).toBe(5000);
    expect(output.args.description).toBe("changed by another hook");
  });

  it.each([
    { tool: "Read", args: { command: "cat file" } },
    { tool: "Bash", args: { command: "tokenjuice wrap --raw -- ls" } },
    { tool: "Bash", args: { command: "ls", run_in_background: true } },
    { tool: "Bash", args: { command: 12 } },
    { tool: "Bash", args: [] },
    null,
  ])("leaves non-target, raw, background and malformed calls unchanged", async input => {
    const output = {};
    await handler(input, output);
    expect(output).toEqual({});
  });

  it("does not reverse cancellation or replace malformed prior arguments", async () => {
    const cancelled = { cancel: true };
    await handler({ tool: "Bash", args: { command: "ls" } }, cancelled);
    expect(cancelled).toEqual({ cancel: true });
    const malformed = { args: [] };
    await handler({ tool: "Bash", args: { command: "ls" } }, malformed);
    expect(malformed).toEqual({ args: [] });
  });

  it("unregisters its own hook on disposal", async () => {
    let disposed = 0;
    let eventName = "";
    const plugin = await activate({ events: { on(event) { eventName = event; return { dispose() { disposed++; } }; } } });
    expect(eventName).toBe("tool.willExecute");
    plugin.dispose();
    expect(disposed).toBe(1);
  });
});
