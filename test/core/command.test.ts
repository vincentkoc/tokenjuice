import { describe, expect, it } from "vitest";

import {
  deriveCommandMatchCandidates,
  getGitSubcommand,
  hasMultipleSubstantiveShellCommands,
  hasSequentialShellCommands,
  isFileContentInspectionCommand,
  isRepositoryInspectionCommand,
  isVerbatimConfigInspectionCommand,
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

  it("skips terminal setup preludes before matching the real command", () => {
    expect(resolveEffectiveCommand({
      command: "command -v tt >/dev/null 2>&1 && tt title 'code review' || tmux select-pane -T 'code review' 2>/dev/null || true; git diff --stat",
    })).toEqual({
      command: "git diff --stat",
      argv: ["git", "diff", "--stat"],
      source: "effective",
    });
  });

  it("keeps visible command probes as the effective command", () => {
    expect(resolveEffectiveCommand({ command: "command -v git; git diff --stat" })).toEqual({
      command: "command -v git",
      argv: ["command", "-v", "git"],
      source: "effective",
    });
    expect(resolveEffectiveCommand({ command: "command -v rg || true; rg --files" })).toEqual({
      command: "command -v rg || true",
      argv: ["command", "-v", "rg", "||", "true"],
      source: "effective",
    });
    expect(resolveEffectiveCommand({ command: "command -v git 2>/dev/null; git diff --stat" })).toEqual({
      command: "command -v git 2>/dev/null",
      argv: ["command", "-v", "git", "2>/dev/null"],
      source: "effective",
    });
  });

  it("skips fail-fast setup guards before matching the real command", () => {
    expect(resolveEffectiveCommand({ command: "cd repo || exit 1; pnpm test" })).toEqual({
      command: "pnpm test",
      argv: ["pnpm", "test"],
      source: "effective",
    });
  });

  it("skips guarded terminal setup preludes before matching the real command", () => {
    expect(resolveEffectiveCommand({
      command: "if command -v tt >/dev/null 2>&1; then tt title 'code review'; else tmux select-pane -T 'code review' 2>/dev/null || true; fi; git diff --stat",
    })).toEqual({
      command: "git diff --stat",
      argv: ["git", "diff", "--stat"],
      source: "effective",
    });
  });

  it("skips tmux-guarded terminal setup preludes before matching the real command", () => {
    expect(resolveEffectiveCommand({
      command: "if [ -n \"$TMUX\" ]; then tt title 'code review'; fi; git diff --stat",
    })).toEqual({
      command: "git diff --stat",
      argv: ["git", "diff", "--stat"],
      source: "effective",
    });
  });

  it("skips bash-style tmux guards before matching the real command", () => {
    expect(resolveEffectiveCommand({
      command: "if [[ -n \"$TMUX\" ]]; then tt title 'code review'; fi; git diff --stat",
    })).toEqual({
      command: "git diff --stat",
      argv: ["git", "diff", "--stat"],
      source: "effective",
    });
  });

  it("does not strip setup commands from partial parenthesized groups", () => {
    expect(resolveEffectiveCommand({ command: "(cd repo && pnpm test); git status" })).toEqual({
      command: "(cd repo",
      argv: ["(cd", "repo"],
      source: "effective",
    });
  });

  it("skips setup segments before guarded terminal setup preludes", () => {
    expect(resolveEffectiveCommand({
      command: "cd repo && if command -v tt >/dev/null 2>&1; then tt title 'tests'; else tmux select-pane -T 'tests' 2>/dev/null || true; fi; pnpm test",
    })).toEqual({
      command: "pnpm test",
      argv: ["pnpm", "test"],
      source: "effective",
    });
  });

  it("skips newline-form guarded terminal setup preludes", () => {
    expect(resolveEffectiveCommand({
      command: "if command -v tt >/dev/null 2>&1\nthen tt title 'tests'\nelse tmux select-pane -T 'tests' 2>/dev/null || true\nfi\npnpm test",
    })).toEqual({
      command: "pnpm test",
      argv: ["pnpm", "test"],
      source: "effective",
    });
  });

  it("keeps command probes with substantive fallbacks as the effective command", () => {
    expect(resolveEffectiveCommand({
      command: "command -v rg >/dev/null || cargo install ripgrep; rg --files",
    })).toEqual({
      command: "command -v rg >/dev/null || cargo install ripgrep",
      argv: ["command", "-v", "rg", ">/dev/null", "||", "cargo", "install", "ripgrep"],
      source: "effective",
    });
  });

  it("keeps test guards with substantive fallbacks as the effective command", () => {
    expect(resolveEffectiveCommand({
      command: "if [ -x \"$(command -v tt)\" ] || cargo install tt; then tt title 'tests'; fi; pnpm test",
    })).toMatchObject({
      command: "if [ -x \"$(command -v tt)\" ] || cargo install tt",
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

describe("hasMultipleSubstantiveShellCommands", () => {
  it.each([
    "grep -i github /etc/hosts; echo '---dig:'; dig +short api.github.com @1.1.1.1; scutil --dns",
    "cd repo && swift test && rg -n failure src",
    "command -v rg || cargo install ripgrep; rg --files src",
    "bash -lc 'grep -i github /etc/hosts; dig +short api.github.com @1.1.1.1'",
  ])("detects `%s` as multiple substantive commands", (command) => {
    expect(hasMultipleSubstantiveShellCommands({ command })).toBe(true);
  });

  it.each([
    "cd repo && pnpm test",
    "source .env && cargo test",
    "if command -v tt >/dev/null 2>&1; then tt title 'tests'; else tmux select-pane -T 'tests' 2>/dev/null || true; fi; pnpm test",
    "bash -lc 'cd repo && pnpm test'",
  ])("keeps setup-wrapped `%s` as one substantive command", (command) => {
    expect(hasMultipleSubstantiveShellCommands({ command })).toBe(false);
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

describe("isVerbatimConfigInspectionCommand", () => {
  it.each([
    { label: "plutil print", command: "plutil -p /Library/LaunchDaemons/com.example.daemon.plist" },
    { label: "plutil convert to stdout", command: "plutil -convert json -o - settings.plist" },
    { label: "read-only config get", command: "openclaw config get agents.defaults" },
    { label: "ssh-wrapped cat", command: "ssh build-host 'cat /etc/hosts'" },
    { label: "ssh-wrapped cat with compression", command: "ssh -C build-host 'cat /etc/hosts'" },
    { label: "ssh-wrapped cat with cipher", command: "ssh -c aes128-ctr build-host 'cat /etc/hosts'" },
    { label: "ssh-wrapped cat with bind interface", command: "ssh -B en0 build-host 'cat /etc/hosts'" },
    { label: "ssh-wrapped cat with tag", command: "ssh -P audit build-host 'cat /etc/hosts'" },
    { label: "ssh-wrapped shell runner", command: "ssh build-host \"bash -lc 'cat /etc/hosts'\"" },
    { label: "ssh-wrapped plutil with ssh options", command: "ssh -p 2222 -i ~/.ssh/id_ed25519 build-host 'plutil -p /Library/LaunchDaemons/com.example.daemon.plist'" },
    { label: "ssh-wrapped read-only config get", command: "ssh build-host 'openclaw config get gateway'" },
    { label: "ssh-wrapped gh contents decode", command: "ssh build-host 'gh api repos/o/r/contents/file --jq .content | base64 --decode'" },
  ])("detects $label as a verbatim config inspection", ({ command }) => {
    expect(isVerbatimConfigInspectionCommand({ command })).toBe(true);
  });

  it.each([
    "plutil -convert binary1 settings.plist",
    "openclaw config set agents.defaults.model test",
    "ssh build-host 'rm -rf /tmp/scratch'",
    "ssh build-host",
    "ssh build-host 'cat /etc/hosts && pytest -q'",
    "ssh build-host \"bash -lc 'cat /etc/hosts; pytest -q'\"",
    "ssh build-host 'gh api repos/o/r/contents/file --jq .content | base64 --decode; pytest -q'",
    "bash -lc 'openclaw config get gateway' && pytest -q",
    "ssh build-host \"bash -lc 'cat /etc/hosts' && pytest -q\"",
  ])("does not treat `%s` as a verbatim config inspection", (command) => {
    expect(isVerbatimConfigInspectionCommand({ command })).toBe(false);
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
