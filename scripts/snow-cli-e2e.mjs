import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProcessRunner } from "./e2e-process.mjs";

const host = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "pass the snow-ai@0.9.15 bundle/cli.mjs path");
const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/cli/main.js");
const root = await mkdtemp(join(tmpdir(), "tokenjuice-snow-native-"));
const project = join(root, "project");
const home = join(root, "home");
const config = join(home, ".snow");
const bin = join(root, "bin");
const receipts = join(root, "hook-receipts.jsonl");
const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
const env = {
  HOME: home, USERPROFILE: home, SNOW_CONFIG_DIR: config,
  PATH: `${bin}:${process.env.PATH ?? ""}`,
  XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"),
  XDG_STATE_HOME: join(home, ".local/state"), XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: tmpdir(), TERM: "dumb", CI: "1", NO_COLOR: "1", TOKENJUICE_STATS: "off",
};
const run = createProcessRunner({ cwd: project, env });
const exact = "alpha  beta\n{\n  \"spacing\": \"keep  this\"\n}\n";
const cases = [
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: "tokenjuice wrap --raw -- find fixtures -type f" },
  { id: "failure", command: "find fixtures -type f; find fixtures -type f >&2; printf '\\nfailure-stderr\\n' >&2; exit 7" },
];
let results = new Map();
let requestCount = 0;
let serverError;

function reply(response, payload, message, finishReason) {
  if (payload.stream) {
    response.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (delta, finish_reason) => `data: ${JSON.stringify({
      id: "fixture", object: "chat.completion.chunk", model: "fixture",
      choices: [{ index: 0, delta, finish_reason }],
    })}\n\n`;
    response.write(chunk(message, null));
    response.end(`${chunk({}, finishReason)}data: [DONE]\n\n`);
  } else {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      id: "fixture", model: "fixture", choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: finishReason }],
    }));
  }
}

const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(request.headers.authorization, "Bearer fixture");
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const payload = JSON.parse(raw);
    assert.equal(payload.model, "fixture");
    assert.ok(++requestCount <= 30, "native host must make bounded progress");
    // Snow also asks the basic model for metadata; only tool-enabled requests own the agent turn.
    if (!Array.isArray(payload.tools)) return reply(response, payload, { content: "fixture" }, "stop");
    const messages = payload.messages.filter((message) => message.role === "tool");
    for (const item of cases) {
      const message = messages.find((entry) => entry.tool_call_id === `fixture-${item.id}`);
      if (!message) continue;
      assert.equal(typeof message.content, "string");
      const content = JSON.parse(message.content);
      assert.equal(content.command, item.command, `${item.id}: command identity must survive`);
      assert.equal(content.exitCode, item.id === "failure" ? 7 : 0, `${item.id}: native status must survive`);
      assert.equal(typeof content.stdout, "string");
      assert.equal(typeof content.stderr, "string");
      assert.equal(typeof content.executedAt, "string");
      results.set(item.id, content);
    }
    let name;
    let args;
    let id;
    if (!messages.some((message) => message.tool_call_id === "fixture-search")) {
      assert.ok(payload.tools.some((tool) => tool.function?.name === "tool_search"));
      name = "tool_search"; args = { query: "terminal-execute" }; id = "fixture-search";
    } else {
      const item = cases.find((candidate) => !results.has(candidate.id));
      if (!item) return reply(response, payload, { content: "fixture complete" }, "stop");
      assert.ok(payload.tools.some((tool) => tool.function?.name === "terminal-execute"), "native tool search must load terminal-execute");
      name = "terminal-execute";
      args = { command: item.command, explanation: "Run a disposable acceptance fixture command.",
        workingDirectory: project, enableAiSummary: false, isInteractive: false };
      id = `fixture-${item.id}`;
    }
    reply(response, payload, { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, "tool_calls");
  } catch (error) {
    serverError = error;
    response.writeHead(500).end("invalid fixture request");
  }
});

async function phase() {
  results = new Map(); requestCount = 0; serverError = undefined;
  const output = await run(process.execPath, [host, "--ask", "Run the disposable acceptance fixture commands."]);
  assert.ifError(serverError);
  assert.ok(output.stdout.includes("fixture complete"), "native agent must finish its tool loop");
  assert.equal(results.size, cases.length, "every native next-model request must carry its tool result");
  return new Map(results);
}

