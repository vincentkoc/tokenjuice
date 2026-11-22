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
const provider = process.argv[3] ? resolve(process.argv[3]) : "opencode2";
const root = await realpath(await mkdtemp(join(tmpdir(), "tj-t3-opencode-v2-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(root, "custom-opencode-config");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  PWD: project,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  GIT_CONFIG_NOSYSTEM: "1",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  SHELL: "/bin/bash",
  DO_NOT_TRACK: "1",
  NO_PROXY: "127.0.0.1,localhost",
  no_proxy: "127.0.0.1,localhost",
};

const run = createProcessRunner({ cwd: project, env });
const configure = createProcessRunner({ cwd: project, env: { ...env, OPENCODE_CONFIG_DIR: configDir } });

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const cases = [
  { id: "environment", command: `${quote(process.execPath)} -e ${quote("console.log(JSON.stringify({home:process.env.HOME,config:process.env.OPENCODE_CONFIG_DIR}))")}` },
  { id: "status", command: "git status" },
  { id: "exact", command: "cat exact.txt" },
  { id: "inventory", command: "find fixtures -type f" },
  { id: "wrapped", command: `${quote(process.execPath)} ${quote(cli)} wrap -- git status` },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- git status` },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote("process.stdout.write(Array.from({ length: 80 }, (_, i) => 'failure-' + i).join('\\n') + '\\n'); process.stderr.write('failure-stderr\\n'); process.exit(7)")}` },
];

function textContent(content) {
  if (typeof content === "string") return content;
  assert.ok(Array.isArray(content));
  assert.ok(content.every(item => item.type === "text"));
  return content.map(item => item.text).join("\n");
}

const observed = new Map();
let modelRequests = 0;
let serverError;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    const shellTool = payload.tools?.find(tool => tool.function?.name === "shell");
    if (shellTool) {
      assert.ok(JSON.stringify(payload.messages).includes("native-t3-opencode-fixture-sentinel"), "T3 must forward the fresh thread message");
      modelRequests++;
      assert.ok(modelRequests <= cases.length + 2, "host must make progress through the fixture tools");
      const calls = new Map();
      for (const message of payload.messages ?? []) {
        for (const call of message.tool_calls ?? []) {
          if (call.function?.name !== "shell") continue;
          const input = JSON.parse(call.function.arguments);
          const item = cases.find(item => item.command === input.command);
          if (item) calls.set(call.id, item.id);
        }
      }
      for (const message of payload.messages ?? []) {
        if (message.role === "tool" && calls.has(message.tool_call_id)) {
          observed.set(calls.get(message.tool_call_id), textContent(message.content));
        }
      }
    }
    const next = shellTool ? cases.find(item => !observed.has(item.id)) : undefined;
    const delta = next
      ? { role: "assistant", tool_calls: [{
          index: 0, id: next.id, type: "function",
          function: { name: "shell", arguments: JSON.stringify({ command: next.command, workdir: project }) },
        }] }
      : { role: "assistant", content: "fixture complete" };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (value, finishReason) => `data: ${JSON.stringify({
      id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture",
      choices: [{ index: 0, delta: value, finish_reason: finishReason }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })}\n\n`;
    response.write(chunk(delta, null));
    response.write(chunk({}, next ? "tool_calls" : "stop"));
    response.end("data: [DONE]\n\n");
  } catch (error) {
    serverError = error;
    response.writeHead(500).end("invalid fixture request");
  }
});

