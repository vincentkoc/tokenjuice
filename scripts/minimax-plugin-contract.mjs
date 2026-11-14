import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

/** Exercises the packaged command with native-shaped payloads, without a MiniMax host. */
export async function runMiniMaxPluginContracts() {
  assert.notEqual(process.platform, "win32", "MiniMax hook contracts require POSIX shells");
  const root = await mkdtemp(join(tmpdir(), "tokenjuice-minimax-"));
  try {
    const bundle = join(repo, "dist/hosts/minimax-code/bundle");
    const manifest = JSON.parse(await readFile(join(bundle, ".minimax-plugin/plugin.json"), "utf8"));
    const version = JSON.parse(await readFile(join(repo, "package.json"), "utf8")).version;
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.name, "tokenjuice");
    assert.equal(manifest.version, version);
    assert.ok((await readFile(join(bundle, manifest.icon))).byteLength > 0);
    assert.deepEqual(manifest.hooks, ["hooks/hooks.json"]);
    const hooks = JSON.parse(await readFile(join(bundle, manifest.hooks[0]), "utf8"));
    const group = hooks.hooks.PreToolUse[0];
    assert.equal(group.matcher, "bash");
    assert.equal(group.hooks[0].timeout, 5);
    const command = group.hooks[0].command;
    const bin = join(root, "bin");
    await mkdir(bin);
    await mkdir(join(root, "home"));
    await mkdir(join(root, "fixtures"));
    await writeFile(join(bin, "tokenjuice"), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(repo, "dist/cli/main.js"))} "$@"\n`, { mode: 0o755 });
    await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(root, "fixtures", `item-${i}.txt`), "fixture\n")));
    const exact = "  exact CRLF\r\ntrailing blanks\n\n";
    await writeFile(join(root, "exact.txt"), exact);
    const env = {
      PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: join(root, "home"),
      TOKENJUICE_STATS: "off",
      TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
    };
    const shell = (value, input) => {
      const result = spawnSync("/bin/bash", ["-c", value], {
        cwd: root, env, input, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
      });
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      return result;
    };
    const rewrite = (value, extra = {}) => {
      const result = shell(command, JSON.stringify({
        hook_event_name: "PreToolUse", tool_name: "bash", tool_input: { command: value, ...extra },
      }));
      assert.equal(result.status, 0, result.stderr);
      return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput.updatedInput : undefined;
    };
    const input = rewrite("find fixtures -type f", { timeout: 19, description: "list fixtures" });
    assert.equal(input.timeout, 19);
    assert.equal(input.description, "list fixtures");
    const listing = shell(input.command);
    const baseline = shell("find fixtures -type f");
    assert.equal(listing.status, 0, listing.stderr);
    assert.ok(listing.stdout.length < baseline.stdout.length);
    assert.match(listing.stdout, /80 matches/u);
    const read = shell(rewrite("cat exact.txt").command);
    assert.equal(read.status, 0, read.stderr);
    assert.equal(read.stdout, exact);
    assert.equal(rewrite("tokenjuice wrap --raw -- find fixtures -type f"), undefined);
    assert.equal(rewrite("find fixtures -type f", { run_in_background: true }), undefined);
    const raw = shell("tokenjuice wrap --raw -- find fixtures -type f");
    assert.equal(raw.stdout, baseline.stdout);
    const failedCommand = "for i in {1..80}; do printf 'failure-%s\\n' \"$i\"; done; printf 'failure-stderr\\n' >&2; exit 7";
    const failed = shell(rewrite(failedCommand).command);
    const failedBaseline = shell(failedCommand);
    assert.equal(failed.status, 7);
    assert.equal(failed.stdout, failedBaseline.stdout);
    assert.equal(failed.stderr, failedBaseline.stderr);
    const malformed = shell(command, "not json");
    assert.equal(malformed.status, 0);
    assert.equal(malformed.stdout, "");
    return { package: "minimax", input: "preserved", compaction: "observed", rawAndFailure: "preserved", level: "synthetic-hook-contract" };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runMiniMaxPluginContracts())}\n`);
}
