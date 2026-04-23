import { describe, expect, it } from "vitest";

import {
  deriveCommandMatchCandidates,
  getGitSubcommand,
  hasSequentialShellCommands,
  isFileContentInspectionCommand,
  isRepositoryInspectionCommand,
  normalizeCommandSignature,
  normalizeEffectiveCommandSignature,
  normalizeExecutionInput,
  resolveEffectiveCommand,
  splitTopLevelCommandChain,
  stripLeadingCdPrefix,
  tokenizeCommand,
  unwrapShellRunner,
} from "../../src/core/command.js";

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

describe("splitTopLevelCommandChain", () => {
  it("splits top-level setup and command segments", () => {
    expect(splitTopLevelCommandChain("cd apps && swift test")).toEqual([
      "cd apps",
      "swift test",
    ]);
  });

  it("does not split quoted separators", () => {
    expect(splitTopLevelCommandChain("bash -lc 'echo \"a && b\"; swift test'"))
      .toEqual(["bash -lc 'echo \"a && b\"; swift test'"]);
  });
});

describe("unwrapShellRunner", () => {
  it("extracts a shell body from bash -lc", () => {
    expect(unwrapShellRunner({ command: "bash -lc 'cd apps && swift test'" })).toBe("cd apps && swift test");
  });

  it("extracts a shell body from clustered shell flags containing -c", () => {
    expect(unwrapShellRunner({ command: "sh -ceu 'cd repo && pnpm test'" })).toBe("cd repo && pnpm test");
    expect(unwrapShellRunner({ command: "bash -ec 'rg foo src'" })).toBe("rg foo src");
  });
});

describe("resolveEffectiveCommand", () => {
  it("skips leading setup segments and chooses the first substantive command", () => {
    expect(resolveEffectiveCommand({ command: "cd repo && swift test && rg failure src" })).toEqual({
      command: "swift test",
      argv: ["swift", "test"],
      source: "effective",
    });
  });

  it("strips env assignments before matching", () => {
    expect(resolveEffectiveCommand({ command: "FOO='a b' swift build" })).toEqual({
      command: "swift build",
      argv: ["swift", "build"],
      source: "effective",
    });
  });

  it("returns null when every segment is setup-only", () => {
    expect(resolveEffectiveCommand({ command: "export FOO=1 && export BAR=2" })).toBeNull();
  });

  it("returns null for already-direct commands", () => {
    expect(resolveEffectiveCommand({ command: "pnpm test" })).toBeNull();
  });

  it("uses structured argv directly for argv-only inputs with spaced env assignments", () => {
    expect(resolveEffectiveCommand({ argv: ["FOO=a b", "swift", "build"] })).toEqual({
      argv: ["swift", "build"],
      source: "effective",
    });
  });
});

describe("deriveCommandMatchCandidates", () => {
  it("derives original, shell-body, and effective candidates for wrapped shell commands", () => {
    expect(deriveCommandMatchCandidates({ command: "bash -lc 'cd repo && pnpm test'" })).toEqual([
      {
        command: "bash -lc 'cd repo && pnpm test'",
        argv: ["bash", "-lc", "cd repo && pnpm test"],
        source: "original",
      },
      {
        command: "cd repo && pnpm test",
        argv: [],
        source: "shell-body",
      },
      {
        command: "pnpm test",
        argv: ["pnpm", "test"],
        source: "effective",
      },
    ]);
  });

  it("keeps the shell-body candidate when it already represents the effective command", () => {
    expect(deriveCommandMatchCandidates({ command: "bash -lc 'pnpm test'" })).toEqual([
      {
        command: "bash -lc 'pnpm test'",
        argv: ["bash", "-lc", "pnpm test"],
        source: "original",
      },
      {
        command: "pnpm test",
        argv: ["pnpm", "test"],
        source: "shell-body",
      },
    ]);
  });

  it("does not fabricate command strings for argv-only candidates", () => {
    expect(deriveCommandMatchCandidates({ argv: ["FOO=a b", "swift", "build"] })).toEqual([
      {
        argv: ["FOO=a b", "swift", "build"],
        source: "original",
      },
      {
        argv: ["swift", "build"],
        source: "effective",
      },
    ]);
  });
});

