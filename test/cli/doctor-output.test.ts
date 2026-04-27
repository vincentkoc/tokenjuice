import { describe, expect, it } from "vitest";

import { formatHookDoctorReport } from "../../src/cli/doctor-output.js";
import type { HookDoctorReport } from "../../src/index.js";

function disabledReport(path: string): {
  hooksPath: string;
  status: "disabled";
  issues: string[];
  missingPaths: string[];
  fixCommand: string;
} {
  return {
    hooksPath: path,
    status: "disabled",
    issues: ["tokenjuice hook is not installed"],
    missingPaths: [],
    fixCommand: "tokenjuice install codex",
  };
}

describe("formatHookDoctorReport", () => {
  it("omits disabled integrations from text output", () => {
    const report = {
      status: "ok",
      integrations: {
        codex: disabledReport("/tmp/codex/hooks.json"),
        "claude-code": {
          settingsPath: "/tmp/claude/settings.json",
          status: "ok",
          expectedCommand: "tokenjuice claude-code-post-tool-use",
          detectedCommand: "tokenjuice claude-code-post-tool-use",
          issues: [],
          missingPaths: [],
          fixCommand: "tokenjuice install claude-code",
        },
      },
    } as unknown as HookDoctorReport;

    expect(formatHookDoctorReport(report)).toBe([
      "hook health: ok",
      "claude-code:",
      "- path: /tmp/claude/settings.json",
      "- health: ok",
      "- expected command: tokenjuice claude-code-post-tool-use",
      "- configured command: tokenjuice claude-code-post-tool-use",
      "- repair: tokenjuice install claude-code",
      "",
      "available integrations: aider, avante, codex, claude-code, cline, codebuddy, continue, cursor, droid, gemini-cli, junie, openhands, pi, vscode-copilot, zed, copilot-cli",
      "enable another integration: tokenjuice install <host>",
      "",
    ].join("\n"));
  });

  it("prints a compact empty state when no hooks are installed", () => {
    const report = {
      status: "disabled",
      integrations: {
        codex: disabledReport("/tmp/codex/hooks.json"),
        "claude-code": {
          settingsPath: "/tmp/claude/settings.json",
          status: "disabled",
          issues: ["tokenjuice hook is not installed"],
          missingPaths: [],
          fixCommand: "tokenjuice install claude-code",
        },
      },
    } as unknown as HookDoctorReport;

    expect(formatHookDoctorReport(report)).toBe([
      "hook health: disabled",
      "no tokenjuice hooks installed",
      "",
      "available integrations: aider, avante, codex, claude-code, cline, codebuddy, continue, cursor, droid, gemini-cli, junie, openhands, pi, vscode-copilot, zed, copilot-cli",
      "enable another integration: tokenjuice install <host>",
      "",
    ].join("\n"));
  });
});
