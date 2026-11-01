#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProcessRunner } from "./e2e-process.mjs";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "t3";
const provider = process.argv[3] ? resolve(process.argv[3]) : "claude";
const root = await realpath(await mkdtemp(join(tmpdir(), "tj-t3-claude-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(root, "custom-claude-home");
const baseDir = join(root, "t3-data");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  DISABLE_AUTOUPDATER: "1",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  SHELL: "/bin/bash",
  DO_NOT_TRACK: "1",
  NO_PROXY: "127.0.0.1,localhost",
  no_proxy: "127.0.0.1,localhost",
};

const run = createProcessRunner({ cwd: project, env });
const configure = createProcessRunner({ cwd: project, env: { ...env, CLAUDE_CONFIG_DIR: configDir } });

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const failureOutput = Array.from({ length: 80 }, (_, index) => `failure-${index}`).join("\n") + "\n";
const failureStderr = "failure-stderr\n";
const cases = [
  { id: "environment", command: `${quote(process.execPath)} -e ${quote("console.log(JSON.stringify({home:process.env.HOME,config:process.env.CLAUDE_CONFIG_DIR}))")}` },
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- find fixtures -type f` },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote(`process.stdout.write(${JSON.stringify(failureOutput)}); process.stderr.write(${JSON.stringify(failureStderr)}); process.exit(7);`)}` },
];
const text = (content) => typeof content === "string" ? content : content?.map((block) => block.text ?? "").join("");
const observed = new Map();
let modelRequests = 0;
let serverError;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, "POST");
    assert.equal(request.headers.authorization, "Bearer fixture-no-secret", "selected instance must supply fixture authentication");
    const path = new URL(request.url, "http://fixture").pathname;
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    if (path === "/v1/messages/count_tokens") {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ input_tokens: 1 }));
      return;
    }
    assert.equal(path, "/v1/messages");
    const hasBash = payload.tools?.some((tool) => tool.name === "Bash");
    if (hasBash) {
      assert.ok(JSON.stringify(payload.messages).includes("native-t3-fixture-sentinel"), "T3 must forward the fresh thread message");
      modelRequests++;
      assert.ok(modelRequests <= cases.length + 2, "host must make progress through the fixture tools");
      for (const message of payload.messages ?? []) {
        if (message.role !== "user" || !Array.isArray(message.content)) continue;
        for (const block of message.content) {
          if (block.type === "tool_result") observed.set(block.tool_use_id, block);
        }
      }
    }
    const next = hasBash ? cases.find((item) => !observed.has(item.id)) : undefined;
    const content = next
      ? { type: "tool_use", id: next.id, name: "Bash", input: { command: next.command, description: next.id } }
      : { type: "text", text: "fixture complete" };
    const message = {
      id: "msg_fixture", type: "message", role: "assistant", model: payload.model,
      content: [content], stop_reason: next ? "tool_use" : "end_turn", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    if (!payload.stream) {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(message));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = (event) => response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    send({ type: "message_start", message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } });
    send({ type: "content_block_start", index: 0, content_block: next ? { ...content, input: {} } : { type: "text", text: "" } });
    send({ type: "content_block_delta", index: 0, delta: next
      ? { type: "input_json_delta", partial_json: JSON.stringify(content.input) }
      : { type: "text_delta", text: content.text } });
    send({ type: "content_block_stop", index: 0 });
    send({ type: "message_delta", delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: 1 } });
    send({ type: "message_stop" });
    response.end();
  } catch (error) {
    serverError = error;
    response.writeHead(500).end("invalid fixture request");
  }
});

async function session() {
  observed.clear();
  modelRequests = 0;
  const result = await run(host, ["thread", "start", "--base-dir", baseDir,
    "--provider", "fixture-claude", "--model", "claude-sonnet-4-6", "--wait", "--json",
    project, "native-t3-fixture-sentinel: run only the disposable fixture shell tools."]);
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "host must deliver every tool result in a follow-up model request");
  assert.equal(observed.size, cases.length);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "completed");
  assert.equal(receipt.error, null);
  const environment = observed.get("environment");
  assert.equal(environment.is_error, false);
  // Claude may append a system reminder after the command's first output line.
  assert.deepEqual(JSON.parse(text(environment.content).split("\n", 1)[0]), { home, config: configDir },
    "T3 must select the custom config directory while retaining its private HOME");
  return new Map(observed);
}

let daemon, daemonClosed;
async function stopDaemon() {
  if (!daemon || daemon.exitCode !== null) return;
  daemon.kill("SIGTERM");
  const timer = setTimeout(() => daemon.kill("SIGKILL"), 2000);
  try { await daemonClosed; } finally { clearTimeout(timer); }
}

