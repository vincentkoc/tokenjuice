import { describe, expect, it } from "vitest";

import {
  getGitSubcommand,
  hasSequentialShellCommands,
  isFileContentInspectionCommand,
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

  it("derives argv from the effective command after a safe cd prefix", () => {
    expect(normalizeExecutionInput({
      toolName: "exec",
      command: "cd /repo && cat README.md",
    }).argv).toEqual(["cat", "README.md"]);
  });

  it("does not derive argv from compound shell commands", () => {
    expect(normalizeExecutionInput({
      toolName: "exec",
      command: "rg --files | rg TODO src",
    }).argv).toBeUndefined();
  });

  it("unwraps bash -lc wrappers and classifies the nested command", () => {
    const normalized = normalizeExecutionInput({
      toolName: "exec",
      command: "bash -lc 'git status --short'",
      argv: ["bash", "-lc", "git status --short"],
    });
    expect(normalized.command).toBe("git status --short");
    expect(normalized.argv).toEqual(["git", "status", "--short"]);
  });

  it("unwraps absolute-path shell launchers used by cursor hooks", () => {
    const normalized = normalizeExecutionInput({
      toolName: "exec",
      command: "/usr/bin/zsh -lc 'git status --short'",
      argv: ["/usr/bin/zsh", "-lc", "git status --short"],
    });
    expect(normalized.command).toBe("git status --short");
    expect(normalized.argv).toEqual(["git", "status", "--short"]);
  });

  it("does not unwrap non-shell launchers such as ssh -c", () => {
    const normalized = normalizeExecutionInput({
      toolName: "exec",
      command: "/usr/bin/ssh -c aes128-ctr host",
      argv: ["/usr/bin/ssh", "-c", "aes128-ctr", "host"],
    });
    expect(normalized.command).toBe("/usr/bin/ssh -c aes128-ctr host");
    expect(normalized.argv).toEqual(["/usr/bin/ssh", "-c", "aes128-ctr", "host"]);
  });

  it("unwraps bash -lc but keeps compound nested commands as command-only", () => {
    const normalized = normalizeExecutionInput({
      toolName: "exec",
      command: "bash -lc 'rg --files | rg TODO src'",
      argv: ["bash", "-lc", "rg --files | rg TODO src"],
    });
    expect(normalized.command).toBe("rg --files | rg TODO src");
    expect(normalized.argv).toBeUndefined();
  });
});

describe("hasSequentialShellCommands", () => {
  it.each([
    "ls src && rg TODO src",
    "find src -type f; git status",
    "ls src\nrg TODO src",
    "rg --files || true",
  ])("detects `%s` as a command sequence", (command) => {
    expect(hasSequentialShellCommands(command)).toBe(true);
  });

  it.each([
    "find src -type f | sort | head -n 20",
    "rg --files | rg test",
    "printf 'a && b\\n'",
    "sed -n '1,20p' README.md",
  ])("does not treat `%s` as a sequential command", (command) => {
    expect(hasSequentialShellCommands(command)).toBe(false);
  });
});

describe("getGitSubcommand", () => {
  it.each([
    { command: "git ls-files src", subcommand: "ls-files" },
    { command: "git -C repo ls-files src", subcommand: "ls-files" },
    { command: "git --no-pager ls-files src", subcommand: "ls-files" },
    { command: "git -c advice.statusHints=false -C repo ls-files", subcommand: "ls-files" },
    { command: "git --git-dir=.git --work-tree=. status --short", subcommand: "status" },
  ])("finds $subcommand in `%s`", ({ command, subcommand }) => {
    expect(getGitSubcommand(tokenizeCommand(command))).toBe(subcommand);
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

  it("detects file inspection after a safe cd prefix", () => {
    expect(isFileContentInspectionCommand({ command: "cd /repo && cat README.md" })).toBe(true);
  });

  it("returns false for normal search commands", () => {
    expect(isFileContentInspectionCommand({ command: "rg AssertionError src" })).toBe(false);
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
