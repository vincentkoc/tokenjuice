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
} from "../src/index.js";

const tempDirs: string[] = [];

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
      "build/esbuild",
      "build/tsc",
      "build/tsdown",
      "build/vite",
      "build/webpack",
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
      "devops/kubectl-describe",
      "devops/kubectl-get",
      "devops/kubectl-logs",
      "filesystem/find",
      "filesystem/ls",
      "git/branch",
      "git/diff-name-only",
      "git/diff-stat",
      "git/log-oneline",
      "git/remote-v",
      "git/show",
      "git/stash-list",
      "git/status",
      "install/bun-install",
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
      "package/apt-install",
      "package/apt-upgrade",
      "package/brew-install",
      "package/brew-upgrade",
      "package/dnf-install",
      "package/yum-install",
      "search/git-grep",
      "search/grep",
      "search/rg",
      "service/journalctl",
      "service/launchctl",
      "service/lsof",
      "service/netstat",
      "service/service",
      "service/ss",
      "service/systemctl-status",
      "system/df",
      "system/du",
      "system/file",
      "system/ps",
      "task/just",
      "task/make",
      "tests/bun-test",
      "tests/cargo-test",
      "tests/go-test",
      "tests/jest",
      "tests/mocha",
      "tests/npm-test",
      "tests/playwright",
      "tests/pnpm-test",
      "tests/pytest",
      "tests/vitest",
      "tests/yarn-test",
      "transfer/rsync",
      "transfer/scp",
      "generic/fallback",
    ]);
  });

  it("verifies builtin rules cleanly", async () => {
    const results = await verifyBuiltinRules();
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("loads builtin fixtures successfully", async () => {
    const fixtures = await loadBuiltinFixtures();
    expect(fixtures).toHaveLength(95);
  });

  it("verifies builtin fixtures cleanly", async () => {
    const results = await verifyBuiltinFixtures();
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
});
