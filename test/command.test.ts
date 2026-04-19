import { describe, expect, it } from "vitest";

import {
  getGitSubcommand,
  getInspectionCommandSkipReason,
  getRepositoryInventorySafety,
  hasSequentialShellCommands,
  isFileContentInspectionCommand,
  isRepositoryInventoryCommand,
  isRepositoryInspectionCommand,
  isSafeRepositoryInventoryPipeline,
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

describe("isRepositoryInspectionCommand", () => {
  it.each([
    "cat README.md",
    "find src/rules -maxdepth 2 -type f",
    "fd codex src",
    "fdfind codex src",
    "ls src/rules",
    "rg --files src/rules",
    "cd /repo && rg --files src/rules",
    "git ls-files src",
    "git -C repo ls-files src",
    "git --no-pager ls-files src",
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

describe("isRepositoryInventoryCommand", () => {
  it.each([
    "find src/rules -maxdepth 2 -type f",
    "fd codex src",
    "fdfind codex src",
    "ls src/rules",
    "rg --files src/rules",
    "git ls-files src",
    "cd /repo && rg --files src/rules",
    "git -C repo ls-files src",
    "git --no-pager ls-files src",
  ])("detects `%s` as repository inventory", (command) => {
    expect(isRepositoryInventoryCommand({ command })).toBe(true);
  });

  it.each([
    "cat README.md",
    "sed -n '1,80p' src/core/reduce.ts",
    "rg AssertionError src",
    "git status --short",
  ])("does not over-match `%s`", (command) => {
    expect(isRepositoryInventoryCommand({ command })).toBe(false);
  });
});

describe("isSafeRepositoryInventoryPipeline", () => {
  it.each([
    "find src -type f",
    "rg --files src",
    "git ls-files src",
    "cd /repo && rg --files src",
    "find src -type f | sort | head -n 20",
    "git -C repo ls-files | sort | head -n 20",
    "rg --files | sort -u | tail -n 20",
    "find src -type f | sort | uniq",
    "find src -type f | sort -k 1 | head -40",
    "find src -type f | sort --batch-size 4M --sort name | head -40",
    "find src -type f | uniq -c",
  ])("allows `%s`", (command) => {
    expect(isSafeRepositoryInventoryPipeline(command)).toBe(true);
  });

  it.each([
    "rg TODO src",
    "cat README.md",
    "ls src && rg TODO src",
    "find src -type f; git status",
    "rg --files || true",
    "find src -type f | xargs wc -l",
    "ls src | awk '{print $1}'",
    "rg --files | node scripts/filter.js",
    "git ls-files | jq -R .",
    "git -C repo ls-files | jq -R .",
    "rg --files | rg TODO src",
    "find src -type f | sed -n '1,5p' src/core/reduce.ts",
    "git ls-files | grep -R TODO src",
    "find src -type f | head -n 5 README.md",
    "git ls-files | tail -n 5 README.md",
    "rg --files | sort README.md",
    "find src -type f | uniq README.md",
    "rg --files | sort --output README.md",
    "find src -type f -exec cat {} +",
    "find src -type f -exec sed -n 1,5p {} \\;",
    "find src -type f -execdir cat {} +",
    "find src -type f -ok cat {} \\;",
    "fd -x cat",
    "fd --exec cat",
    "fd --exec=cat",
    "fd -X sed -n 1,5p",
    "fd --exec-batch sed -n 1,5p",
    "fd --exec-batch=sed",
  ])("blocks `%s`", (command) => {
    expect(isSafeRepositoryInventoryPipeline(command)).toBe(false);
  });

  it.each([
    { command: "rg TODO src", safety: "not-inventory" },
    { command: "find src -type f", safety: "safe" },
    { command: "cd /repo && rg --files src", safety: "safe" },
    { command: "ls src && rg TODO src", safety: "sequential-command" },
    { command: "find src -type f | xargs wc -l", safety: "unsafe-pipeline" },
    { command: "find src -type f -exec cat {} +", safety: "unsafe-pipeline" },
    { command: "fd --exec cat", safety: "unsafe-pipeline" },
  ])("classifies `%s` as $safety", ({ command, safety }) => {
    expect(getRepositoryInventorySafety(command)).toBe(safety);
  });
});

describe("getInspectionCommandSkipReason", () => {
  it.each([
    { command: "cat README.md", reason: "file-content-inspection-command" },
    { command: "cd /repo && cat README.md", reason: "file-content-inspection-command" },
    { command: "ls src && rg TODO src", reason: "sequential-inventory-command" },
    { command: "git -C repo ls-files | jq -R .", reason: "unsafe-inventory-pipeline" },
    { command: "rg --files | sort README.md", reason: "unsafe-inventory-pipeline" },
    { command: "find src -type f -exec cat {} +", reason: "unsafe-inventory-pipeline" },
    { command: "fd --exec cat", reason: "unsafe-inventory-pipeline" },
  ])("skips `%s` with allow-safe-inventory because $reason", ({ command, reason }) => {
    expect(getInspectionCommandSkipReason(command, "allow-safe-inventory")).toBe(reason);
  });

  it("allows safe inventory with allow-safe-inventory", () => {
    expect(getInspectionCommandSkipReason("rg --files | sort | head -n 10", "allow-safe-inventory")).toBeNull();
    expect(getInspectionCommandSkipReason("cd /repo && rg --files src", "allow-safe-inventory")).toBeNull();
  });
});
