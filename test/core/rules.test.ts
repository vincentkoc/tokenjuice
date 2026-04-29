import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearFixtureCache,
  clearRuleCache,
  loadBuiltinFixtures,
  loadBuiltinRules,
  loadRules,
  verifyBuiltinFixtures,
  verifyBuiltinRules,
  verifyRules,
} from "../../src/index.js";

const tempDirs: string[] = [];

function summarizeFailures(
  results: Array<{ id: string; errors: string[] }>,
): string {
  return results
    .filter((result) => result.errors.length > 0)
    .map((result) => `${result.id}: ${result.errors.join(" | ")}`)
    .join("\n");
}

afterEach(async () => {
  clearFixtureCache();
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
      "archive/tar",
      "archive/unzip",
      "archive/zip",
      "build/cmake",
      "build/dotnet",
      "build/esbuild",
      "build/go-build",
      "build/gradle",
      "build/maven",
      "build/msbuild",
      "build/pnpm-build",
      "build/swift-build",
      "build/tsc",
      "build/tsdown",
      "build/vite",
      "build/webpack",
      "build/xcodebuild",
      "cloud/aws",
      "cloud/az",
      "cloud/flyctl",
      "cloud/gcloud",
      "cloud/gh",
      "cloud/vercel",
      "database/mongosh",
      "database/mysql",
      "database/psql",
      "database/redis-cli",
      "database/sqlite3",
      "devops/docker-build",
      "devops/docker-compose",
      "devops/docker-images",
      "devops/docker-logs",
      "devops/docker-ps",
      "devops/helm",
      "devops/kubectl-describe",
      "devops/kubectl-get",
      "devops/kubectl-logs",
      "devops/pulumi",
      "devops/terraform",
      "devops/terragrunt",
      "filesystem/fd",
      "filesystem/find",
      "filesystem/git-ls-files",
      "filesystem/ls",
      "filesystem/rg-files",
      "generic/help",
      "git/branch",
      "git/diff",
      "git/diff-name-only",
      "git/diff-stat",
      "git/log-oneline",
      "git/remote-v",
      "git/show",
      "git/stash-list",
      "git/status",
      "git/worktree-list",
      "install/bun-install",
      "install/npm-ci",
      "install/npm-install",
      "install/pnpm-install",
      "install/yarn-install",
      "lint/biome",
      "lint/eslint",
      "lint/oxlint",
      "lint/prettier-check",
      "media/ffmpeg",
      "media/mediainfo",
      "network/curl",
      "network/dig",
      "network/nslookup",
      "network/ping",
      "network/ssh",
      "network/traceroute",
      "network/wget",
      "observability/free",
      "observability/htop",
      "observability/iostat",
      "observability/top",
      "observability/vmstat",
      "openclaw/sessions-history",
      "package/apt-install",
      "package/apt-upgrade",
      "package/brew-install",
      "package/brew-upgrade",
      "package/composer",
      "package/dnf-install",
      "package/fnm",
      "package/npm-ls",
      "package/yum-install",
      "search/git-grep",
      "search/grep",
      "search/rg",
      "service/journalctl",
      "service/launchctl",
      "service/lsof",
      "service/netstat",
      "service/pm2",
      "service/service",
      "service/ss",
      "service/systemctl-status",
      "system/df",
      "system/du",
      "system/file",
      "system/ps",
      "task/env",
      "task/just",
      "task/make",
      "task/mise",
      "task/node",
      "task/php",
      "task/python",
      "task/ruby",
      "task/uv",
      "tests/bun-test",
      "tests/cargo-test",
      "tests/go-test",
      "tests/jest",
      "tests/mocha",
      "tests/npm-test",
      "tests/playwright",
      "tests/pnpm-test",
      "tests/pytest",
      "tests/rspec",
      "tests/swift-test",
      "tests/vitest",
      "tests/yarn-test",
      "text/wc",
      "transfer/rsync",
      "transfer/scp",
      "generic/fallback",
    ]);
  });

  it("verifies builtin rules cleanly", async () => {
    const results = await verifyBuiltinRules();
    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0) {
      throw new Error(summarizeFailures(failed));
    }
    expect(failed).toEqual([]);
  });

  it("loads builtin fixtures successfully", async () => {
    const fixtures = await loadBuiltinFixtures();
    expect(fixtures).toHaveLength(136);
  });

  it("keeps builtin fixture inventory aligned with builtin rules", async () => {
    const fixtures = await loadBuiltinFixtures();
    const rules = await loadBuiltinRules();
    const fixtureRuleIds = new Set(fixtures.map(({ fixture }) => fixture.ruleId));
    const fixtureIds = fixtures.map(({ fixture }) => fixture.id);
    const fixtureReducerIds = fixtures.map(({ fixture }) => fixture.expect.matchedReducer);
    const builtinRuleIds = rules.map((rule) => rule.rule.id);

    expect(new Set(fixtureIds).size).toBe(fixtureIds.length);
    expect(fixtureReducerIds).not.toContain(undefined);
    expect(
      fixtures.filter(({ fixture }) => fixture.expect.matchedReducer !== fixture.ruleId).map(({ fixture }) => fixture.id),
    ).toEqual([]);
    expect(
      builtinRuleIds.filter((id) => !fixtureRuleIds.has(id)),
    ).toEqual([]);
    expect(
      [...fixtureRuleIds].filter((id) => !builtinRuleIds.includes(id)),
    ).toEqual([]);
  });

  it("verifies builtin fixtures cleanly", async () => {
    const results = await verifyBuiltinFixtures();
    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0) {
      throw new Error(summarizeFailures(failed));
    }
    expect(failed).toEqual([]);
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

  it("accepts gitSubcommands in project rule matchers", async () => {
    const cwd = await createTempDir();
    const rulesDir = join(cwd, ".tokenjuice", "rules", "git");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "ls-files.json"),
      JSON.stringify(
        {
          id: "project/git-ls-files",
          family: "project-git-ls-files",
          match: {
            argv0: ["git"],
            gitSubcommands: ["ls-files"],
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

    const results = await verifyRules({ cwd });
    const projectRule = results.find((result) => result.id === "project/git-ls-files");
    expect(projectRule?.ok).toBe(true);
  });

  it("reports cross-layer shadow warnings in verify", async () => {
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

    const results = await verifyRules({ cwd });
    const builtin = results.find((result) => result.id === "git/status" && result.source === "builtin");
    const project = results.find((result) => result.id === "git/status" && result.source === "project");

    expect(builtin?.ok).toBe(true);
    expect(project?.ok).toBe(true);
    expect(builtin?.warnings).toContain("shadowed by project:git/status");
    expect(project?.warnings).toContain("shadows builtin:git/status");
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

  it("rejects override rules with unsafe strings and invalid summarize values", async () => {
    const cwd = await createTempDir();
    const rulesDir = join(cwd, ".tokenjuice", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "unsafe.json"),
      JSON.stringify(
        {
          id: "unsafe\0rule",
          family: "unsafe",
          description: "bad\0description",
          match: {},
          summarize: {
            head: -1,
            tail: 1.5,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const results = await verifyRules({ cwd });
    const bad = results.find((result) => result.path.endsWith("unsafe.json"));
    expect(bad?.ok).toBe(false);
    expect(bad?.errors.join("\n")).toContain("must not contain NUL bytes");
    expect(bad?.errors.join("\n")).toContain("non-negative integer");
  });

  it("reports malformed override json files in verify", async () => {
    const cwd = await createTempDir();
    const rulesDir = join(cwd, ".tokenjuice", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, "broken.json"), "{ not-valid", "utf8");

    const results = await verifyRules({ cwd });
    const broken = results.find((result) => result.path.endsWith("broken.json"));
    expect(broken?.ok).toBe(false);
    expect(broken?.errors.join("\n")).toContain("Expected property name");
  });

  it("ignores symlinked override rule files", async () => {
    if (process.platform === "win32") {
      return;
    }

    const cwd = await createTempDir();
    const rulesDir = join(cwd, ".tokenjuice", "rules", "git");
    const externalDir = await createTempDir();
    await mkdir(rulesDir, { recursive: true });
    const externalRulePath = join(externalDir, "status.json");
    await writeFile(
      externalRulePath,
      JSON.stringify(
        {
          id: "git/status",
          family: "symlink-rule",
          match: {
            argv0: ["git"],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    const { symlink } = await import("node:fs/promises");
    await symlink(externalRulePath, join(rulesDir, "status.json"));

    const rules = await loadRules({ cwd });
    const gitStatus = rules.find((rule) => rule.rule.id === "git/status");

    expect(gitStatus?.source).toBe("builtin");
    expect(gitStatus?.rule.family).not.toBe("symlink-rule");
  });
});
