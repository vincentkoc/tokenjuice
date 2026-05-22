import { describe, expect, it } from "vitest";

import { buildGithubActionsFailureSummary } from "../../src/core/github-actions-summary.js";

describe("buildGithubActionsFailureSummary", () => {
  it("lists every command when noOmit is enabled", () => {
    const commands = Array.from({ length: 30 }, (_, index) => `echo step-${index}`);
    const rawText = [
      "Run bash ./ci.sh",
      ...commands.map((command) => `  ${command}`),
      "Error: Process completed with exit code 1.",
    ].join("\n");

    const summary = buildGithubActionsFailureSummary(
      {
        toolName: "exec",
        command: "custom-tool --emit-gh-log",
        exitCode: 1,
      },
      rawText,
      true,
    );

    expect(summary?.text).toContain("- echo step-0");
    expect(summary?.text).toContain("- echo step-29");
    expect(summary?.text).not.toContain("commands omitted");
    expect(summary?.compaction).toEqual({
      authoritative: false,
      kinds: ["no-omit-head-tail-passthrough"],
    });
  });
});
