#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "opencode2";
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-opencode-v2-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".config", "opencode");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  PWD: project,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  OPENCODE_CONFIG_DIR: configDir,
  TMPDIR: join(root, "tmp"),
  GIT_CONFIG_NOSYSTEM: "1",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  SHELL: "/bin/bash",
  NO_PROXY: "127.0.0.1,localhost",
  no_proxy: "127.0.0.1,localhost",
};

async function run(command, args, timeout = 90_000) {
  return await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`timed out running ${command}\n${stderr}\n${stdout}`));
    }, timeout);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${command} exited ${code}\n${stderr}\n${stdout}`));
      else resolveResult({ stdout, stderr });
    });
  });
}

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const cases = [
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
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    const shellTool = payload.tools?.find(tool => tool.function?.name === "shell");
    if (shellTool) {
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

async function session() {
  observed.clear();
  modelRequests = 0;
  const result = await run(host, ["run", "--standalone", "--format", "json", "--model", "fixture/fixture", "Run the disposable fixture shell tools."]);
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, result.stderr + result.stdout);
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map(JSON.parse);
  const tools = events.filter(event => event.type === "tool_use");
  assert.equal(tools.length, cases.length);
  for (let i = 0; i < cases.length; i++) {
    const { tool, state } = tools[i].part;
    assert.equal(tool, "shell");
    assert.equal(state.status, "completed");
    assert.equal(state.input.command, cases[i].command);
    assert.equal(i === cases.length - 1 ? `${state.output}\nExited with code 7` : state.output,
      observed.get(cases[i].id));
    assert.equal(textContent(state.metadata.content), observed.get(cases[i].id));
    assert.equal(state.metadata.metadata.exit, i === cases.length - 1 ? 7 : 0);
    assert.equal(state.metadata.metadata.truncated, false);
  }
  assert.ok(events.some(event => event.type === "text" && event.part?.text === "fixture complete"));
  assert.ok(!events.some(event => event.type === "error"));
  return { observed: new Map(observed), events };
}

try {
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
  const version = (await run(host, ["--version"])).stdout.trim();
  assert.equal(version, "opencode v2.0.18");
  const baseline = await session();
  await run(process.execPath, [cli, "install", "opencode-v2"]);
  const installed = await session();
  for (let i = 0; i < 80; i++) assert.ok(baseline.observed.get("status").includes(`fixtures/example-${i}.txt`));
  assert.ok(installed.observed.get("status").length < baseline.observed.get("status").length);
  assert.match(installed.observed.get("status"), /lines omitted/u);
  assert.equal(installed.observed.get("exact"), exact);
  for (const id of ["exact", "inventory", "raw", "failure"]) assert.equal(installed.observed.get(id), baseline.observed.get(id), id);
  assert.equal(installed.observed.get("raw"), baseline.observed.get("status"));
  assert.ok(installed.observed.get("wrapped").length < baseline.observed.get("status").length);
  assert.equal(installed.observed.get("wrapped"), baseline.observed.get("wrapped"));
  assert.deepEqual(new Set(installed.observed.get("inventory").trimEnd().split("\n")),
    new Set(Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.txt`)));
  assert.ok(installed.observed.get("failure").includes(Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n")));
  assert.ok(installed.observed.get("failure").includes("failure-stderr"));
  process.stdout.write(`${JSON.stringify({ ok: true, host: "opencode-v2", version, modelRequestsPerSession: modelRequests })}\n`);
} finally {
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  await rm(root, { recursive: true, force: true });
}
