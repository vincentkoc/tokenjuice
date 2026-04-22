import { describe, expect, it } from "vitest";

import {
  getInspectionCommandSkipReason,
  getRepositoryInventorySafety,
  isRepositoryInspectionCommand,
  isRepositoryInventoryCommand,
  isSafeRepositoryInventoryPipeline,
} from "../../src/core/inventory-safety.js";

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

describe("isRepositoryInspectionCommand", () => {
  it.each([
    "cat README.md",
    "find src/rules -maxdepth 2 -type f",
    "fd codex src",
    "fdfind codex src",
    "ls src/rules",
    "tree src/rules",
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
    "git ls-files | sed -n '1,20p'",
    "rg --files | sed 's#^src/##'",
    "find src -type f | wc -l",
    "env GIT_DIR=/repo/.git GIT_WORK_TREE=/repo git ls-files src | wc -l",
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
    "find src -type f | sed -f script.sed",
    "find src -type f | wc -lm",
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
    { command: "git ls-files | sed -n '1,20p'", safety: "safe" },
    { command: "git ls-files | wc -l", safety: "safe" },
  ])("classifies `%s` as $safety", ({ command, safety }) => {
    expect(getRepositoryInventorySafety(command)).toBe(safety);
  });
});

describe("getInspectionCommandSkipReason", () => {
  it.each([
    { command: "cat README.md", reason: "file-content-inspection-command" },
    { command: "cd /repo && cat README.md", reason: "file-content-inspection-command" },
    { command: "git show HEAD:README.md | sed -n '1,40p'", reason: "file-content-inspection-command" },
    { command: "tree src", reason: "inspection-command" },
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
    expect(getInspectionCommandSkipReason("git ls-files | sed -n '1,20p'", "allow-safe-inventory")).toBeNull();
    expect(getInspectionCommandSkipReason("jq '.packages' package-lock.json", "allow-safe-inventory")).toBeNull();
    expect(getInspectionCommandSkipReason("sed -n '1,260p' /tmp/paper.review.md", "allow-safe-inventory")).toBe("file-content-inspection-command");
  });
});
