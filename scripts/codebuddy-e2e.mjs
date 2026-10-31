#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "codebuddy";
const root = await mkdtemp(join(tmpdir(), "tokenjuice-codebuddy-e2e-"));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".codebuddy");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  CODEBUDDY_CONFIG_DIR: configDir,
  DISABLE_TELEMETRY: "1",
  DISABLE_ERROR_REPORTING: "1",
  CODEBUDDY_SKIP_BUILTIN_MARKETPLACE: "1",
  CODEBUDDY_DISABLE_SHELL_SNAPSHOT: "1",
  DISABLE_AUTOUPDATER: "1",
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
function stdout(content) {
  assert.equal(typeof content, "string");
  assert.ok(content.startsWith("Stdout: "), "host must include stdout in the result envelope");
  const end = content.indexOf("\nStderr: ");
  assert.ok(end >= 0, "host must include stderr in the result envelope");
  return content.slice("Stdout: ".length, end);
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
    const hasBash = payload.tools?.some((tool) => tool.function?.name === "Bash");
    if (hasBash) {
      modelRequests++;
      assert.ok(modelRequests <= cases.length + 2, "host must make progress through the fixture tools");
      for (const message of payload.messages ?? []) {
        if (message.role === "tool") observed.set(message.tool_call_id, message.content);
      }
    }
    const next = hasBash ? cases.find((item) => !observed.has(item.id)) : undefined;
    const delta = next
      ? { role: "assistant", tool_calls: [{
          index: 0, id: next.id, type: "function",
          function: { name: "Bash", arguments: JSON.stringify({ command: next.command, description: next.id }) },
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
  const result = await run(host, [
    "--print", "--output-format", "stream-json", "--verbose", "--no-session-persistence",
    "--model", "fixture", "--tools", "Bash", "--allowedTools", "Bash",
    "--permission-mode", "dontAsk", "--setting-sources", "user", "--strict-mcp-config",
    "--mcp-config", '{"mcpServers":{}}', "--max-turns", "6", "Run the fixture shell tools.",
  ]);
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "host must deliver every tool result in a follow-up model request");
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  const completed = events.find((event) => event.type === "result");
  assert.equal(completed?.is_error, false, "CodeBuddy must complete the fixture session");
  assert.equal(completed?.result, "fixture complete");
  const results = events.flatMap((event) => event.message?.content ?? []).filter((block) => block.type === "tool_result");
  for (const item of cases) {
    const result = results.find((block) => block.tool_use_id === item.id)?._meta?.rawResponse;
    assert.equal(result?.exitCode, item.id === "failure" ? 7 : 0, `${item.id}: host must preserve native exit status`);
    assert.equal(result?.is_error ?? false, item.id === "failure", `${item.id}: host must preserve native failure metadata`);
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
  await writeFile(join(configDir, "models.json"), JSON.stringify({ models: [{
    id: "fixture", name: "fixture", vendor: "fixture", apiKey: "fixture-no-secret",
    url: `http://127.0.0.1:${server.address().port}/v1/chat/completions`,
    supportsToolCall: true, maxInputTokens: 128000, maxOutputTokens: 4096,
  }] }));
  const version = (await run(host, ["--version"])).stdout.trim();
  const baseline = await session();
  const expectedEntries = new Set(Array.from({ length: 80 }, (_, index) => `fixtures/example-${index}.json`));
  for (const id of ["listing", "raw"]) {
    const nativeResult = baseline.get(id);
    assert.match(nativeResult, /\nExit Code: 0\n/u, `${id}: native fixture must succeed`);
    const entries = stdout(nativeResult).match(/^fixtures\/example-\d+\.json$/gmu) ?? [];
    assert.equal(entries.length, 80, `${id}: native fixture must return exactly 80 entries`);
    assert.deepEqual(new Set(entries), expectedEntries, `${id}: native fixture must retain every file`);
  }
  assert.match(baseline.get("exact"), /\nExit Code: 0\n/u, "native exact read must succeed");
  assert.equal(stdout(baseline.get("exact")), exact, "native exact read must retain fixture bytes");
  await run(process.execPath, [cli, "install", "codebuddy", "--local"]);
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "codebuddy", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const installed = await session();
  const listing = installed.get("listing");
  assert.match(listing, /\nExit Code: 0\n/u, "compacted listing must succeed");
  assert.ok(listing.includes("80 matches"), "installed hook must compact the real shell listing before model delivery");
  assert.ok(listing.length < baseline.get("listing").length);
  assert.equal(stdout(installed.get("exact")), exact, "hook must preserve exact file bytes");
  assert.match(installed.get("exact"), /\nStderr: \(empty\)\nExit Code: 0\n/u, "exact read must succeed without stderr");
  assert.deepEqual(installed.get("raw"), baseline.get("raw"), "raw bypass must preserve the native result");
  assert.ok(installed.get("failure").includes("failure-output"), "model must receive failure output");
  assert.ok(installed.get("failure").includes("failure-stderr"), "model must receive failure stderr");
  assert.match(baseline.get("failure"), /\nExit Code: 7\n/u, "native failure fixture must fail");
  assert.match(installed.get("failure"), /\nExit Code: 7\n/u, "host must preserve the shell failure status");
  process.stdout.write(`${JSON.stringify({ ok: true, host: "codebuddy", version, modelRequestsPerSession: modelRequests, results: [...installed.keys()] }, null, 2)}\n`);
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
