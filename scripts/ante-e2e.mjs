#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "ante";
const root = await realpath(await mkdtemp(join(tmpdir(), "tj-ante-")));
const home = join(root, "home");
const project = join(root, "project");
const bin = join(root, "bin");
const instructions = join(project, "CLAUDE.md");
const env = {
  HOME: home,
  ANTE_HOME: join(home, ".ante"),
  PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  NO_COLOR: "1",
  NO_PROXY: "127.0.0.1,localhost",
  no_proxy: "127.0.0.1,localhost",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
};

async function run(command, args) {
  const child = spawn(command, args, { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "", spawnError, timedOut = false;
  child.stdout.setEncoding("utf8").on("data", chunk => stdout += chunk);
  child.stderr.setEncoding("utf8").on("data", chunk => stderr += chunk);
  child.on("error", error => { spawnError = error; });
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 60_000);
  const killTimer = setTimeout(() => child.kill("SIGKILL"), 62_000);
  try {
    const code = await new Promise(done => child.on("close", done));
    if (spawnError) throw spawnError;
    assert.ok(!timedOut, "native fixture must complete within its deadline");
    assert.equal(code, 0, `${command} exited ${code}\n${stderr}\n${stdout}`);
    return { stdout, stderr };
  } finally { clearTimeout(timer); clearTimeout(killTimer); }
}

const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const custom = "native-ante-custom-instructions-sentinel\n";
const shadow = "native-ante-shadow-instructions-sentinel\n";
const wrapHint = "tokenjuice wrap -- <command>";
const rawHint = "tokenjuice wrap --raw -- <command>";
const exact = "  exact content\r\ntrailing blanks\n\n";
const failureStdout = Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n") + "\n";
const failureStderr = "failure-stderr\n";
const cases = [
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: "tokenjuice wrap --raw -- find fixtures -type f" },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote(`process.stdout.write(${JSON.stringify(failureStdout)}); process.stderr.write(${JSON.stringify(failureStderr)}); process.exit(7);`)}` },
];
const commandFor = (item, guided) => guided && item.id !== "raw"
  ? `tokenjuice wrap${item.id === "failure" ? " --keep-failures" : ""} -- ${item.command}`
  : item.command;
function textContent(content) {
  if (typeof content === "string") return content;
  assert.ok(Array.isArray(content));
  assert.ok(content.every(item => item.type === "text"));
  return content.map(item => item.text).join("");
}

let expected, modelRequests, serverError;
const observed = new Map();
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    modelRequests++;
    assert.ok(modelRequests <= cases.length + 1, "host must make progress");
    assert.ok(payload.tools.some(item => item.function?.name === "Bash"));
    const guidance = payload.messages.filter(item => item.role !== "tool")
      .map(item => textContent(item.content ?? "")).join("\n");
    assert.equal(guidance.includes(custom.trim()), !expected.shadow);
    assert.equal(guidance.includes(shadow.trim()), expected.shadow);
    // Decisions use instructions received from Ante, not the expected phase.
    const guided = guidance.includes(wrapHint) && guidance.includes(rawHint);
    assert.equal(guided, expected.guided);
    const calls = new Map();
    for (const message of payload.messages) {
      for (const call of message.tool_calls ?? []) {
        if (call.function.name !== "Bash") continue;
        const input = JSON.parse(call.function.arguments);
        const item = cases.find(item => commandFor(item, guided) === input.command);
        assert.ok(item, "native history must retain the selected command");
        calls.set(call.id, item.id);
      }
    }
    for (const message of payload.messages) {
      if (message.role === "tool" && calls.has(message.tool_call_id)) {
        observed.set(calls.get(message.tool_call_id), textContent(message.content));
      }
    }
    const item = cases.find(item => !observed.has(item.id));
    const message = item ? { role: "assistant", tool_calls: [{ index: 0, id: item.id, type: "function", function: {
      name: "Bash", arguments: JSON.stringify({ command: commandFor(item, guided), description: `Run disposable ${item.id} fixture`, max_wait_ms: 10_000 }),
    } }] } : { role: "assistant", content: "fixture complete" };
    const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const [delta, reason] of [[message, null], [{}, item ? "tool_calls" : "stop"]]) {
      response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture", choices: [{ index: 0, delta, finish_reason: reason }], usage })}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  } catch (error) {
    serverError ??= error;
    response.writeHead(500).end("invalid fixture request");
  }
});

async function session(guided, isShadow = false) {
  expected = { guided, shadow: isShadow };
  modelRequests = 0;
  observed.clear();
  const result = await run(host, ["--provider", "fixture", "--model", "fixture", "--permission-mode", "auto",
    "--no-session-save", "--disable-auto-memory", "--no-skills", "--tools", "Bash", "--output-format", "json",
    "-p", "Run the disposable fixture tools."]).catch(error => { throw serverError ?? error; });
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1);
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map(line => JSON.parse(line).event);
  assert.ok(events.some(event => event.AgentMessage === "fixture complete"));
  const results = new Map(events.filter(event => event.ToolEnd).map(event => [event.ToolEnd.tool_use_id, event.ToolEnd]));
  for (const item of cases) {
    assert.equal(results.get(item.id)?.tool_name, "Bash");
  }
  return { model: new Map(observed), results };
}

try {
  assert.notEqual(process.platform, "win32", "this fixture requires a POSIX shell");
  for (const path of [env.ANTE_HOME, project, bin, env.TMPDIR, join(project, "fixtures")]) await mkdir(path, { recursive: true });
  await writeFile(join(bin, "tokenjuice"), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(cli)} "$@"\n`, { mode: 0o755 });
  await writeFile(instructions, custom);
  await writeFile(join(project, "exact.txt"), exact);
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(project, "fixtures", `example-${i}.json`), "{}\n")));
  await new Promise(ready => server.listen(0, "127.0.0.1", ready));
  await writeFile(join(env.ANTE_HOME, "catalog.json"), JSON.stringify({ providers: { fixture: {
    base_url: `http://127.0.0.1:${server.address().port}/v1`, wire_style: "OpenAiCompatible", credential: null,
    preferred_models: [{ id: "fixture", context_limit: 128000, max_tokens: 4096, supported_efforts: [] }],
  } } }));
  const version = (await run(host, ["--version"])).stdout.trim();
  assert.equal(version, "ante 0.3.1");
  const baseline = await session(false);
  await run(process.execPath, [cli, "install", "ante"]);
  const installedText = await readFile(instructions, "utf8");
  assert.ok(installedText.includes(custom.trim()));
  await run(process.execPath, [cli, "install", "ante"]);
  assert.equal(await readFile(instructions, "utf8"), installedText);
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "ante", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const installed = await session(true);
  await writeFile(join(project, "AGENTS.md"), shadow);
  assert.deepEqual(await session(false, true), baseline);
  await rm(join(project, "AGENTS.md"));
  await run(process.execPath, [cli, "uninstall", "ante"]);
  assert.equal(await readFile(instructions, "utf8"), custom);
  assert.deepEqual(await session(false), baseline);

  const stdout = result => result.result_json.Completed.stdout;
  assert.deepEqual(new Set(stdout(baseline.results.get("listing")).trimEnd().split("\n")), new Set(Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`)));
  assert.match(stdout(installed.results.get("listing")), /80 matches/u);
  assert.ok(stdout(installed.results.get("listing")).length < stdout(baseline.results.get("listing")).length);
  for (const result of [baseline, installed]) {
    assert.equal(stdout(result.results.get("exact")), exact);
    assert.equal(stdout(result.results.get("raw")), stdout(baseline.results.get("listing")));
    assert.deepEqual(result.results.get("failure"), baseline.results.get("failure"));
    assert.equal(result.model.get("exact"), `status: exited\nexit_code: 0\n\nstdout:\n${exact}`);
    assert.equal(result.model.get("raw"), baseline.model.get("listing"));
  }
  assert.equal(baseline.model.get("failure"), `status: exited\nexit_code: 7\n\nstdout:\n${failureStdout}\n\nstderr:\n${failureStderr}`);
  assert.match(installed.model.get("listing"), /80 matches/u);
  process.stdout.write(`${JSON.stringify({ ok: true, host: "ante", version, level: "native-cli-model-requests", instructions: "fallback/installed/shadowed/uninstalled", listing: "80-entry summary", exactRead: "CRLF and blank lines preserved", raw: "preserved", failureExit: 7 })}\n`);
} finally {
  await new Promise(done => server.close(done));
  await rm(root, { recursive: true, force: true });
}
