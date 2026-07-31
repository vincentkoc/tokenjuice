import { describe, expect, it } from "vitest";

import {
  extractHookCommandPaths,
  parseShellWords,
  posixShellQuote,
  shellQuote,
} from "../../../src/hosts/shared/hook-command.js";

describe("shellQuote", () => {
  it("leaves unspaced Windows paths unquoted", () => {
    expect(shellQuote(String.raw`C:\Users\andre\bin\tokenjuice.exe`, "win32")).toBe(
      String.raw`C:\Users\andre\bin\tokenjuice.exe`,
    );
  });

  it("wraps spaced Windows paths in double quotes", () => {
    expect(shellQuote(String.raw`C:\Program Files\nodejs\node.exe`, "win32")).toBe(
      `"${String.raw`C:\Program Files\nodejs\node.exe`}"`,
    );
  });
});

describe("parseShellWords", () => {
  it("preserves backslashes inside POSIX single quotes", () => {
    const path = String.raw`C:\Users\me\bin\tokenjuice.cmd`;

    expect(parseShellWords(`${posixShellQuote(path)} wrap`, "linux")).toEqual([path, "wrap"]);
  });

  it("preserves ordinary backslashes inside POSIX double quotes", () => {
    const path = String.raw`C:\Program Files\tokenjuice.cmd`;

    expect(parseShellWords(`"${path}" wrap`, "linux")).toEqual([path, "wrap"]);
  });

  it("preserves backslashes in unquoted Windows launcher commands", () => {
    expect(parseShellWords(String.raw`C:\Users\andre\bin\tokenjuice.exe codex-post-tool-use`, "win32")).toEqual([
      String.raw`C:\Users\andre\bin\tokenjuice.exe`,
      "codex-post-tool-use",
    ]);
  });

  it("preserves backslashes inside quoted Windows node commands", () => {
    expect(
      parseShellWords(
        `"${String.raw`C:\Program Files\nodejs\node.exe`}" "${String.raw`C:\Users\andre\OneDrive\Documents\Github\tokenjuice\dist\cli\main.js`}" codex-post-tool-use`,
        "win32",
      ),
    ).toEqual([
      String.raw`C:\Program Files\nodejs\node.exe`,
      String.raw`C:\Users\andre\OneDrive\Documents\Github\tokenjuice\dist\cli\main.js`,
      "codex-post-tool-use",
    ]);
  });

  it("coalesces an unquoted leading Windows node path with spaces", () => {
    expect(
      parseShellWords(
        `${String.raw`C:\Program Files\nodejs\node.exe`} /opt/homebrew/Cellar/tokenjuice/0.2.0/libexec/dist/cli/main.js codex-post-tool-use`,
        "win32",
      ),
    ).toEqual([
      String.raw`C:\Program Files\nodejs\node.exe`,
      "/opt/homebrew/Cellar/tokenjuice/0.2.0/libexec/dist/cli/main.js",
      "codex-post-tool-use",
    ]);
  });
});

describe("extractHookCommandPaths", () => {
  it("extracts both Node and a stable tokenjuice launcher from pinned commands", () => {
    expect(
      extractHookCommandPaths(
        "/opt/node/bin/node /usr/local/bin/tokenjuice codex-post-tool-use --no-omit",
      ),
    ).toEqual([
      "/opt/node/bin/node",
      "/usr/local/bin/tokenjuice",
    ]);
  });

  it("extracts Windows launcher and script paths from quoted node commands", () => {
    const nodePath = String.raw`C:\Program Files\nodejs\node.exe`;
    const scriptPath = String.raw`C:\Users\andre\OneDrive\Documents\Github\tokenjuice\dist\cli\main.js`;

    expect(
      extractHookCommandPaths(
        `"${nodePath}" "${scriptPath}" codex-post-tool-use`,
        "win32",
      ),
    ).toEqual([nodePath, scriptPath]);
  });
});
