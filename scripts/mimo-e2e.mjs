#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProcessRunner } from "./e2e-process.mjs";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "mimo";
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-mimo-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".config", "mimocode");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  USERPROFILE: home,
  PWD: project,
  GIT_CONFIG_NOSYSTEM: "1",
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  MIMOCODE_CONFIG_DIR: configDir,
  MIMOCODE_ONLY_CONFIG_DIR_PLUGINS: "true",
  MIMOCODE_DISABLE_AUTOUPDATE: "true",
  MIMOCODE_DISABLE_DEFAULT_PLUGINS: "true",
  MIMOCODE_DISABLE_MODELS_FETCH: "true",
  MIMOCODE_DISABLE_LSP_DOWNLOAD: "true",
  MIMOCODE_DISABLE_AGENTS_SKILLS: "true",
  MIMOCODE_DISABLE_CLAUDE_CODE_COMMANDS: "true",
  MIMOCODE_ENABLE_ANALYSIS: "false",
  MIMOCODE_MIMO_ONLY: "true",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  SHELL: "/bin/bash",
  NO_PROXY: "127.0.0.1,localhost",
  no_proxy: "127.0.0.1,localhost",
};
const run = createProcessRunner({ cwd: project, env });
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const cases = [
  { id: "status", command: "git status" },
  { id: "exact", command: "cat exact.txt" },
  { id: "inventory", command: "find fixtures -type f" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- git status` },
  { id: "failure", command: `${quote(process.execPath)} failure.mjs 2>&1` },
];
const observed = new Map();
let modelRequests = 0;
let serverError;

function textContent(content) {
  if (typeof content === "string") return content;
  assert.ok(Array.isArray(content));
  assert.ok(content.every((item) => item.type === "text"));
  return content.map((item) => item.text).join("\n");
}

const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    const hasBash = payload.tools?.some((tool) => tool.function?.name === "bash");
    if (hasBash) {
      modelRequests++;
      assert.ok(modelRequests <= cases.length + 2, "native session must advance through the fixed commands");
      const calls = new Map();
      for (const message of payload.messages ?? []) {
        for (const call of message.tool_calls ?? []) {
          if (call.function?.name !== "bash") continue;
          const input = JSON.parse(call.function.arguments);
          const item = cases.find((item) => item.command === input.command);
          if (item) calls.set(call.id, item.id);
        }
      }
      for (const message of payload.messages ?? []) {
        if (message.role === "tool" && calls.has(message.tool_call_id)) {
          observed.set(calls.get(message.tool_call_id), textContent(message.content));
        }
      }
    }
    const next = hasBash ? cases.find((item) => !observed.has(item.id)) : undefined;
    const delta = next ? { role: "assistant", tool_calls: [{
      index: 0, id: next.id, type: "function",
      function: { name: "bash", arguments: JSON.stringify({ command: next.command, description: next.id }) },
    }] } : { role: "assistant", content: "fixture complete" };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const [value, finishReason] of [[delta, null], [{}, next ? "tool_calls" : "stop"]]) {
      response.write(`data: ${JSON.stringify({
        id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture",
        choices: [{ index: 0, delta: value, finish_reason: finishReason }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  } catch (error) {
    serverError = error;
    response.writeHead(500).end("invalid fixture request");
  }
});

async function session() {
  observed.clear();
  modelRequests = 0;
  const result = await run(host, ["run", "--format", "json", "--model", "fixture/fixture", "Run the fixed fixture shell tools."]);
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, result.stderr + result.stdout);
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map(JSON.parse);
  // MiMo repeats updates for the same completed tool; retain the final event.
  const tools = new Map();
  for (const event of events) {
    if (event.type === "tool_use" && event.part?.tool === "bash") {
      tools.set(event.part.callID, event.part);
    }
  }
  assert.equal(tools.size, cases.length);
  for (const item of cases) {
    const part = tools.get(item.id);
    assert.equal(part?.state.status, "completed");
    assert.equal(part.state.input.command, item.command);
    assert.equal(part.state.output, observed.get(item.id), `${item.id}: event and model-visible output must agree`);
    assert.equal(part.state.metadata.exit, item.id === "failure" ? 7 : 0);
    assert.equal(part.state.metadata.truncated, false);
  }
  assert.ok(events.some((event) => event.type === "text" && event.part?.text === "fixture complete"));
  assert.ok(!events.some((event) => event.type === "error"));
  return { observed: new Map(observed), tools };
}

try {
  await mkdir(configDir, { recursive: true });
  await mkdir(join(project, "fixtures"), { recursive: true });
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(project, "fixtures", `example-${i}.txt`), "before\n")));
  const exact = "  exact content\r\ntrailing blanks\n\n";
  await writeFile(join(project, "exact.txt"), exact);
  const failureLines = Array.from({ length: 160 }, (_, i) => `failure-marker-${String(i).padStart(3, "0")}`);
  await writeFile(join(project, "failure.mjs"), [
    'import { writeSync } from "node:fs";',
    `writeSync(1, ${JSON.stringify(failureLines.join("\n") + "\n")});`,
    'writeSync(2, "failure-stderr\\n");',
    'process.exit(7);',
  ].join("\n"));
  await run("git", ["init", "--quiet", "--initial-branch=main", "--template="]);
  await mkdir(join(project, ".git", "info"), { recursive: true });
  await writeFile(join(project, ".git", "info", "exclude"), ".mimocode/\n");
  await run("git", ["add", "."]);
  await run("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture"]);
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(project, "fixtures", `example-${i}.txt`), "after\n")));
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  await writeFile(join(configDir, "mimocode.json"), JSON.stringify({
    model: "fixture/fixture",
    small_model: "fixture/fixture",
    enabled_providers: ["fixture"],
    permission: { bash: "allow" },
    autoupdate: false,
    snapshot: false,
    memory: { disable_write: true },
    compaction: { auto: false },
    provider: { fixture: {
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKey: "fixture-no-secret" },
      models: { fixture: { name: "Fixture", limit: { context: 128000, output: 4096 } } },
    } },
  }));
  const version = (await run(host, ["--version"])).stdout.trim();
  assert.equal(version, "0.1.17");
  const baseline = await session();
  await run(process.execPath, [cli, "install", "mimo-code"]);
  const installed = await session();
  assert.ok(installed.tools.get("status").state.metadata.tokenjuice?.compacted,
    "the real host must discover and invoke the installed hook");
  const status = installed.observed.get("status");
  assert.ok(status.length < baseline.observed.get("status").length);
  assert.match(status, /tokenjuice compacted bash output/u);
  assert.equal(installed.tools.get("status").state.metadata.output, status);
  assert.equal(installed.observed.get("exact"), exact);
  for (const id of ["exact", "inventory", "raw", "failure"]) {
    assert.equal(installed.observed.get(id), baseline.observed.get(id), id);
    assert.equal(installed.tools.get(id).state.metadata.tokenjuice, undefined);
  }
  assert.equal(installed.observed.get("raw"), baseline.observed.get("status"));
  for (const line of failureLines) assert.ok(installed.observed.get("failure").includes(`${line}\n`), line);
  assert.ok(installed.observed.get("failure").includes("failure-stderr\n"));
  const customHook = join(configDir, "hooks", "custom.js");
  const customSource = "export default {};\n";
  await writeFile(customHook, customSource);
  await run(process.execPath, [cli, "uninstall", "mimo-code"]);
  assert.equal(await readFile(customHook, "utf8"), customSource);
  const uninstalled = await session();
  for (const item of cases) assert.equal(uninstalled.observed.get(item.id), baseline.observed.get(item.id), item.id);
  assert.equal(uninstalled.tools.get("status").state.metadata.tokenjuice, undefined);
  process.stdout.write(`${JSON.stringify({
    ok: true, host: "mimo-code", version, sessions: ["baseline", "installed", "uninstalled"],
    modelRequestsPerSession: modelRequests, results: cases.map((item) => item.id),
  })}\n`);
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
