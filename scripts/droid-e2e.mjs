#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "droid";
const root = await mkdtemp(join(tmpdir(), "tokenjuice-droid-e2e-"));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".factory");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  FACTORY_HOME: configDir,
  DO_NOT_TRACK: "1",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  SHELL: "/bin/bash",
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
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- find fixtures -type f` },
  { id: "failure", command: "printf 'failure-output\\n'; printf 'failure-stderr\\n' >&2; exit 7" },
];
const observed = new Map();
let modelRequests = 0;
let serverError;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    const hasExecute = payload.tools?.some((tool) => tool.function?.name === "Execute");
    if (hasExecute) {
      modelRequests++;
      assert.ok(modelRequests <= cases.length + 2, "host must make progress through the fixture tools");
      // Droid normalizes tool-call IDs, so follow the IDs it sends back.
      const calls = new Map();
      for (const message of payload.messages ?? []) {
        for (const call of message.tool_calls ?? []) {
          if (call.function?.name !== "Execute") continue;
          const input = JSON.parse(call.function.arguments);
          const item = cases.find((item) => item.command === input.command);
          if (item) calls.set(call.id, item.id);
        }
      }
      for (const message of payload.messages ?? []) {
        if (message.role === "tool" && calls.has(message.tool_call_id)) {
          observed.set(calls.get(message.tool_call_id), message.content);
        }
      }
    }
    const next = hasExecute ? cases.find((item) => !observed.has(item.id)) : undefined;
    const delta = next
      ? { role: "assistant", tool_calls: [{
          index: 0, id: next.id, type: "function",
          function: { name: "Execute", arguments: JSON.stringify({ command: next.command, timeout: 60, riskLevel: "low", riskLevelReason: "Uses only disposable fixture files and prints test output." }) },
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

async function session(autonomy = "low") {
  observed.clear();
  modelRequests = 0;
  const result = await run(host, [
    "exec", "--output-format", "stream-json", "--disable-builtin-skills",
    "--model", "custom:fixture-0", "--only-tools", "Execute", "--auto", autonomy,
    "Run the fixture shell tools.",
  ]);
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "host must deliver every tool result in a follow-up model request");
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  const completed = events.find((event) => event.type === "completion");
  assert.equal(completed?.finalText, "fixture complete");
  const results = events.filter((event) => event.type === "tool_result");
  assert.equal(results.length, cases.length);
  for (const item of cases) {
    const result = results.find((event) => event.id === item.id);
    const failed = item.id === "failure";
    assert.equal(result?.isError, failed, `${item.id}: native failure flag must survive`);
    const content = failed ? result.error?.message : result.value;
    assert.equal(content, observed.get(item.id), `${item.id}: model must receive the native result`);
    assert.ok(content.endsWith(`[Process exited with code ${failed ? 7 : 0}]`),
      `${item.id}: native exit status must survive`);
  }
  return new Map(observed);
}

try {
  await mkdir(configDir, { recursive: true });
  await mkdir(env.TMPDIR, { recursive: true });
  await mkdir(join(project, "fixtures"), { recursive: true });
  await Promise.all(Array.from({ length: 80 }, (_, index) =>
    writeFile(join(project, "fixtures", `example-${index}.json`), "{}\n")));
  const exact = "  exact content\r\ntrailing blanks\n\n";
  await writeFile(join(project, "exact.txt"), exact);
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  await writeFile(join(configDir, "settings.json"), JSON.stringify({
    customModels: [{
      model: "fixture", displayName: "fixture", apiKey: "fixture-no-secret",
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      provider: "generic-chat-completion-api", maxOutputTokens: 4096,
    }],
    disableAutoUpdate: true,
  }));
  const version = (await run(host, ["--version"])).stdout.trim();
  const baseline = await session();
  const expectedEntries = new Set(Array.from({ length: 80 }, (_, index) => `fixtures/example-${index}.json`));
  for (const id of ["listing", "raw"]) {
    const nativeResult = baseline.get(id);
    const entries = nativeResult.match(/^fixtures\/example-\d+\.json$/gmu) ?? [];
    assert.equal(entries.length, 80, `${id}: native fixture must return exactly 80 entries`);
    assert.deepEqual(new Set(entries), expectedEntries, `${id}: native fixture must retain every file`);
  }
  const successSuffix = "\n\n[Process exited with code 0]";
  assert.equal(baseline.get("exact"), exact + successSuffix, "native exact read must retain file bytes");
  await run(process.execPath, [cli, "install", "droid", "--local"]);
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "droid", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  // Input rewrites require High autonomy in the pinned host. Never approve tools
  // from the hook or disable permissions to make the acceptance test pass.
  await assert.rejects(session("low"), /insufficient permission to proceed/u);
  assert.equal(modelRequests, 1, "Low autonomy must stop before delivering a rewritten tool result");
  assert.equal(observed.size, 0);
  const installed = await session("high");
  const listing = installed.get("listing");
  assert.ok(listing.includes("80 matches"), "installed hook must compact the real shell listing before model delivery");
  assert.ok(listing.length < baseline.get("listing").length);
  assert.equal(installed.get("exact"), baseline.get("exact"), "hook must preserve the native exact read");
  assert.deepEqual(installed.get("raw"), baseline.get("raw"), "raw bypass must preserve the native result");
  assert.ok(installed.get("failure").includes("failure-output"), "model must receive failure output");
  assert.ok(installed.get("failure").includes("failure-stderr"), "model must receive failure stderr");
  assert.ok(installed.get("failure").endsWith("[Process exited with code 7]"), "model must receive failure status");
  process.stdout.write(`${JSON.stringify({ ok: true, host: "droid", version, modelRequestsPerSession: modelRequests, results: [...installed.keys()] }, null, 2)}\n`);
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
