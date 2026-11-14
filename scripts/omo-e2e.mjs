#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProcessRunner } from "./e2e-process.mjs";

const host = resolve(process.argv[2]);
const cli = process.argv[3] ? resolve(process.argv[3]) : fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-omo-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const defaultAgentDir = join(home, ".omo", "agent");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, USERPROFILE: home,
  XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"), XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"), OMO_RUNTIME: "node", PI_OFFLINE: "1",
  TOKENJUICE_STATS: "off", TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  GIT_CONFIG_NOSYSTEM: "1", SHELL: "/bin/bash", TERM: "dumb", CI: "1",
};
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const failureOutput = Array.from({ length: 80 }, (_, i) => `failure-output-line-${i}-must-remain-complete`).join("\n") + "\n";
const cases = [
  { id: "status", command: "git status --short" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- git status --short` },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote(`process.stdout.write(${JSON.stringify(failureOutput)}); process.stderr.write("failure-stderr\\n"); process.exit(7);`)}` },
];
const observed = new Map();
let modelRequests = 0;
let totalModelRequests = 0;
let serverError;
const text = content => typeof content === "string" ? content
  : content.filter(block => block.type === "text").map(block => block.text).join("");
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(request.headers.authorization, "Bearer fixture-no-secret");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    totalModelRequests++;
    assert.ok(++modelRequests <= cases.length + 4, `OmO must advance through fixture commands; observed=${[...observed.keys()].join(",")}`);
    const calls = new Map();
    for (const message of payload.messages ?? []) {
      for (const call of message.tool_calls ?? []) {
        if (call.function?.name !== "bash") continue;
        const command = JSON.parse(call.function.arguments).command;
        const item = cases.find(item => item.id === call.id || item.command === command);
        if (item) calls.set(call.id, item.id);
      }
    }
    for (const message of payload.messages ?? []) {
      if (message.role === "tool" && calls.has(message.tool_call_id)) observed.set(calls.get(message.tool_call_id), text(message.content));
    }
    const next = cases.find(item => !observed.has(item.id));
    if (next) assert.ok(payload.tools?.some(tool => tool.function?.name === "bash"), "standalone OmO must expose native Bash");
    const delta = next ? { role: "assistant", tool_calls: [{ index: 0, id: next.id, type: "function",
      function: { name: "bash", arguments: JSON.stringify({ command: next.command }) } }] }
      : { role: "assistant", content: "All four disposable fixture commands completed. The exit-7 command intentionally failed and its output was preserved. No further task remains." };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (value, finishReason) => `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk",
      created: 0, model: "fixture", choices: [{ index: 0, delta: value, finish_reason: finishReason }] })}\n\n`;
    response.write(chunk(delta, null));
    response.write(chunk({}, next ? "tool_calls" : "stop"));
    response.end("data: [DONE]\n\n");
  } catch (error) {
    serverError = error;
    response.writeHead(500).end("invalid fixture request");
  }
});

