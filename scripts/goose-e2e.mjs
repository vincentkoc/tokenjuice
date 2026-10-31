#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "goose";
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-goose-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const bin = join(root, "bin");
const env = {
  HOME: home,
  PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  DO_NOT_TRACK: "1",
  GOOSE_PROVIDER: "openai",
  GOOSE_MODEL: "gpt-4o",
  GOOSE_MODE: "auto",
  GOOSE_SHELL: "/bin/bash",
  GOOSE_DISABLE_SESSION_NAMING: "true",
  OPENAI_API_KEY: "fixture-no-secret",
  OPENAI_BASE_PATH: "v1/chat/completions",
  NO_PROXY: "127.0.0.1,localhost",
  no_proxy: "127.0.0.1,localhost",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
};

function run(command, args, extraEnv = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd: project, env: { ...env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 90_000);
    child.stdout.setEncoding("utf8").on("data", chunk => stdout += chunk);
    child.stderr.setEncoding("utf8").on("data", chunk => stderr += chunk);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`timed out running ${command}`));
      else if (code !== 0) reject(new Error(`${command} exited ${code}\n${stderr}\n${stdout}`));
      else resolveResult({ stdout, stderr });
    });
  });
}

const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const customHints = "Project note: native-goose-hints-sentinel.\n";
const wrapHint = "tokenjuice wrap -- <command>";
const rawHint = "tokenjuice wrap --raw -- <command>";
const failureStdout = Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n") + "\n";
const failureStderr = "failure-stderr\n";
const cases = [
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: "tokenjuice wrap --raw -- find fixtures -type f" },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote(`process.stdout.write(${JSON.stringify(failureStdout)}); process.stderr.write(${JSON.stringify(failureStderr)}); process.exit(7);`)}` },
];
// The deterministic model follows guidance only when the native system prompt contains it.
// This qualifies discovery and tool transport, not an arbitrary model's adherence.
const commandFor = (item, guided) => guided && item.id !== "raw"
  ? `tokenjuice wrap${item.id === "failure" ? " --keep-failures" : ""} -- ${item.command}`
  : item.command;
function textContent(content) {
  if (typeof content === "string") return content;
  assert.ok(Array.isArray(content));
  assert.ok(content.every(item => item.type === "text"));
  return content.map(item => item.text).join("");
}

function normalizeFailureOutput(output) {
  assert.equal(typeof output, "string");
  // Goose merges separate pipes; stderr can arrive before, during or after stdout.
  const parts = output.split(failureStderr);
  assert.equal(parts.length, 2, "complete stderr must occur exactly once");
  assert.equal(parts.join(""), `${failureStdout}\nCommand exited with code 7`);
  return `${failureStdout}${failureStderr}\nCommand exited with code 7`;
}

let expectedHints;
let modelRequests = 0;
let serverError;
const observed = new Map();
const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET") {
      assert.equal(request.url, "/v1/models");
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ object: "list", data: [{ id: "gpt-4o", object: "model" }] }));
      return;
    }
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    const system = (payload.messages ?? []).filter(item => item.role === "system").map(item => textContent(item.content)).join("\n");
    const guided = system.includes(wrapHint) && system.includes(rawHint);
    assert.equal(guided, expectedHints.guided, "native hint loading must match the installed state and filename list");
    assert.equal(system.includes(customHints.trim()), expectedHints.custom, "custom project hints must reach the model");
    const shell = payload.tools?.find(item => item.function?.name === "shell");
    assert.ok(shell, "native Developer extension must expose shell");
    modelRequests++;
    assert.ok(modelRequests <= cases.length + 1, "host must make progress through the fixture tools");
    const calls = new Map();
    for (const message of payload.messages ?? []) {
      for (const call of message.tool_calls ?? []) {
        if (call.function?.name !== shell.function.name) continue;
        const input = JSON.parse(call.function.arguments);
        const item = cases.find(item => input.command === commandFor(item, guided));
        if (item) calls.set(call.id, item.id);
      }
    }
    for (const message of payload.messages ?? []) {
      if (message.role === "tool" && calls.has(message.tool_call_id)) {
        observed.set(calls.get(message.tool_call_id), textContent(message.content));
      }
    }
    const next = cases.find(item => !observed.has(item.id));
    const delta = next ? {
      role: "assistant", tool_calls: [{ index: 0, id: next.id, type: "function", function: {
        name: shell.function.name, arguments: JSON.stringify({ command: commandFor(next, guided), timeout_secs: 15 }),
      } }],
    } : { role: "assistant", content: "fixture complete" };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const [value, reason] of [[delta, null], [{}, next ? "tool_calls" : "stop"]]) {
      response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 0, model: "gpt-4o", choices: [{ index: 0, delta: value, finish_reason: reason }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  } catch (error) {
    serverError ??= error;
    response.writeHead(500).end("invalid fixture request");
  }
});

async function session(guided, custom = true, extraEnv = {}) {
  expectedHints = { guided, custom };
  modelRequests = 0;
  observed.clear();
  const result = await run(host, ["run", "--no-profile", "--no-session", "--with-builtin", "developer", "--max-turns", "8", "-t", "Run the disposable fixture tools."], extraEnv).catch(error => { throw serverError ?? error; });
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1);
  assert.equal(observed.size, cases.length);
  assert.match(result.stdout, /fixture complete/u);
  const results = new Map(observed);
  results.set("failure", normalizeFailureOutput(results.get("failure")));
  return results;
}

try {
  assert.notEqual(process.platform, "win32", "this fixture requires a POSIX shell");
  await mkdir(home, { recursive: true });
  await mkdir(bin);
  await mkdir(env.TMPDIR);
  await mkdir(join(project, "fixtures"), { recursive: true });
  await writeFile(join(bin, "tokenjuice"), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(cli)} "$@"\n`, { mode: 0o755 });
  await writeFile(join(project, ".goosehints"), customHints);
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(project, "fixtures", `example-${i}.json`), "{}\n")));
  const exact = "  exact content\r\ntrailing blanks\n\n";
  await writeFile(join(project, "exact.txt"), exact);
  await new Promise(ready => server.listen(0, "127.0.0.1", ready));
  env.OPENAI_HOST = `http://127.0.0.1:${server.address().port}`;
  const version = (await run(host, ["--version"])).stdout.trim();
  assert.equal(version, "1.57.0");
  const baseline = await session(false);
  await run(process.execPath, [cli, "install", "goose"]);
  const installedHints = await readFile(join(project, ".goosehints"), "utf8");
  assert.ok(installedHints.includes(customHints.trim()));
  await run(process.execPath, [cli, "install", "goose"]);
  assert.equal(await readFile(join(project, ".goosehints"), "utf8"), installedHints);
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "goose", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const installed = await session(true);
  const ignored = await session(false, false, { CONTEXT_FILE_NAMES: '["IGNORED.md"]' });
  assert.deepEqual(ignored, baseline);
  await run(process.execPath, [cli, "uninstall", "goose"]);
  assert.equal(await readFile(join(project, ".goosehints"), "utf8"), customHints);
  assert.deepEqual(await session(false), baseline);

  assert.deepEqual(new Set(baseline.get("listing").trimEnd().split("\n")), new Set(Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`)));
  assert.match(installed.get("listing"), /80 matches/u);
  assert.ok(installed.get("listing").length < baseline.get("listing").length);
  // Goose normalizes trailing blank lines before serializing a shell result.
  assert.equal(baseline.get("exact"), "  exact content\r\ntrailing blanks\n");
  for (const results of [baseline, installed]) {
    assert.equal(results.get("exact"), baseline.get("exact"));
    assert.equal(results.get("raw"), baseline.get("listing"));
    assert.equal(results.get("failure"), `${failureStdout}${failureStderr}\nCommand exited with code 7`);
  }
  assert.deepEqual(installed.get("failure"), baseline.get("failure"));
  process.stdout.write(`${JSON.stringify({ ok: true, host: "goose", version, level: "native-cli-model-requests", hints: "installed/ignored/uninstalled", listing: "80-entry summary", exactRead: "native normalization preserved", raw: "preserved", failureExit: 7 })}\n`);
} finally {
  await new Promise(done => server.close(done));
  await rm(root, { recursive: true, force: true });
}