function stable(content) {
  const { executedAt, ...rest } = content;
  assert.ok(executedAt);
  return rest;
}

try {
  await Promise.all([mkdir(join(project, "fixtures"), { recursive: true }), mkdir(config, { recursive: true }), mkdir(bin)]);
  await Promise.all(Array.from({ length: 80 }, (_, index) => writeFile(join(project, "fixtures", `example-${index}.json`), "{}\n")));
  await writeFile(join(project, "exact.txt"), exact);
  await writeFile(join(bin, "tokenjuice"), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(cli)} "$@"\n`, { mode: 0o755 });
  assert.equal((await run(process.execPath, [host, "--version"])).stdout.trim(), "0.9.15");
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  await writeFile(join(config, "config.json"), JSON.stringify({ snowcfg: {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: "fixture", requestMethod: "chat",
    advancedModel: "fixture", basicModel: "fixture", enablePromptOptimization: false,
    enableAutoCompress: false, maxContextTokens: 200000, maxRetries: 0, retryDelayMs: 0, streamingDisplay: false,
  } }));
  const baseline = await phase();
  assert.equal(baseline.get("exact").stdout, exact);
  const paths = new Set(Array.from({ length: 80 }, (_, index) => `fixtures/example-${index}.json`));
  assert.deepEqual(new Set(baseline.get("listing").stdout.trim().split("\n")), paths);
  assert.equal(baseline.get("failure").stdout, baseline.get("listing").stdout);
  assert.ok(baseline.get("failure").stderr.endsWith("failure-stderr\n"));
  for (const path of paths) assert.ok(baseline.get("failure").stderr.includes(path));

  const installed = JSON.parse((await run(process.execPath, [cli, "install", "snow-cli", "--local", "--format", "json"])).stdout);
  assert.equal(installed.settingsPath, join(config, "hooks", "afterToolCall.json"));
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "snow-cli", "--local", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const hooks = JSON.parse(await readFile(installed.settingsPath, "utf8"));
  const hook = hooks.afterToolCall.find((group) => group.matcher === "terminal-execute").hooks[0];
  const wrapper = join(root, "record-hook.mjs");
  await writeFile(wrapper, `import { readFileSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, [${JSON.stringify(cli)}, ...process.argv.slice(2)], { input: readFileSync(0), env: process.env });
appendFileSync(${JSON.stringify(receipts)}, JSON.stringify({ exitCode: result.status, stderrBytes: result.stderr?.length ?? 0 }) + "\\n");
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 2);
`);
  hook.command = `${quote(process.execPath)} ${quote(wrapper)} snow-cli-after-tool-call`;
  await writeFile(installed.settingsPath, JSON.stringify(hooks));
  const compacted = await phase();
  const receipt = (await readFile(receipts, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(receipt.map((entry) => entry.exitCode), [1, 0, 0, 0], "native afterToolCall must observe exit 1 only for replacement");
  assert.ok(receipt.every((entry) => entry.stderrBytes === 0), "replacement must not carry stderr diagnostics");
  assert.ok(compacted.get("listing").stdout.length < baseline.get("listing").stdout.length);
  assert.ok(compacted.get("listing").stdout.includes("80 matches"));
  assert.deepEqual({ ...stable(compacted.get("listing")), stdout: "omitted" }, { ...stable(baseline.get("listing")), stdout: "omitted" });
  for (const id of ["exact", "raw", "failure"]) assert.deepEqual(stable(compacted.get(id)), stable(baseline.get(id)), `${id}: native next-model bytes and status must remain intact`);

  const removed = JSON.parse((await run(process.execPath, [cli, "uninstall", "snow-cli", "--format", "json"])).stdout);
  assert.equal(removed.removed, 1);
  assert.deepEqual(JSON.parse(await readFile(installed.settingsPath, "utf8")), {});
  const uninstalled = await phase();
  for (const item of cases) assert.deepEqual(stable(uninstalled.get(item.id)), stable(baseline.get(item.id)), `${item.id}: uninstall must restore native delivery`);
  assert.equal((await readFile(receipts, "utf8")).trim().split("\n").length, receipt.length, "uninstalled hook must no longer execute");
  console.log("Snow CLI 0.9.15 native discovery, exit-1 replacement, next-model results and uninstall passed");
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
