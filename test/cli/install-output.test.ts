import { describe, expect, it } from "vitest";

import { formatCodeBuddyInstallSuccess, formatInstallSuccess } from "../../src/cli/install-output.js";

describe("formatInstallSuccess", () => {
  it("renders an explicit success line before aligned install details", () => {
    expect(
      formatInstallSuccess("claude-code", "hook", [
        { label: "Hook", value: "/tmp/settings.json" },
        { label: "Command", value: "tokenjuice claude-code-pre-tool-use --wrap-launcher tokenjuice" },
        { label: "Verify", value: "tokenjuice doctor hooks" },
      ]),
    ).toBe(
      [
        "success: claude-code hook installed successfully",
        "",
        "  Hook   : /tmp/settings.json",
        "  Command: tokenjuice claude-code-pre-tool-use --wrap-launcher tokenjuice",
        "  Verify : tokenjuice doctor hooks",
        "",
      ].join("\n"),
    );
  });
});

describe("formatCodeBuddyInstallSuccess", () => {
  it("explains session activation separately from persisted-config verification", () => {
    expect(
      formatCodeBuddyInstallSuccess({
        settingsPath: "/tmp/settings.json",
        command: "tokenjuice codebuddy-pre-tool-use --wrap-launcher tokenjuice",
        local: true,
      }),
    ).toBe(
      [
        "success: codebuddy hook installed successfully",
        "",
        "  Settings: /tmp/settings.json",
        "  Command : tokenjuice codebuddy-pre-tool-use --wrap-launcher tokenjuice",
        "  Activate: open /hooks and review the external change for this session, or start a new CodeBuddy session",
        "  Verify  : tokenjuice doctor codebuddy --local (persisted config only; not active-session activation)",
        "",
      ].join("\n"),
    );
  });

  it("includes a backup path when installation created one", () => {
    expect(
      formatCodeBuddyInstallSuccess({
        settingsPath: "/tmp/settings.json",
        command: "tokenjuice codebuddy-pre-tool-use --wrap-launcher tokenjuice",
        backupPath: "/tmp/settings.json.bak",
        local: false,
      }),
    ).toContain("  Backup  : /tmp/settings.json.bak\n");
  });
});
