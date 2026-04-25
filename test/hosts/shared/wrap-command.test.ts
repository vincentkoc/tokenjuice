import { describe, expect, it } from "vitest";

import { parseWrappedCommand } from "./wrap-command.js";

describe("parseWrappedCommand", () => {
  it("parses a direct tokenjuice launcher command", () => {
    const parsed = parseWrappedCommand("/usr/local/bin/tokenjuice wrap -- /bin/bash -lc 'git status --short'");
    expect(parsed.launcher).toEqual(["/usr/local/bin/tokenjuice"]);
    expect(parsed.subcommand).toBe("wrap");
    expect(parsed.wrapArgs).toEqual([]);
    expect(parsed.shellPath).toBe("/bin/bash");
    expect(parsed.shellFlag).toBe("-lc");
    expect(parsed.inner).toBe("git status --short");
    expect(parsed.innerArgv).toEqual(["git", "status", "--short"]);
    expect(parsed.wrapDepth).toBe(1);
  });

  it("parses a node-based local build launcher", () => {
    const parsed = parseWrappedCommand("/usr/bin/node /repo/dist/cli/main.js wrap -- /bin/bash -lc 'echo hi'");
    expect(parsed.launcher).toEqual(["/usr/bin/node", "/repo/dist/cli/main.js"]);
    expect(parsed.inner).toBe("echo hi");
    expect(parsed.wrapDepth).toBe(1);
  });

  it("recovers the original command from an arbitrary POSIX quoting strategy", () => {
    // Same semantic inner command as in the first case, but using a double-
    // quoted form a refactor might emit. The helper must still pull out the
    // equivalent parsed inner.
    const parsed = parseWrappedCommand(`/usr/local/bin/tokenjuice wrap -- /bin/bash -lc "git status --short"`);
    expect(parsed.inner).toBe("git status --short");
    expect(parsed.innerArgv).toEqual(["git", "status", "--short"]);
  });

  it("unescapes a POSIX single-quoted payload containing an apostrophe", () => {
    const parsed = parseWrappedCommand(`/usr/local/bin/tokenjuice wrap -- /bin/bash -lc 'echo it'\\''s raining'`);
    expect(parsed.inner).toBe("echo it's raining");
  });

  it("exposes wrap-level flags between the subcommand and the separator", () => {
    const parsed = parseWrappedCommand("/usr/local/bin/tokenjuice wrap --raw -- /bin/bash -lc 'git status'");
    expect(parsed.wrapArgs).toEqual(["--raw"]);
    expect(parsed.inner).toBe("git status");
  });

  it("counts a double-wrapped command as wrapDepth 2", () => {
    const parsed = parseWrappedCommand(
      "/usr/local/bin/tokenjuice wrap -- /bin/bash -lc '/usr/local/bin/tokenjuice wrap -- /bin/bash -lc git-status'",
    );
    expect(parsed.wrapDepth).toBe(2);
  });

  it("throws when the subcommand is not 'wrap'", () => {
    expect(() => parseWrappedCommand("/usr/local/bin/tokenjuice ls -- /bin/bash -lc x")).toThrow(/'wrap' subcommand/);
  });

  it("throws when the '--' separator is missing", () => {
    expect(() => parseWrappedCommand("/usr/local/bin/tokenjuice wrap /bin/bash -lc x")).toThrow(/'--' separator/);
  });

  it("throws when the leading token is not a recognized launcher", () => {
    expect(() => parseWrappedCommand("some-other-binary wrap -- /bin/bash -lc x")).toThrow(/tokenjuice launcher/);
  });
});
