#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "opencode";
const root = await mkdtemp(join(tmpdir(), "tokenjuice-opencode-e2e-"));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".config", "opencode");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  OPENCODE_CONFIG_DIR: configDir,
  OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
  OPENCODE_DISABLE_MODELS_FETCH: "true",
  OPENCODE_DISABLE_AUTOUPDATE: "true",
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
      reject(new Error(`timed out running ${command}`));
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
  { id: "failure", command: "printf 'failure-output\\n'; exit 7" },
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
    modelRequests++;
    for (const message of payload.messages ?? []) {
      if (message.role === "tool") observed.set(message.tool_call_id, message.content);
    }
    const tools = payload.tools ?? [];
    const next = cases.find((item) => !observed.has(item.id));
    const callTools = next && tools.some((tool) => tool.function?.name === "bash");
    const delta = callTools
      ? { role: "assistant", tool_calls: [{
          index: 0, id: next.id, type: "function",
          function: { name: "bash", arguments: JSON.stringify({ command: next.command, description: next.id }) },
        }] }
      : { role: "assistant", content: "fixture complete" };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (value, finishReason) => `data: ${JSON.stringify({
      id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture",
      choices: [{ index: 0, delta: value, finish_reason: finishReason }],
    })}\n\n`;
    response.write(chunk(delta, null));
    response.write(chunk({}, callTools ? "tool_calls" : "stop"));
    response.end("data: [DONE]\n\n");
  } catch (error) {
    serverError = error;
    response.writeHead(500).end("invalid fixture request");
  }
});

try {
  await mkdir(configDir, { recursive: true });
  await mkdir(join(project, "fixtures"), { recursive: true });
  await Promise.all(Array.from({ length: 80 }, (_, index) =>
    writeFile(join(project, "fixtures", `example-${index}.json`), "{}\n")));
  const exact = "  exact content\r\ntrailing blanks\n\n";
  await writeFile(join(project, "exact.txt"), exact);
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  const baseURL = `http://127.0.0.1:${server.address().port}/v1`;
  await writeFile(join(configDir, "opencode.json"), JSON.stringify({
    model: "fixture/fixture",
    small_model: "fixture/fixture",
    enabled_providers: ["fixture"],
    permission: "allow",
    provider: { fixture: {
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL, apiKey: "fixture-no-secret" },
      models: { fixture: { name: "fixture", limit: { context: 128000, output: 4096 } } },
    } },
  }));
  const version = (await run(host, ["--version"])).stdout.trim();
  await run(process.execPath, [cli, "install", "opencode"]);
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "opencode", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const session = await run(host, ["run", "--format", "json", "--model", "fixture/fixture", "Run the fixture shell tools."]);
  assert.ifError(serverError);
  assert.ok(modelRequests >= 2, "host must send a follow-up model request containing tool output");
  const listing = observed.get("listing");
  assert.equal(typeof listing, "string", "model must receive the listing tool result");
  assert.ok(listing.includes("80 matches"), "installed plugin must compact the real shell listing before model delivery");
  assert.ok(listing.includes("tokenjuice"), "model must receive the compaction notice");
  assert.equal(observed.get("exact"), exact, "model must receive exact file bytes");
  const raw = observed.get("raw");
  assert.equal(typeof raw, "string", "model must receive raw bypass output");
  assert.equal(raw.trimEnd().split("\n").length, 80, "raw bypass must retain all listing entries");
  assert.ok(!raw.includes("tokenjuice"), "raw bypass must not add a compaction notice");
  assert.ok(observed.get("failure")?.includes("failure-output"), `model must receive failure output: ${JSON.stringify(observed.get("failure"))}`);
  const events = session.stdout.trim().split("\n").map((line) => JSON.parse(line));
  const failed = events.find((event) => event.part?.tool === "bash" && event.part?.state?.input?.command === cases[3].command);
  assert.equal(failed?.part?.state?.metadata?.exit, 7, "host must retain the shell failure exit status");
  process.stdout.write(`${JSON.stringify({ ok: true, host: "opencode", version, modelRequests, results: [...observed.keys()] }, null, 2)}\n`);
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