describe("normalizeCommandSignature", () => {
  it("normalizes quoted executable paths", () => {
    expect(normalizeCommandSignature("\"/opt/homebrew/bin/tokenjuice\" wrap --raw -- rg --files")).toBe("tokenjuice");
  });
});

describe("normalizeEffectiveCommandSignature", () => {
  it("normalizes wrapped effective commands without changing raw signature semantics", () => {
    expect(normalizeEffectiveCommandSignature("cd apps && swift test")).toBe("swift");
    expect(normalizeEffectiveCommandSignature("bash -lc 'pnpm test'")).toBe("pnpm");
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

  it("unwraps env prefixes before deriving the effective argv", () => {
    const normalized = normalizeExecutionInput({
      toolName: "exec",
      command: "GIT_DIR=/repo/.git GIT_WORK_TREE=/repo git status --short",
    });
    expect(normalized.command).toBe("git status --short");
    expect(normalized.argv).toEqual(["git", "status", "--short"]);
  });

  it("unwraps env launcher prefixes before deriving the effective argv", () => {
    const normalized = normalizeExecutionInput({
      toolName: "exec",
      command: "env GIT_DIR=/repo/.git GIT_WORK_TREE=/repo git ls-files src",
    });
    expect(normalized.command).toBe("git ls-files src");
    expect(normalized.argv).toEqual(["git", "ls-files", "src"]);
  });

  it("unwraps env end-of-options markers before deriving the effective argv", () => {
    const normalized = normalizeExecutionInput({
      toolName: "exec",
      command: "env -- git ls-files src",
    });
    expect(normalized.command).toBe("git ls-files src");
    expect(normalized.argv).toEqual(["git", "ls-files", "src"]);
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
    { label: "nl", command: "nl -ba src/hosts/codex/index.ts" },
    { label: "bat", command: "bat README.md" },
    { label: "jq", command: "jq '.version' package.json" },
    { label: "yq", command: "yq '.name' pnpm-workspace.yaml" },
    { label: "git show blob", command: "git show HEAD:README.md" },
    { label: "git show blob piped to sed", command: "git show HEAD:README.md | sed -n '1,40p'" },
    { label: "wrapped cat", command: "cd repo && cat README.md" },
    { label: "clustered shell wrapper", command: "bash -ec 'cat README.md'" },
    { label: "git show blob", command: "git show HEAD:src/core/reduce.ts" },
    { label: "gh contents decode", command: "gh api repos/gumadeiras/tokenjuice/contents/src/core/reduce.ts --jq .content | base64 -d" },
  ])("detects $label as file inspection from command text", ({ command }) => {
    expect(isFileContentInspectionCommand({ command })).toBe(true);
  });

  it("detects file inspection after a safe cd prefix", () => {
    expect(isFileContentInspectionCommand({ command: "cd /repo && cat README.md" })).toBe(true);
  });

  it("detects file inspection after env prefixes", () => {
    expect(isFileContentInspectionCommand({ command: "env GIT_DIR=/repo/.git git show HEAD:README.md" })).toBe(true);
  });

  it("detects file inspection after env end-of-options markers", () => {
    expect(isFileContentInspectionCommand({ command: "env -- git show HEAD:README.md" })).toBe(true);
  });

  it("returns false for normal search commands", () => {
    expect(isFileContentInspectionCommand({ command: "rg AssertionError src" })).toBe(false);
  });

  it("does not treat git show commit summaries as file inspection", () => {
    expect(isFileContentInspectionCommand({ command: "git show HEAD --stat" })).toBe(false);
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
    "pwd && rg --files src/rules",
  ])("detects `%s` as repository inspection", (command) => {
    expect(isRepositoryInspectionCommand({ command })).toBe(true);
  });

  it.each([
    "rg AssertionError src",
    "git status --short",
    "pnpm test",
    "pwd && rg -n AssertionError src",
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
