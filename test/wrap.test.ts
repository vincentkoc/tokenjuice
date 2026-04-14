import { describe, expect, it } from "vitest";

import { runWrappedCommand } from "../src/index.js";

describe("runWrappedCommand", () => {
  it("preserves the child exit code and produces a compact result", async () => {
    const wrapped = await runWrappedCommand([
      "node",
      "-e",
      "console.log('hello'); console.error('warning: noisy'); process.exit(3)",
    ]);

    expect(wrapped.exitCode).toBe(3);
    expect(wrapped.result.inlineText).toContain("exit 3");
    expect(wrapped.stderr).toContain("warning: noisy");
  });
});
