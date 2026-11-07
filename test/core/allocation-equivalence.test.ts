import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { loadBuiltinFixtures } from "../../src/core/fixtures.js";
import { loadBuiltinRules } from "../../src/core/rules.js";
import { reduceExecutionWithRules } from "../../src/core/reduce.js";
import { isFileContentInspectionCommand } from "../../src/core/command-identity.js";
import { getInspectionCommandSkipReason, isRepositoryInspectionCommand } from "../../src/core/inventory-safety.js";

const policies = ["compact-all", "skip-all", "skip-file-content", "allow-safe-inventory"] as const;

// Full serialized results from b7c00f5, including metadata/stats/trace, rather
// than only the partial expectations in the rule fixtures.
describe("allocation optimization equivalence", () => {
  it("preserves inspection decisions for every built-in fixture", async () => {
    const hash = createHash("sha256");
    const fixtures = await loadBuiltinFixtures();
    expect(fixtures).toHaveLength(136);
    for (const { fixture } of fixtures) {
      const input = fixture.input;
      hash.update(JSON.stringify([fixture.id, isFileContentInspectionCommand(input), isRepositoryInspectionCommand(input), ...policies.map((policy) => getInspectionCommandSkipReason(input.command ?? "", policy))]));
    }
    expect(hash.digest("hex")).toBe("ad02d962bc1d80fd3c8d0a8fdd413277ddd1ca9275917b7deb702552131b2d1c");
  });

  it("preserves every fixture's complete reduction at four budgets with and without omission", async () => {
    const hash = createHash("sha256");
    const fixtures = await loadBuiltinFixtures();
    const rules = await loadBuiltinRules();
    for (const { fixture } of fixtures) {
      for (const maxInlineChars of [0, 80, 1200, 5000]) {
        for (const noOmit of [false, true]) {
          hash.update(JSON.stringify([fixture.id, maxInlineChars, noOmit, await reduceExecutionWithRules(fixture.input, rules, { maxInlineChars, noOmit, trace: true, recordStats: false })]));
        }
      }
    }
    expect(hash.digest("hex")).toBe("8e7e0f03db2dbb1eb2e9f742791a5740a38590bafdc6b7ebb0b409f99a53ff35");
  });

  it("preserves compound command decisions from before the optimization", () => {
    const hash = createHash("sha256");
    const commands = [
      "", "cat README.md", "jq '.packages' package-lock.json", "rg --files", "tree src", "git status --short",
      "git ls-files", "find . -type f", "fd --exec cat", "gh api repos/example/repo/contents/file --jq '.content' | base64 -d",
    ];
    const wrappers = [
      (command: string) => command,
      (command: string) => `cd repo && ${command}`,
      (command: string) => `${command} && echo done`,
      (command: string) => `${command} || echo failed`,
      (command: string) => `${command}; ls`,
      (command: string) => `${command} | sort | head -n 10`,
      (command: string) => `(${command})`,
      (command: string) => `env -i LANG=C ${command}`,
      (command: string) => `bash -lc '${command.replaceAll("'", "'\\''")}'`,
      (command: string) => `${command} "a && b || c; d | e"`,
      (command: string) => `${"cd repo && ".repeat(17)}${command}`,
    ];
    for (const command of commands.flatMap((command) => wrappers.map((wrap) => wrap(command)))) {
      for (const input of [{ command }, { command, argv: ["cat", "explicit.txt"] }, { argv: ["env", "LANG=C", "git", "ls-files"] }]) {
        hash.update(JSON.stringify([input, isFileContentInspectionCommand(input), isRepositoryInspectionCommand(input), ...policies.map((policy) => getInspectionCommandSkipReason(input.command ?? "", policy))]));
      }
    }
    expect(hash.digest("hex")).toBe("4982c2a957a524e651ccc8a5cf347103070db301e6c5f1777edb261a28c42fd7");
  });
});
