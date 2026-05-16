import { describe, expect, it } from "vitest";

import { formatInstallSuccess } from "../../src/cli/install-output.js";

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
