#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const host = resolve(process.argv[2]);
const cli = process.argv[3] ? resolve(process.argv[3]) : fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const bundle = resolve(dirname(cli), "../hosts/deepseek-harness/bundle");
const pnpm = spawnSync("/bin/sh", ["-c", "command -v pnpm"], { encoding: "utf8" });
assert.equal(pnpm.status, 0, "native profile management needs pnpm on PATH");
const root = await mkdtemp(join(tmpdir(), "tokenjuice-deepseek-e2e-"));
const home = join(root, "home");
const project = join(root, "project");
const overlay = join(root, "fixture.patch.yml");
const env = {
  PATH: `${dirname(process.execPath)}:${dirname(pnpm.stdout.trim())}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  DSH_HOME: join(home, ".dsh"),
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  TOKENJUICE_STATS: "off",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  TOKENJUICE_FIXTURE_KEY: "fixture-no-secret",
  GIT_CONFIG_NOSYSTEM: "1",
  SHELL: "/bin/bash",
  TERM: "dumb",
  CI: "1",
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
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${command} exited ${code}\n${stderr}\n${stdout}`));
      else resolveResult({ stdout, stderr });
    });
  });
}

const runHost = args => run(process.execPath, [host, ...args]);
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const failureOutput = Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n") + "\n";
const cases = [
  { id: "status", command: "git status" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- git status` },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote(`process.stdout.write(${JSON.stringify(failureOutput)}); process.stderr.write("failure-stderr\\n"); process.exit(7);`)}` },
];
const observed = new Map();
let modelRequests = 0;
let serverError;
const textContent = value => typeof value === "string" ? value
  : value.filter(block => block.type === "text").map(block => block.text).join("");
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    modelRequests++;
    assert.ok(modelRequests <= cases.length + 1, "native host must advance through the fixture tools");
    assert.ok(payload.tools?.some(tool => tool.function?.name === "bash"), "native executor must expose bash");
    const calls = new Map();
    for (const message of payload.messages ?? []) {
      for (const call of message.tool_calls ?? []) {
        if (call.function?.name !== "bash") continue;
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
    const next = cases.find(item => !observed.has(item.id));
    const delta = next ? { role: "assistant", tool_calls: [{
      index: 0, id: next.id, type: "function",
      function: { name: "bash", arguments: JSON.stringify({ command: next.command, description: `Run disposable fixture ${next.id} command` }) },
    }] } : { role: "assistant", content: "fixture complete" };
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
  const result = await runHost(["--profile", "headless", "--patch", overlay,
    "--json", "--permission-mode", "danger-full-access", "--approval-policy", "never",
    "Run the disposable fixture shell commands."]);
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1);
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map(JSON.parse);
  const toolCalls = events.filter(event => event.type === "tool_call");
  const toolResults = events.filter(event => event.type === "tool_result");
  assert.equal(toolCalls.length, cases.length);
  assert.equal(toolResults.length, cases.length);
  for (let i = 0; i < cases.length; i++) {
    assert.equal(toolCalls[i].tool, "bash");
    assert.equal(toolCalls[i].input.command, cases[i].command);
    assert.equal(toolResults[i].callId, toolCalls[i].callId);
    assert.equal(toolResults[i].result, observed.get(cases[i].id));
  }
  assert.ok(events.some(event => event.type === "final" && event.text === "fixture complete"));
  return new Map(observed);
}

try {
  for (const path of [home, project, env.TMPDIR, join(project, "src")]) await mkdir(path, { recursive: true });
  const exact = "  exact content\r\ntrailing blanks\n\n";
  await writeFile(join(project, "exact.txt"), exact);
  for (let i = 0; i < 80; i++) await writeFile(join(project, "src", `file-${i}.txt`), "original\n");
  await run("git", ["init", "--initial-branch=main"]);
  await run("git", ["add", "."]);
  await run("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--no-gpg-sign", "-m", "fixture"]);
  for (let i = 0; i < 80; i++) await writeFile(join(project, "src", `file-${i}.txt`), "modified\n");
  await new Promise(ready => server.listen(0, "127.0.0.1", ready));
  await writeFile(overlay, JSON.stringify([
    { id: "agent-default-model", config: { provider: "fixture", model: "fixture" } },
    { id: "llm-pi-ai", config: { providers: { fixture: {
      api: "openai-completions", apiKeyEnv: "TOKENJUICE_FIXTURE_KEY",
      baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      models: [{ id: "fixture", contextWindow: 128000, maxTokens: 4096 }],
    } } } },
    ...["llm-deepseek", "llm-deepseek-account", "session-title-llm"].map(id => ({ id, disabled: true })),
  ]));
  const version = (await runHost(["--version"])).stdout.trim();
  assert.equal(version, "0.2.2-alpha.2");
  const baselineConfig = (await runHost(["--profile", "headless", "--dump-config"])).stdout;
  const baseline = await session();
  assert.equal((baseline.get("status").match(/modified:/g) ?? []).length, 80, baseline.get("status"));
  assert.equal(baseline.get("exact"), exact);
  assert.equal(baseline.get("raw"), baseline.get("status"));
  assert.ok(baseline.get("failure").includes(failureOutput));
  assert.ok(baseline.get("failure").includes("failure-stderr\n"));
  assert.match(baseline.get("failure"), /exit[^\n]*7/i);
  console.log(JSON.stringify({ phase: "baseline", version, modelRequests, results: [...baseline.keys()] }));

  // Native profile management must load an isolated, self-contained bundle.
  const isolatedBundle = join(root, "bundle");
  await cp(bundle, isolatedBundle, { recursive: true });
  await runHost(["plugin", "--profile", "headless", "add", isolatedBundle, "--offline", "--ignore-scripts"]);
  const config = (await runHost(["--profile", "headless", "--dump-config"])).stdout;
  assert.ok(config.includes("tokenjuice-deepseek-harness"));
  const installed = await session();
  assert.ok(installed.get("status").length < baseline.get("status").length);
  assert.match(installed.get("status"), /tokenjuice/);
  for (const id of ["exact", "raw", "failure"]) assert.equal(installed.get(id), baseline.get(id), `${id} must remain identical to native baseline`);
  await runHost(["plugin", "--profile", "headless", "remove", "tokenjuice-deepseek-harness"]);
  const removed = (await runHost(["--profile", "headless", "--dump-config"])).stdout;
  assert.equal(removed, baselineConfig, "removal must restore the native baseline composition");
  const manifest = JSON.parse(await readFile(join(env.DSH_HOME, "profiles", "headless", "package.json"), "utf8"));
  assert.equal(manifest.dependencies["tokenjuice-deepseek-harness"], undefined);
  console.log(JSON.stringify({ ok: true, host: "deepseek-harness", version, modelRequests, results: [...installed.keys()] }));
} finally {
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  await rm(root, { recursive: true, force: true });
}
