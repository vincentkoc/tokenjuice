#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "grok-cli";
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-grok-cli-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".grok");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
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
let modelRequests = 0;
let serverError;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);

    const shellTool = payload.tools?.find((tool) => ["bash"].includes(tool.function?.name));
    const hasExecute = Boolean(shellTool);
    if (hasExecute) {
      modelRequests++;
      assert.ok(modelRequests <= cases.length + 2, "host must make progress through the fixture tools");
      // Follow the host's returned tool-call IDs rather than assuming fixture IDs survive.
      const calls = new Map();
      for (const message of payload.messages ?? []) {
        for (const call of message.tool_calls ?? []) {
          if (!["bash"].includes(call.function?.name)) continue;
          const input = JSON.parse(call.function.arguments);
          const item = cases.find((item) => item.command === input.command);
          if (item) calls.set(call.id, item.id);
        }
      }
      for (const message of payload.messages ?? []) {
        if (message.role === "tool" && calls.has(message.tool_call_id)) {
          observed.set(calls.get(message.tool_call_id), JSON.parse(textContent(message.content)));
        }
      }
    }
    const next = hasExecute ? cases.find((item) => !observed.has(item.id)) : undefined;
    const delta = next
      ? { role: "assistant", tool_calls: [{
          index: 0, id: next.id, type: "function",
          function: { name: shellTool.function.name, arguments: JSON.stringify({ command: next.command }) },
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
    "--format", "json", "--max-tool-rounds", "8", "--prompt", "Run the disposable fixture shell tools.",
  ]);

  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "host must deliver every tool result in a follow-up model request");
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map(JSON.parse);
  const toolEvents = events.filter(e => e.type === "tool_use");
  assert.equal(toolEvents.length, cases.length);
  assert.deepEqual(toolEvents.map(e => e.toolResult.success), [true, true, true, true, false]);
  for (let i = 0; i < cases.length; i++) {
    const { success, output } = toolEvents[i].toolResult;
    assert.deepEqual({ success, output }, observed.get(cases[i].id));
  }
  assert.equal(toolEvents.at(-1).toolResult.error, observed.get("failure").output);
  assert.equal(events.findLast(e => e.type === "text")?.text, "fixture complete");
  assert.ok(!events.some(e => e.type === "error"));
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
  env.GROK_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  const settingsPath = join(configDir, "user-settings.json");
  await writeFile(settingsPath, JSON.stringify({ apiKey: "fixture-no-secret" }));
  const version = (await run(host, ["--version"])).stdout.trim();
  assert.equal(version, "1.1.4");
  const baseline = await session();
  const marker = join(root, "hook-ran");
  await writeFile(settingsPath, JSON.stringify({ apiKey: "fixture-no-secret", hooks: { PostToolUse: [{
    matcher: "bash", hooks: [{ type: "command", command: `${quote(process.execPath)} -e ${quote(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')` )}` }],
  }] } }));
  const legacy = await session();
  assert.deepEqual(legacy, baseline, "the packaged host does not deliver hook replacement");
  await assert.rejects(readFile(marker), { code: "ENOENT" });
  const entries = baseline.get("listing").output.split("\n");
  assert.equal(entries.length, 80);
  assert.deepEqual(new Set(entries), new Set(Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`)));
  assert.equal(baseline.get("exact").output, exact.trim());
  assert.equal(baseline.get("raw").output, baseline.get("listing").output);
  assert.equal(baseline.get("wrapped").success, true);
  assert.ok(baseline.get("wrapped").output.length < baseline.get("listing").output.length);
  assert.match(baseline.get("wrapped").output, /80 matches/u);
  const failed = baseline.get("failure");
  assert.equal(failed.success, false);
  assert.ok(failed.output.includes(Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n")));
  assert.ok(failed.output.includes("STDERR: failure-stderr"));
  const before = await readFile(settingsPath, "utf8");
  await assert.rejects(run(process.execPath, [cli, "install", "grok-cli", "--local"]), /do not replace tool output/u);
  assert.equal(await readFile(settingsPath, "utf8"), before);
  assert.equal((await run(process.execPath, [cli, "grok-cli-post-tool-use"])).stdout, "{}\n");
  process.stdout.write(`${JSON.stringify({ ok: true, host: "grok-cli", version, modelRequestsPerSession: modelRequests })}\n`);

} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