let daemon, daemonClosed;
async function stopDaemon() {
  if (!daemon) return;
  if (!daemon.pid) {
    await daemonClosed;
    daemon = undefined;
    return;
  }
  const signalGroup = signal => {
    try { process.kill(-daemon.pid, signal); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  // Each server gets its own process group, including the managed OpenCode child.
  signalGroup("SIGTERM");
  const timer = setTimeout(() => signalGroup("SIGKILL"), 5000);
  try { await daemonClosed; } finally { clearTimeout(timer); }
  signalGroup("SIGKILL");
  daemon = undefined;
}

async function session(phase) {
  observed.clear();
  modelRequests = 0;
  const baseDir = join(root, `t3-${phase}`);
  await mkdir(join(baseDir, "userdata"), { recursive: true });
  await writeFile(join(baseDir, "userdata", "settings.json"), JSON.stringify({ providerInstances: {
    "fixture-opencode": { driver: "opencode", enabled: true,
      environment: [{ name: "OPENCODE_CONFIG_DIR", value: configDir, sensitive: false }],
      config: { binaryPath: provider },
    },
  } }));
  // T3 rejects port 0. A bind failure must not attach to another local instance.
  const portProbe = createServer();
  await new Promise(ready => portProbe.listen(0, "127.0.0.1", ready));
  const port = portProbe.address().port;
  await new Promise(done => portProbe.close(done));
  daemon = spawn(host, ["serve", "--base-dir", baseDir, "--host", "127.0.0.1", "--port", String(port)],
    { cwd: project, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "", spawnError;
  daemon.stdout.setEncoding("utf8").on("data", chunk => logs += chunk);
  daemon.stderr.setEncoding("utf8").on("data", chunk => logs += chunk);
  daemon.on("error", error => { spawnError = error; });
  daemonClosed = new Promise(done => daemon.on("close", done));
  try {
    let ready = false;
    for (let i = 0; i < 300; i++) {
      if (spawnError) throw spawnError;
      assert.equal(daemon.exitCode, null, "private T3 server must remain running");
      if (logs.includes(`http://127.0.0.1:${port}`)) { ready = true; break; }
      await delay(100);
    }
    assert.ok(ready, "private T3 server must become ready");
    await run(host, ["project", "add", "--base-dir", baseDir, project]);
    const result = await run(host, ["thread", "start", "--base-dir", baseDir,
      "--provider", "fixture-opencode", "--model", "fixture/fixture", "--wait", "--json",
      project, "native-t3-opencode-fixture-sentinel: run only the disposable fixture shell tools."]);
    assert.ifError(serverError);
    assert.equal(modelRequests, cases.length + 1, "every tool result must reach a follow-up model request");
    assert.equal(observed.size, cases.length);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.status, "completed");
    assert.equal(receipt.error, null);
    assert.deepEqual(JSON.parse(observed.get("environment")), { home, config: configDir },
      "the custom provider environment must reach the native shell without replacing HOME");
    return new Map(observed);
  } finally {
    await stopDaemon();
  }
}

try {
  assert.notEqual(process.platform, "win32", "this fixture requires POSIX process groups");
  await mkdir(home, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await mkdir(env.TMPDIR, { recursive: true });
  await mkdir(join(project, "fixtures"), { recursive: true });
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(project, "fixtures", `example-${i}.txt`), "before\n")));
  const exact = "  exact content\r\ntrailing blanks\n\n";
  await writeFile(join(project, "exact.txt"), exact);
  await run("git", ["init", "--quiet", "--initial-branch=main", "--template="]);
  await run("git", ["add", "."]);
  await run("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture"]);
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(project, "fixtures", `example-${i}.txt`), "after\n")));
  await new Promise(ready => server.listen(0, "127.0.0.1", ready));
  await writeFile(join(configDir, "opencode.json"), JSON.stringify({
    update: "disable",
    snapshots: false,
    model: "fixture/fixture",
    permissions: [{ action: "shell", resource: "*", effect: "allow" }],
    providers: { fixture: {
      name: "Fixture",
      package: "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKey: "fixture-no-secret" },
      models: { fixture: { name: "Fixture" } },
    } },
  }));
  const originalConfig = await readFile(join(configDir, "opencode.json"), "utf8");
  const version = (await run(host, ["--version"])).stdout.trim();
  const providerVersion = (await run(provider, ["--version"])).stdout.trim();
  assert.equal(version, "t3 v0.1.6");
  assert.equal(providerVersion, "opencode v2.0.18");
  const baseline = await session("baseline");
  await configure(process.execPath, [cli, "install", "opencode-v2"]);
  const doctor = JSON.parse((await configure(process.execPath, [cli, "doctor", "opencode-v2", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const installed = await session("installed");
  for (let i = 0; i < 80; i++) assert.ok(baseline.get("status").includes(`fixtures/example-${i}.txt`));
  assert.ok(installed.get("status").length < baseline.get("status").length);
  assert.match(installed.get("status"), /lines omitted/u);
  assert.equal(installed.get("exact"), exact);
  for (const id of ["exact", "inventory", "raw", "failure"]) assert.equal(installed.get(id), baseline.get(id), id);
  assert.equal(installed.get("raw"), baseline.get("status"));
  assert.ok(installed.get("wrapped").length < baseline.get("status").length);
  assert.equal(installed.get("wrapped"), baseline.get("wrapped"));
  assert.deepEqual(new Set(installed.get("inventory").trimEnd().split("\n")),
    new Set(Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.txt`)));
  assert.ok(installed.get("failure").includes(Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n")));
  assert.ok(installed.get("failure").includes("failure-stderr"));
  assert.ok(installed.get("failure").includes("Exited with code 7"), "native failure status must reach the model");
  await configure(process.execPath, [cli, "uninstall", "opencode-v2"]);
  const removedDoctor = JSON.parse((await configure(process.execPath, [cli, "doctor", "opencode-v2", "--format", "json"])).stdout);
  assert.equal(removedDoctor.status, "disabled");
  assert.equal(await readFile(join(configDir, "opencode.json"), "utf8"), originalConfig, "custom provider configuration must survive the plugin lifecycle");
  const uninstalled = await session("uninstalled");
  assert.deepEqual(uninstalled, baseline, "restarting T3 after uninstall must restore complete native results");
  process.stdout.write(`${JSON.stringify({ ok: true, host: "t3", version, provider: "opencode-v2", providerVersion,
    sessions: ["baseline", "installed", "uninstalled"], modelRequestsPerSession: modelRequests,
    results: [...installed.keys()] })}\n`);
} finally {
  await stopDaemon();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  await rm(root, { recursive: true, force: true });
}
