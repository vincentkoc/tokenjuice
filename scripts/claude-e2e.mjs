#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "claude";
const root = await mkdtemp(join(tmpdir(), "tokenjuice-claude-e2e-"));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".claude");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  CLAUDE_CONFIG_DIR: configDir,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  DISABLE_AUTOUPDATER: "1",
  ANTHROPIC_AUTH_TOKEN: "fixture-no-secret",
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
const text = (content) => typeof content === "string" ? content : content?.map((block) => block.text ?? "").join("");
const observed = new Map();
let modelRequests = 0;
let serverError;
const server = createServer(async (request, response) => {
  try {
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
  const result = await run(host, [
    "--print", "--output-format", "stream-json", "--verbose", "--no-session-persistence",
    "--model", "claude-sonnet-4-6", "--tools", "Bash", "--allowedTools", "Bash",
    "--permission-mode", "dontAsk", "--setting-sources", "user", "--strict-mcp-config",
    "--mcp-config", '{"mcpServers":{}}', "--max-turns", "6", "Run the fixture shell tools.",
  ]);
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "host must deliver every tool result in a follow-up model request");
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  const completed = events.find((event) => event.type === "result");
  assert.equal(completed?.is_error, false, "Claude must complete the fixture session");
  assert.equal(completed?.result, "fixture complete");
  return new Map(observed);
}

try {
  await mkdir(configDir, { recursive: true });
  await mkdir(env.TMPDIR, { recursive: true });
  await mkdir(join(project, "fixtures"), { recursive: true });
  await Promise.all(Array.from({ length: 80 }, (_, index) =>
    writeFile(join(project, "fixtures", `example-${index}.json`), "{}\n")));
  await writeFile(join(project, "exact.txt"), "  exact content\r\ntrailing blanks\n\n");
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  const version = (await run(host, ["--version"])).stdout.trim();
  const baseline = await session();
  const listingEntries = text(baseline.get("listing").content).match(/^fixtures\/example-\d+\.json$/gmu);
  assert.deepEqual(new Set(listingEntries), new Set(Array.from({ length: 80 }, (_, index) => `fixtures/example-${index}.json`)), "native listing must retain every fixture entry");
  assert.ok(text(baseline.get("exact").content).startsWith("exact content\r\ntrailing blanks"), "native exact read must succeed");
  await run(process.execPath, [cli, "install", "claude-code", "--local"]);
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "claude-code", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const installed = await session();
  const listing = text(installed.get("listing").content);
  assert.ok(listing.includes("80 matches"), "installed hook must compact the real shell listing before model delivery");
  assert.ok(listing.length < text(baseline.get("listing").content).length);
  assert.deepEqual(installed.get("exact"), baseline.get("exact"), "hook must preserve the host's native exact-read result");
  assert.deepEqual(installed.get("raw"), baseline.get("raw"), "raw bypass must preserve the native result");
  // wrap adds its own exit marker; Claude still owns the protocol failure flag.
  assert.equal(baseline.get("failure").is_error, true, "native failure fixture must fail");
  assert.equal(installed.get("failure").is_error, true, "host must retain the shell failure flag");
  assert.ok(text(installed.get("failure").content).includes("failure-output"), "model must receive failure output");
  assert.ok(text(installed.get("failure").content).includes("failure-stderr"), "model must receive failure stderr");
  assert.ok(text(installed.get("failure").content).includes("Exit code 7"), "model must receive shell failure status");
  process.stdout.write(`${JSON.stringify({ ok: true, host: "claude-code", version, modelRequestsPerSession: modelRequests, results: [...installed.keys()] }, null, 2)}\n`);
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
