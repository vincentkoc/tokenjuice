import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { clearRuleCache, loadBuiltinRules, loadRules, verifyBuiltinRules, verifyRules } from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  clearRuleCache();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-rules-"));
  tempDirs.push(dir);
  return dir;
}

describe("rules", () => {
  it("loads builtin rules successfully", async () => {
    const rules = await loadBuiltinRules();
    expect(rules.map((rule) => rule.rule.id)).toEqual([
      "build/esbuild",
      "build/tsc",
      "filesystem/find",
      "filesystem/ls",
      "git/diff-name-only",
      "git/diff-stat",
      "git/status",
      "lint/eslint",
      "lint/oxlint",
      "search/grep",
      "search/rg",
      "tests/cargo-test",
      "tests/go-test",
      "tests/jest",
      "tests/pnpm-test",
      "tests/pytest",
      "tests/vitest",
      "generic/fallback",
    ]);
  });

  it("verifies builtin rules cleanly", async () => {
    const results = await verifyBuiltinRules();
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("lets a project rule override a builtin by id", async () => {
    const cwd = await createTempDir();
    const rulesDir = join(cwd, ".tokenjuice", "rules", "git");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "status.json"),
      JSON.stringify(
        {
          id: "git/status",
          family: "git-status-project",
          match: {
            argv0: ["git"],
            argvIncludes: [["status"]],
          },
          summarize: {
            head: 1,
            tail: 1,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const rules = await loadRules({ cwd });
    const gitStatus = rules.find((rule) => rule.rule.id === "git/status");
    expect(gitStatus?.source).toBe("project");
    expect(gitStatus?.rule.family).toBe("git-status-project");
  });

  it("reports invalid override rules in verify", async () => {
    const cwd = await createTempDir();
    const rulesDir = join(cwd, ".tokenjuice", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "bad.json"),
      JSON.stringify(
        {
          id: "broken/rule",
          family: "broken",
          match: {},
          counters: [
            {
              name: "bad",
              pattern: "[",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const results = await verifyRules({ cwd });
    const bad = results.find((result) => result.id === "broken/rule");
    expect(bad?.ok).toBe(false);
    expect(bad?.errors.join("\n")).toContain("Invalid regular expression");
  });
});