function runner(extra = {}) {
  return createProcessRunner({ cwd: project, env: { ...env, ...extra } });
}
async function configureModel(agentDir) {
  await mkdir(join(agentDir, "extensions"), { recursive: true });
  // Read-only instrumentation runs after tokenjuice in native directory discovery order.
  await writeFile(join(agentDir, "extensions", "zz-tokenjuice-native-fixture.js"), `
import { appendFile } from "node:fs/promises";
export default function(api) {
  api.on("tool_result", async event => {
    if (${JSON.stringify(cases.map(item => item.id))}.includes(event.toolCallId)) {
      await appendFile(${JSON.stringify(join(agentDir, "fixture-results.jsonl"))}, JSON.stringify(event) + "\\n");
    }
  });
}
`);
  await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { fixture: {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: "openai-completions", apiKey: "fixture-no-secret",
    models: [{ id: "fixture", contextWindow: 128000, maxTokens: 4096 }],
  } } }));
}
async function session(run, agentDir) {
  const tracePath = join(agentDir, "fixture-results.jsonl");
  await writeFile(tracePath, "");
  observed.clear(); modelRequests = 0; serverError = undefined;
  const result = await run(process.execPath, [host, "--mode", "json", "--print", "--no-session", "--offline",
    "--no-context-files", "--provider", "fixture", "--model", "fixture", "--tools", "bash",
    "Run the disposable fixture commands."]);
  assert.ifError(serverError);
  assert.ok(modelRequests >= cases.length + 1 && modelRequests <= cases.length + 4);
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map(line => JSON.parse(line));
  const results = events.filter(event => event.type === "tool_execution_end");
  assert.equal(results.length, cases.length);
  const values = new Map(observed);
  const native = (await readFile(tracePath, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  for (const item of cases) {
    const event = results.find(event => event.toolCallId === item.id);
    assert.ok(event, `missing native ${item.id} result`);
    const visible = text(event.result.content);
    assert.equal(visible, values.get(item.id), `${item.id}: native event and next model request must agree`);
    const hooked = native.find(event => event.toolCallId === item.id);
    assert.ok(hooked, `native observer must see ${item.id}`);
    assert.equal(hooked.input.command, item.command, `${item.id}: native execution must use the requested command`);
    if (hooked.structuredContent && item.id !== "failure") assert.equal(hooked.structuredContent.output, text(hooked.content), `${item.id}: hook projections must agree`);
    assert.equal(text(hooked.content), visible, `${item.id}: final output must match post-tool projection`);
    if (hooked.structuredContent) assert.equal(hooked.structuredContent.exit_code, item.id === "failure" ? 7 : 0);
    else if (item.id !== "failure") assert.equal(hooked.details.status, "completed");
    assert.equal(event.isError, item.id === "failure");
  }
  return { text: values, results: native };
}

try {
  for (const path of [home, project, env.TMPDIR, join(project, "src")]) await mkdir(path, { recursive: true });
  const run = runner();
  const exact = "  exact content\r\n" + Array.from({ length: 80 }, (_, i) => `exact-file-line-${i}-preserve-whitespace`).join("\n") + "\ntrailing blanks\n\n";
  await writeFile(join(project, "exact.txt"), exact);
  for (let i = 0; i < 80; i++) await writeFile(join(project, "src", `file-${i}.txt`), "original\n");
  await run("git", ["init", "--initial-branch=main"]);
  await run("git", ["add", "."]);
  await run("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--no-gpg-sign", "-m", "fixture"]);
  for (let i = 0; i < 80; i++) await writeFile(join(project, "src", `file-${i}.txt`), "modified\n");
  await new Promise(ready => server.listen(0, "127.0.0.1", ready));
  await configureModel(defaultAgentDir);
  const version = (await run(process.execPath, [host, "--version"])).stdout.trim();
  assert.equal(version, "omo 5.1.70 (engine: senpi 2026.11.13)");
  const baseline = await session(run, defaultAgentDir);
  assert.equal(baseline.text.get("status").trimEnd().split("\n").length, 80);
  assert.equal(baseline.text.get("exact"), exact.replaceAll("\r\n", "\n").trimEnd(), "native Bash normalizes CRLF and trims trailing whitespace before adapter processing");
  assert.equal(baseline.text.get("raw"), baseline.text.get("status"));
  assert.ok(baseline.text.get("failure").includes(failureOutput));
  assert.ok(baseline.text.get("failure").includes("failure-stderr\n"));
  console.log(JSON.stringify({ phase: "baseline", version, modelRequests, statusChars: baseline.text.get("status").length,
    exactChars: baseline.text.get("exact").length, failureChars: baseline.text.get("failure").length }));

  const installed = JSON.parse((await run(process.execPath, [cli, "install", "omo", "--format", "json"])).stdout);
  assert.equal(installed.extensionPath, join(defaultAgentDir, "extensions", "tokenjuice.js"));
  const compacted = await session(run, defaultAgentDir);
  assert.ok(compacted.text.get("status").length < baseline.text.get("status").length);
  for (const id of ["exact", "raw", "failure"]) {
    assert.equal(compacted.text.get(id), baseline.text.get(id), `${id} must preserve native baseline`);
    assert.equal(Object.hasOwn(compacted.results.find(event => event.toolCallId === id), "structuredContent"),
      Object.hasOwn(baseline.results.find(event => event.toolCallId === id), "structuredContent"));
    assert.equal(compacted.results.find(event => event.toolCallId === id).structuredContent?.output,
      baseline.results.find(event => event.toolCallId === id).structuredContent?.output);
  }
  const removed = JSON.parse((await run(process.execPath, [cli, "uninstall", "omo", "--format", "json"])).stdout);
  assert.equal(removed.removed, true);
  assert.ok((await readFile(join(defaultAgentDir, "extensions", "zz-tokenjuice-native-fixture.js"), "utf8")).includes("tool_result"));
  const restored = await session(run, defaultAgentDir);
  for (const item of cases) assert.equal(restored.text.get(item.id), baseline.text.get(item.id), `${item.id}: removal must restore baseline`);

  const override = join(root, "custom-agent");
  const overrideRun = runner({ OMO_CODING_AGENT_DIR: override,
    SENPI_CODING_AGENT_DIR: join(root, "senpi-decoy"), PI_CODING_AGENT_DIR: join(root, "pi-decoy") });
  await configureModel(override);
  const custom = JSON.parse((await overrideRun(process.execPath, [cli, "install", "omo", "--format", "json"])).stdout);
  assert.equal(custom.extensionPath, join(override, "extensions", "tokenjuice.js"));
  const customResult = await session(overrideRun, override);
  assert.equal(customResult.text.get("status"), compacted.text.get("status"));
  await overrideRun(process.execPath, [cli, "uninstall", "omo"]);
  assert.equal(JSON.parse(await readFile(join(override, "models.json"), "utf8")).providers.fixture.api, "openai-completions");
  assert.ok(totalModelRequests >= 4 * (cases.length + 1) && totalModelRequests <= 4 * (cases.length + 4));
  console.log(JSON.stringify({ ok: true, host: "omo", version, sessions: 4, totalModelRequests, cases: cases.map(item => item.id),
    directories: ["default", "OMO_CODING_AGENT_DIR override"], removal: true, textMatchesModel: true,
    nativeStructuredResults: baseline.results.filter(event => event.structuredContent !== undefined).length,
    statusRawChars: baseline.text.get("status").length, statusCompactedChars: compacted.text.get("status").length }));
} finally {
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  await rm(root, { recursive: true, force: true });
}
