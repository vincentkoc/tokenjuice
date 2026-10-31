#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "qwen";
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-qwen-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".qwen");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  QWEN_HOME: configDir,
  QWEN_PROJECT_DIR: project,
  QWEN_USAGE_STATISTICS_ENABLED: "0",
  DO_NOT_TRACK: "1",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  // Qwen Code uses Bash regardless of the user's login shell.
  SHELL: process.execPath,
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
  { id: "dialect", command: "values=(alpha beta); [[ ${values[1]} == beta ]] && printf '%s\\n' \"${values[1]}\"" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- find fixtures -type f` },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote("process.stdout.write('failure-output\\n'); process.stderr.write('failure-stderr\\n'); process.exit(7)")}` },
];
function textContent(content) {
  if (typeof content === "string") return content;
  assert.ok(Array.isArray(content));
  assert.equal(content.length, 1);
  assert.equal(content[0].type, "text");
  return content[0].text;
}

function commandOutput(content) {
  const match = /\nOutput: ([\s\S]*?)\nError: /u.exec(content);
  assert.ok(match, "native shell result must contain the output envelope");
  return match[1];
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
    const shellTool = payload.tools?.find((tool) => ["Bash", "run_shell_command"].includes(tool.function?.name));
    const hasExecute = Boolean(shellTool);
    if (hasExecute) {
      modelRequests++;
      assert.ok(modelRequests <= cases.length + 2, "host must make progress through the fixture tools");
      // Follow the host's returned tool-call IDs rather than assuming fixture IDs survive.
      const calls = new Map();
      for (const message of payload.messages ?? []) {
        for (const call of message.tool_calls ?? []) {
          if (!["Bash", "run_shell_command"].includes(call.function?.name)) continue;
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
    "--output-format", "stream-json", "--auth-type", "openai",
    "--model", "fixture", "--approval-mode", "default", "--allowed-tools", "run_shell_command",
    "--max-session-turns", "8", "--max-wall-time", "60s",
    "--prompt", "Run the fixture shell tools.",
  ]);

  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "host must deliver every tool result in a follow-up model request");
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  const completed = events.find((event) => event.type === "result");
  assert.equal(completed?.is_error, false);
  assert.equal(completed?.result, "fixture complete");
  const results = events.flatMap((event) => event.type === "user" ? event.message?.content ?? [] : [])
    .filter((part) => part.type === "tool_result");
  assert.equal(results.length, cases.length);
  assert.deepEqual(completed.permission_denials, []);
  for (const item of cases) {
    const failed = item.id === "failure";
    const nativeResult = results.find((part) => part.tool_use_id === item.id);
    assert.equal(nativeResult?.is_error, failed, `${item.id}: native failure flag must survive`);
    assert.ok(observed.get(item.id).includes(`\nExit Code: ${failed ? 7 : 0}\n`),
      `${item.id}: model must receive native exit status`);
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
    security: { auth: { selectedType: "openai", apiKey: "fixture-no-secret", baseUrl: `http://127.0.0.1:${server.address().port}/v1` } },
    model: { name: "fixture" },
    general: { disableAutoUpdate: true, disableUpdateNag: true },
    privacy: { usageStatisticsEnabled: false },
    telemetry: { enabled: false },
    tools: { visible: ["run_shell_command"] },
  }));
  await writeFile(join(configDir, "trustedFolders.json"), JSON.stringify({ [project]: "TRUST_FOLDER" }));
  const version = (await run(host, ["--version"])).stdout.trim();
  const baseline = await session();
  const expectedEntries = new Set(Array.from({ length: 80 }, (_, index) => `fixtures/example-${index}.json`));
  for (const id of ["listing", "raw"]) {
    const nativeResult = baseline.get(id);
    const entries = commandOutput(nativeResult).split("\n");
    assert.equal(entries.length, 80, `${id}: native fixture must return exactly 80 entries; received ${JSON.stringify(commandOutput(nativeResult)).slice(0, 2000)}`);
    assert.deepEqual(new Set(entries), expectedEntries, `${id}: native fixture must retain every file`);
  }
  assert.equal(commandOutput(baseline.get("exact")), exact.trim(), "native exact read must contain the fixture");
  assert.equal(commandOutput(baseline.get("dialect")), "beta", `native Bash syntax must execute independently of SHELL: ${baseline.get("dialect")}`);
  await run(process.execPath, [cli, "install", "qwen-code", "--local"]);
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "qwen-code", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const installed = await session();
  const listing = installed.get("listing");
  assert.ok(commandOutput(listing).includes("80 matches"), "installed hook must compact the real shell listing before model delivery");
  assert.ok(commandOutput(listing).length < commandOutput(baseline.get("listing")).length);
  assert.equal(commandOutput(installed.get("exact")), commandOutput(baseline.get("exact")), "hook must preserve the native exact read");
  assert.equal(commandOutput(installed.get("dialect")), commandOutput(baseline.get("dialect")), "hook must retain native Bash syntax");
  assert.deepEqual(installed.get("raw"), baseline.get("raw"), "raw bypass must preserve the native result");
  assert.ok(installed.get("failure").includes("failure-output"), "model must receive failure output");
  assert.ok(installed.get("failure").includes("failure-stderr"), "model must receive failure stderr");
  assert.ok(installed.get("failure").includes("\nExit Code: 7\n"), "model must receive failure status");
  process.stdout.write(`${JSON.stringify({ ok: true, host: "qwen-code", version, modelRequestsPerSession: modelRequests, results: [...installed.keys()] }, null, 2)}\n`);
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
