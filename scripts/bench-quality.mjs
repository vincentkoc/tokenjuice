#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encode as o200k } from "gpt-tokenizer/encoding/o200k_base";
import { encode as cl100k } from "gpt-tokenizer/encoding/cl100k_base";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const home = await mkdtemp(join(tmpdir(), "tokenjuice-quality-"));
const env = {
  PATH: dirname(process.execPath),
  ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  HOME: home,
  USERPROFILE: home,
  CODEX_HOME: join(home, ".codex"),
  XDG_CONFIG_HOME: join(home, ".config"),
  TOKENJUICE_ARTIFACT_DIR: join(home, "artifacts"),
  TOKENJUICE_STATS: "0",
  TOKENJUICE_NO_OMISSION: "0",
};

function run(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: home, env, input, encoding: "utf8", timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, "CLI terminated by a signal");
  return result;
}

function wrap(raw, { failure = false, tee = false } = {}) {
  const args = ["wrap", ...(failure ? ["--keep-failures"] : []), ...(tee ? ["--tee"] : []), "--", process.execPath, "-e",
    `process.stdout.write(${JSON.stringify(raw)});process.exitCode=${failure ? 7 : 0}`];
  const result = run(args);
  assert.equal(result.status, failure ? 7 : 0);
  assert.equal(result.stderr, "");
  return result.stdout;
}

function hook(command, raw, { tool = "Bash", exitCode = 0 } = {}) {
  const payload = { hook_event_name: "PostToolUse", tool_name: tool, tool_input: { command }, tool_response: raw,
    ...(exitCode === null ? {} : { exit_code: exitCode }) };
  const result = run(["codex-post-tool-use"], `${JSON.stringify(payload)}\n`);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  if (!result.stdout.trim()) return { text: raw, rewritten: false };
  const response = JSON.parse(result.stdout);
  assert.equal(response.continue, false);
  assert.equal(typeof response.stopReason, "string");
  return { text: response.stopReason, rewritten: true };
}

const rows = [];
function record(name, surface, raw, delivered, check) {
  check(delivered);
  rows.push({ name, surface, raw, delivered });
}

try {
  const long = Array.from({ length: 80 }, (_, index) => `step ${index}: ${"build output ".repeat(8)}`).join("\n") + "\n";
  record("long-wrapper-output", "CLI stdout", long, wrap(long), (text) => {
    assert.ok(text.includes("step 0:"));
    assert.ok(text.includes("step 79:"));
    assert.ok(text.includes("[tokenjuice]"), "count the compaction notice too");
  });
  record("short-wrapper-output", "CLI stdout", "done\n", wrap("done\n"), (text) => assert.equal(text, "done\n"));
  record("failed-wrapper-passthrough", "CLI stdout", long, wrap(long, { failure: true }), (text) => assert.equal(text, long));
  record("tee-wrapper-overhead", "CLI stdout", long, wrap(long, { tee: true }), (text) => {
    assert.ok(text.startsWith(long));
    assert.ok(o200k(text).length > o200k(long).length, "tee expansion must stay visible");
  });

  const status = "On branch quality-fixture\nChanges not staged for commit:\n\tmodified:   src/雪.ts\n\tmodified:   src/quoted-file.ts\n\nno changes added to commit\n";
  const rewritten = hook("git status", status);
  assert.equal(rewritten.rewritten, true, "exercise the actual Codex envelope");
  record("codex-status-envelope", "Codex stopReason", status, rewritten.text, (text) => {
    assert.ok(text.includes("src/雪.ts"));
    assert.ok(text.includes("src/quoted-file.ts"));
  });
  for (const [name, command, options] of [
    ["file-inspection-passthrough", "cat exact.txt", {}],
    ["raw-bypass-passthrough", "tokenjuice wrap --raw -- git status", {}],
    ["unsupported-tool-passthrough", "git status", { tool: "Read" }],
    ["missing-exit-passthrough", "git status", { exitCode: null }],
  ]) {
    const result = hook(command, status, options);
    assert.equal(result.rewritten, false, name);
    record(name, "Codex original tool text", status, result.text, (text) => assert.equal(text, status));
  }
  assert.ok(!(await readdir(home)).includes("artifacts"), "quality runs must not persist output or statistics");

  const reports = Object.entries({ o200k_base: o200k, cl100k_base: cl100k }).map(([encoding, encode]) => {
    const cases = rows.map(({ name, surface, raw, delivered }) => {
      const rawTokens = encode(raw).length;
      const deliveredTokens = encode(delivered).length;
      return { name, surface, rawTokens, deliveredTokens, savedTokens: rawTokens - deliveredTokens };
    });
    const rawTokens = cases.reduce((sum, row) => sum + row.rawTokens, 0);
    const deliveredTokens = cases.reduce((sum, row) => sum + row.deliveredTokens, 0);
    return { encoding, rawTokens, deliveredTokens, savedTokens: rawTokens - deliveredTokens, cases };
  });
  console.log(JSON.stringify({ scope: "fixed host-output fixtures; excludes provider billing and conversation history", reports }, null, 2));
} finally {
  await rm(home, { recursive: true, force: true });
}
