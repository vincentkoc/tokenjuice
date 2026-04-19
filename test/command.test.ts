import { describe, expect, it } from "vitest";

import {
  isFileContentInspectionCommand,
  isRepositoryInspectionCommand,
  normalizeCommandSignature,
  normalizeExecutionInput,
  stripLeadingCdPrefix,
  tokenizeCommand,
} from "../src/core/command.js";

describe("tokenizeCommand", () => {
  it("keeps quoted path arguments together", () => {
    expect(tokenizeCommand("sed -n '1,80p' 'src/rules/search/rg.json'")).toEqual([
      "sed",
      "-n",
      "1,80p",
      "src/rules/search/rg.json",
    ]);
  });
});

describe("normalizeCommandSignature", () => {
  it("normalizes quoted executable paths", () => {
    expect(normalizeCommandSignature("\"/opt/homebrew/bin/tokenjuice\" wrap --raw -- rg --files")).toBe("tokenjuice");
  });
});

describe("normalizeExecutionInput", () => {
  it("derives argv from command text when argv is missing", () => {
    expect(normalizeExecutionInput({
      toolName: "exec",
      command: "find src -maxdepth 2 -type f",
    }).argv).toEqual(["find", "src", "-maxdepth", "2", "-type", "f"]);
  });
});

describe("isFileContentInspectionCommand", () => {
  it.each([
    { label: "cat", command: "cat README.md" },
    { label: "sed", command: "sed -n '1,80p' src/core/reduce.ts" },
    { label: "head", command: "head -n 20 package.json" },
    { label: "tail", command: "tail -n 20 pnpm-lock.yaml" },
    { label: "nl", command: "nl -ba src/core/codex.ts" },
    { label: "bat", command: "bat README.md" },
    { label: "jq", command: "jq '.version' package.json" },
    { label: "yq", command: "yq '.name' pnpm-workspace.yaml" },
  ])("detects $label as file inspection from command text", ({ command }) => {
    expect(isFileContentInspectionCommand({ command })).toBe(true);
  });

  it("returns false for normal search commands", () => {
    expect(isFileContentInspectionCommand({ command: "rg AssertionError src" })).toBe(false);
  });
});

describe("isRepositoryInspectionCommand", () => {
  it.each([
    "cat README.md",
    "find src/rules -maxdepth 2 -type f",
    "fd codex src",
    "fdfind codex src",
    "ls src/rules",
    "tree src/rules",
    "rg --files src/rules",
    "git ls-files src",
  ])("detects `%s` as repository inspection", (command) => {
    expect(isRepositoryInspectionCommand({ command })).toBe(true);
  });

  it.each([
    "rg AssertionError src",
    "git status --short",
    "pnpm test",
  ])("does not over-match `%s`", (command) => {
    expect(isRepositoryInspectionCommand({ command })).toBe(false);
  });
});

describe("stripLeadingCdPrefix", () => {
  it("strips `cd <dir> && <tail>` prefixes", () => {
    expect(stripLeadingCdPrefix("cd /repo && git log -30")).toBe("git log -30");
  });

  it("strips `pushd <dir> && <tail>` prefixes", () => {
    expect(stripLeadingCdPrefix("pushd /repo && git status")).toBe("git status");
  });

  it("handles chained cd prefixes", () => {
    expect(stripLeadingCdPrefix("cd /a && cd b && git status")).toBe("git status");
  });

  it("handles quoted directory arguments with spaces", () => {
    expect(stripLeadingCdPrefix("cd \"/home/with spaces\" && npm --help")).toBe("npm --help");
  });

  it("leaves compound commands without a leading cd unchanged", () => {
    expect(stripLeadingCdPrefix("git log -30 | head")).toBe("git log -30 | head");
  });

  it("leaves non-trivial chains alone (redirection in cd arg)", () => {
    expect(stripLeadingCdPrefix("cd /tmp > /dev/null && ls")).toBe("cd /tmp > /dev/null && ls");
  });

  it("leaves bare `cd <dir>` without a chained tail alone", () => {
    expect(stripLeadingCdPrefix("cd /repo")).toBe("cd /repo");
  });

  it("leaves commands that do not start with cd/pushd alone", () => {
    expect(stripLeadingCdPrefix("git log -30")).toBe("git log -30");
  });
});
