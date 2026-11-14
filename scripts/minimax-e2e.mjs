#!/usr/bin/env node

import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProcessRunner } from "./e2e-process.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));
const cli = join(repo, "dist/cli/main.js");
const host = process.argv[2] ? resolve(process.argv[2]) : "mcode";
const root = await mkdtemp(join(tmpdir(), "tokenjuice-minimax-native-"));
const home = join(root, "home");
const project = join(root, "project");
const bin = join(root, "bin");
const env = {
  PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
  HOME: home,
  MINIMAX_DATA_DIR: join(home, ".minimax"),
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local/share"),
  XDG_STATE_HOME: join(home, ".local/state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  MCODE_PROVIDER_API_KEY: "fixture-no-secret",
  TOKENJUICE_STATS: "off",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  DO_NOT_TRACK: "1",
  SHELL: "/bin/bash",
};
const run = createProcessRunner({ cwd: project, env });
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const failureStdout = Array.from({ length: 80 }, (_, i) => `failure-${i}\n`).join("");
const failureStderr = "failure-stderr\n";
const cases = [
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- find fixtures -type f` },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote(`process.stdout.write(${JSON.stringify(failureStdout)}); process.stderr.write(${JSON.stringify(failureStderr)}); process.exit(7);`)}` },
];
const observed = new Map();
let modelRequests = 0;
let serverError;
const server = createServer(async (request, response) => {
  try {
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    // The native runtime also asks its configured endpoint to count input tokens.
    if (request.url === "/v1/responses/input_tokens") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ input_tokens: 1 }));
      return;
    }
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(payload.stream, true);
    assert.ok(payload.tools.some(tool => tool.function?.name === "bash"));
    modelRequests++;
    assert.ok(modelRequests <= cases.length + 1, "native host must make progress");
    for (const message of payload.messages ?? []) {
      if (message.role === "tool") {
        const item = cases.find(item => message.tool_call_id === `call_${item.id}`);
        if (item) observed.set(item.id, message.content);
      }
    }
    const next = cases.find(item => !observed.has(item.id));
    const delta = next ? {
      role: "assistant",
      tool_calls: [{ index: 0, id: `call_${next.id}`, type: "function", function: {
        name: "bash", arguments: JSON.stringify({ command: next.command, description: `Disposable ${next.id} fixture` }),
      } }],
    } : { role: "assistant", content: "fixture complete" };
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

async function session(model) {
  observed.clear();
  modelRequests = 0;
  const result = await run(host, [
    "exec", "Run the disposable fixture shell tools.", "--model", model,
    // Full mode authorizes only this isolated test workspace; the plugin emits no permission verdict.
    "--permission", "full", "--max-steps", "8", "--timeout", "60s", "--output-format", "stream-json",
  ]);
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1);
  assert.equal(observed.size, cases.length, "every result must reach the next model request");
  const events = result.stdout.trim().split("\n").map(line => JSON.parse(line));
  const completed = events.find(event => event.type === "exec.completed")?.result;
  assert.equal(completed?.status, "succeeded");
  assert.equal(completed.output, "fixture complete");
  const tools = events.filter(event => event.type === "item.completed" && event.item?.type === "tool_call");
  assert.equal(tools.length, cases.length);
  for (const item of cases) {
    const output = tools.find(event => event.item.id === `call_${item.id}`)?.item.toolCall.output;
    assert.ok(output, `${item.id}: native tool completion required`);
    assert.equal(output.content.map(block => block.text ?? "").join(""), observed.get(item.id));
    const processOutput = output.details.processOutput;
    assert.equal(processOutput.exitCode, item.id === "failure" ? 7 : 0);
    assert.equal(processOutput.stdoutTruncated, false);
    assert.equal(processOutput.stderrTruncated, false);
    if (item.id === "failure") {
      assert.equal(output.details.is_error, true);
      assert.equal(processOutput.stdout, failureStdout);
      assert.equal(processOutput.stderr, failureStderr);
      assert.ok(observed.get(item.id).includes(failureStdout), "model must receive all failed stdout");
      assert.ok(observed.get(item.id).includes(failureStderr), "model must receive all failed stderr");
      assert.ok(observed.get(item.id).endsWith("Command exited with code 7"));
    }
  }
  return new Map(observed);
}

