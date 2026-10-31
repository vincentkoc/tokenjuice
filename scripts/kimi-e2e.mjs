#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "kimi";
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-kimi-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, "native-code");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  KIMI_CODE_HOME: configDir,
  DO_NOT_TRACK: "1",
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
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "wrapped", command: `${quote(process.execPath)} ${quote(cli)} wrap -- find fixtures -type f` },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- find fixtures -type f` },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote("process.stdout.write(Array.from({ length: 80 }, (_, i) => 'failure-' + i).join('\\n') + '\\n'); process.stderr.write('failure-stderr\\n'); process.exit(7)")}` },
];
function textContent(content) {
  if (typeof content === "string") return content;
  assert.ok(Array.isArray(content));
  assert.equal(content.length, 1);
  assert.equal(content[0].type, "text");
  return content[0].text;
}

const observed = new Map();
const probeMarker = "tokenjuice-kimi-observation-probe";
const receiptsPath = join(root, "hook-receipts.jsonl");
let probeEnabled = false;
async function receipts() {
  return (await readFile(receiptsPath, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
}
async function waitForReceipt(command) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if ((await receipts()).some((receipt) => receipt.input.tool_input?.command === command)) return;
    await new Promise((done) => setTimeout(done, 25));
  }
  assert.fail("native PostToolUse observation hook did not finish");
}
let modelRequests = 0;
let serverError;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    assert.ok(!body.includes(probeMarker), "observation-only hook stdout must not enter model context");
    const shellTool = payload.tools?.find((tool) => ["Bash", "Shell"].includes(tool.function?.name));
    const hasExecute = Boolean(shellTool);
    if (hasExecute) {
      modelRequests++;
      assert.ok(modelRequests <= cases.length + 2, "host must make progress through the fixture tools");
      // Follow the host's returned tool-call IDs rather than assuming fixture IDs survive.
      const calls = new Map();
      for (const message of payload.messages ?? []) {
        for (const call of message.tool_calls ?? []) {
          if (!["Bash", "Shell"].includes(call.function?.name)) continue;
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
    if (probeEnabled && hasExecute) {
      for (const item of cases) {
        if (item.id !== "failure" && observed.has(item.id)) await waitForReceipt(item.command);
      }
    }
    const next = hasExecute ? cases.find((item) => !observed.has(item.id)) : undefined;
    const delta = next
      ? { role: "assistant", tool_calls: [{
          index: 0, id: next.id, type: "function",
          function: { name: shellTool.function.name, arguments: JSON.stringify({ command: next.command, description: "Run the disposable fixture command" }) },
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
    "--output-format", "stream-json", "--model", "fixture", "--prompt", "Run the disposable fixture shell tools.",
  ]);

  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "host must deliver every tool result in a follow-up model request");
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  const tools = events.filter((event) => event.role === "tool");
  assert.equal(tools.length, cases.length, "every native tool must execute");
  assert.equal(events.findLast((event) => event.role === "assistant")?.content, "fixture complete");
  assert.ok(tools.at(-1).content.includes("Command failed with exit code: 7."));
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
  await writeFile(join(configDir, "config.toml"), `
default_model = "fixture"
default_permission_mode = "manual"
telemetry = false
[providers.fixture]
type = "openai"
base_url = "http://127.0.0.1:${server.address().port}/v1"
api_key = "fixture-no-secret"
[models.fixture]
provider = "fixture"
model = "fixture"
max_context_size = 128000
capabilities = ["tool_use"]
[loop_control]
max_steps_per_turn = 8
[[permission.rules]]
decision = "allow"
pattern = "Bash"
`);
  const version = (await run(host, ["--version"])).stdout.trim();
  assert.equal(version, "2.4.1");
  const baseline = await session();
  const probe = join(root, "observation-hook.mjs");
  await writeFile(receiptsPath, "");
  await writeFile(probe, `
import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const inputText = readFileSync(0, "utf8");
const result = spawnSync(${JSON.stringify(process.execPath)}, [${JSON.stringify(cli)}, "kimi-post-tool-use"], { input: inputText, encoding: "utf8" });
appendFileSync(${JSON.stringify(receiptsPath)}, JSON.stringify({ input: JSON.parse(inputText), status: result.status, stdout: result.stdout, stderr: result.stderr }) + "\\n");
process.stdout.write(${JSON.stringify(probeMarker)});
`);
  await writeFile(join(configDir, "config.toml"), `
[[hooks]]
event = "PostToolUse"
matcher = "^Bash$"
command = ${JSON.stringify(`${quote(process.execPath)} ${quote(probe)}`)}
timeout = 10
`, { flag: "a" });
  probeEnabled = true;
  const legacy = await session();
  const normalize = (text) => text.replace(/^Wall time: \d+(?:\.\d+)? seconds\n/u, "");
  for (const item of cases) assert.equal(normalize(legacy.get(item.id)), normalize(baseline.get(item.id)), item.id);
  const listing = normalize(baseline.get("listing"));
  const files = listing.trimEnd().split("\n");
  assert.equal(files.length, 80);
  assert.deepEqual(new Set(files), new Set(Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`)));
  assert.equal(normalize(baseline.get("exact")), exact);
  assert.equal(normalize(baseline.get("raw")), listing);
  const wrapped = normalize(baseline.get("wrapped"));
  assert.ok(wrapped.length < listing.length, "explicit wrapping must compact actual native output");
  assert.match(wrapped, /80 matches/u);
  const failed = normalize(baseline.get("failure"));
  assert.ok(failed.includes(Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n") + "\n"));
  assert.ok(failed.includes("failure-stderr\nCommand failed with exit code: 7."));
  const recorded = await receipts();
  assert.equal(recorded.length, cases.length - 1);
  for (const item of recorded) {
    assert.equal(item.input.hook_event_name, "PostToolUse");
    assert.equal(item.input.tool_name, "Bash");
    assert.equal(item.status, 0);
    assert.equal(item.stdout, "");
    assert.equal(item.stderr, "");
  }
  const before = await readFile(join(configDir, "config.toml"), "utf8");
  // Retired install must fail before changing a real current-host configuration.
  await assert.rejects(run(process.execPath, [cli, "install", "kimi", "--local"]), /cannot replace tool output/u);
  assert.equal(await readFile(join(configDir, "config.toml"), "utf8"), before);
  process.stdout.write(`${JSON.stringify({ ok: true, host: "kimi", version, modelRequestsPerSession: modelRequests })}\n`);

} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
