import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL("../../scripts/analyze-codex-logs.mjs", import.meta.url));

describe("analyze-codex-logs", () => {
  it("prints help without reading Codex logs", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, "--help"]);

    expect(stderr).toBe("");
    expect(stdout).toContain("Usage: node scripts/analyze-codex-logs.mjs [options]");
    expect(stdout).toContain("--codex-home <path>");
    expect(stdout).toContain("--format <text|json>");
  });
});