async function catalog() {
  return JSON.parse((await run(host, ["plugin", "list", "--marketplace", "local", "--json"])).stdout);
}

try {
  await Promise.all([mkdir(home), mkdir(bin), mkdir(env.TMPDIR), mkdir(join(project, "fixtures"), { recursive: true })]);
  await writeFile(join(bin, "tokenjuice"), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(cli)} "$@"\n`, { mode: 0o755 });
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(project, "fixtures", `item-${i}.txt`), "fixture\n")));
  const exact = "  exact CRLF\r\ntrailing blanks\n\n";
  await writeFile(join(project, "exact.txt"), exact);
  await new Promise(ready => server.listen(0, "127.0.0.1", ready));
  const version = (await run(host, ["--version"])).stdout.trim();
  assert.equal(version, "0.7.2", "native acceptance is pinned to the verified release");
  await run(host, [
    "provider", "add", "--name", "tokenjuice-fixture", "--base-url", `http://127.0.0.1:${server.address().port}/v1`,
    "--api-format", "openai-completions", "--model", "fixture", "--api-key-env", "MCODE_PROVIDER_API_KEY",
    "--context-limit", "32768", "--output-limit", "4096",
  ]);
  const providers = JSON.parse((await run(host, ["provider", "list", "--json"])).stdout).providers;
  const provider = providers.find(provider => provider.name === "tokenjuice-fixture");
  assert.ok(provider?.providerId);
  const model = `${provider.providerId}/fixture`;
  const marketplaces = JSON.parse((await run(host, ["plugin", "marketplace", "list", "--json"])).stdout);
  const localRoot = marketplaces.find(marketplace => marketplace.name === "local")?.path;
  assert.ok(localRoot);
  const localRelative = relative(home, localRoot);
  assert.ok(localRelative && !localRelative.startsWith("..") && !isAbsolute(localRelative), "native catalog must stay inside isolated HOME");
  assert.deepEqual((await catalog()).installed, []);

  const baseline = await session(model);
  for (const id of ["listing", "raw"]) {
    const entries = baseline.get(id).trimEnd().split("\n");
    assert.equal(entries.length, 80);
    assert.deepEqual(new Set(entries), new Set(Array.from({ length: 80 }, (_, i) => `fixtures/item-${i}.txt`)));
  }
  assert.equal(baseline.get("exact"), exact);

  const destination = join(localRoot, "tokenjuice");
  await cp(join(repo, "dist/hosts/minimax-code/bundle"), destination, { recursive: true });
  await run(host, ["plugin", "enable", "tokenjuice@local", "--json"]);
  assert.equal((await catalog()).installed.find(plugin => plugin.name === "tokenjuice")?.enabled, true);
  const installed = await session(model);
  assert.match(installed.get("listing"), /80 matches/u);
  assert.ok(installed.get("listing").length < baseline.get("listing").length);
  for (const id of ["exact", "raw", "failure"]) assert.equal(installed.get(id), baseline.get(id), `${id}: native result must survive wrapping`);

  await run(host, ["plugin", "disable", "tokenjuice@local", "--json"]);
  assert.equal((await catalog()).installed.find(plugin => plugin.name === "tokenjuice")?.enabled, false);
  assert.deepEqual(await session(model), baseline, "native disable must restore ordinary output");
  await run(host, ["plugin", "remove", "tokenjuice@local", "--json"]);
  assert.deepEqual((await catalog()).installed, []);
  await assert.rejects(readFile(join(destination, ".minimax-plugin/plugin.json")), { code: "ENOENT" });
  assert.deepEqual(await session(model), baseline, "native removal must restore ordinary output");
  process.stdout.write(`${JSON.stringify({ ok: true, host: "minimax-code", version, permission: "full", modelRequestsPerSession: modelRequests, results: [...installed.keys()], lifecycle: "enable-disable-remove" })}\n`);
} finally {
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  await rm(root, { recursive: true, force: true });
}