try {
  assert.notEqual(process.platform, "win32", "this fixture requires a POSIX shell");
  await mkdir(join(baseDir, "userdata"), { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await mkdir(env.TMPDIR, { recursive: true });
  await mkdir(join(project, "fixtures"), { recursive: true });
  await Promise.all(Array.from({ length: 80 }, (_, index) =>
    writeFile(join(project, "fixtures", `example-${index}.json`), "{}\n")));
  await writeFile(join(project, "exact.txt"), "  exact content\r\ntrailing blanks\n\n");
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  const version = (await run(host, ["--version"])).stdout.trim();
  const providerVersion = (await run(provider, ["--version"])).stdout.trim();
  assert.equal(version, "t3 v0.1.6");
  assert.equal(providerVersion, "2.1.316 (Claude Code)");
  await writeFile(join(configDir, "settings.json"), JSON.stringify({ permissions: { allow: ["Bash"] } }));
  const originalSettings = await readFile(join(configDir, "settings.json"), "utf8");
  await writeFile(join(baseDir, "userdata", "settings.json"), JSON.stringify({ providerInstances: {
    "fixture-claude": { driver: "claudeAgent", enabled: true,
      environment: [
        { name: "ANTHROPIC_BASE_URL", value: `http://127.0.0.1:${server.address().port}`, sensitive: false },
        { name: "ANTHROPIC_AUTH_TOKEN", value: "fixture-no-secret", sensitive: true },
      ],
      config: { binaryPath: provider, homePath: configDir, customModels: [] },
    },
  } }));
  // T3 rejects port 0; reserve a loopback port and fail if our server cannot bind it.
  const portProbe = createServer();
  await new Promise(ready => portProbe.listen(0, "127.0.0.1", ready));
  const port = portProbe.address().port;
  await new Promise(done => portProbe.close(done));
  daemon = spawn(host, ["serve", "--base-dir", baseDir, "--host", "127.0.0.1", "--port", String(port)],
    { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "", spawnError;
  daemon.stdout.setEncoding("utf8").on("data", chunk => logs += chunk);
  daemon.stderr.setEncoding("utf8").on("data", chunk => logs += chunk);
  daemon.on("error", error => { spawnError = error; });
  daemonClosed = new Promise(done => daemon.on("close", done));
  let ready = false;
  for (let i = 0; i < 300; i++) {
    if (spawnError) throw spawnError;
    assert.equal(daemon.exitCode, null, "private T3 server must remain running");
    if (logs.includes(`http://127.0.0.1:${port}`)) { ready = true; break; }
    await delay(100);
  }
  assert.ok(ready, "private T3 server must become ready");
  await run(host, ["project", "add", "--base-dir", baseDir, project]);
  const baseline = await session();
  const expectedEntries = new Set(Array.from({ length: 80 }, (_, index) => `fixtures/example-${index}.json`));
  for (const id of ["listing", "raw"]) {
    const nativeResult = baseline.get(id);
    assert.equal(nativeResult.is_error, false, `${id}: native fixture must succeed`);
    const entries = text(nativeResult.content).match(/^fixtures\/example-\d+\.json$/gmu) ?? [];
    assert.equal(entries.length, 80, `${id}: native fixture must return exactly 80 entries`);
    assert.deepEqual(new Set(entries), expectedEntries, `${id}: native fixture must retain every file`);
  }
  assert.equal(baseline.get("exact").is_error, false, "native exact read must succeed");
  assert.ok(text(baseline.get("exact").content).startsWith("exact content\r\ntrailing blanks"), "native exact read must succeed");
  await configure(process.execPath, [cli, "install", "claude-code", "--local"]);
  const doctor = JSON.parse((await configure(process.execPath, [cli, "doctor", "claude-code", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const installed = await session();
  assert.equal(installed.get("listing").is_error, false, "compacted listing must succeed");
  const listing = text(installed.get("listing").content);
  assert.ok(listing.includes("80 matches"), "installed hook must compact the real shell listing before model delivery");
  assert.ok(listing.length < text(baseline.get("listing").content).length);
  assert.deepEqual(installed.get("exact"), baseline.get("exact"), "hook must preserve the host's native exact-read result");
  assert.deepEqual(installed.get("raw"), baseline.get("raw"), "raw bypass must preserve the native result");
  // Failed commands retain native streams and the host protocol failure flag.
  assert.equal(baseline.get("failure").is_error, true, "native failure fixture must fail");
  assert.equal(installed.get("failure").is_error, true, "host must retain the shell failure flag");
  assert.ok(text(installed.get("failure").content).includes(failureOutput.trimEnd()), "model must receive all 80 failure lines");
  assert.deepEqual(installed.get("failure"), baseline.get("failure"), "automatic wrapping must preserve the native failed result");
  assert.ok(text(installed.get("failure").content).includes("failure-stderr"), "model must receive failure stderr");
  assert.ok(text(installed.get("failure").content).includes("Exit code 7"), "model must receive shell failure status");
  await configure(process.execPath, [cli, "uninstall", "claude-code"]);
  const remainingSettings = JSON.parse(await readFile(join(configDir, "settings.json"), "utf8"));
  // The installer retains its empty hooks container after removing owned events.
  assert.deepEqual(remainingSettings.hooks, {}, "uninstall must remove owned hook configuration");
  delete remainingSettings.hooks;
  assert.deepEqual(remainingSettings, JSON.parse(originalSettings), "uninstall must preserve custom settings");
  const uninstalled = await session();
  assert.deepEqual(uninstalled, baseline, "a fresh T3 thread must return to the complete native baseline after uninstall");
  process.stdout.write(`${JSON.stringify({ ok: true, host: "t3", version, provider: "claude-code", providerVersion,
    sessions: ["baseline", "installed", "uninstalled"], modelRequestsPerSession: modelRequests,
    results: [...installed.keys()] }, null, 2)}\n`);
} finally {
  await stopDaemon();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
