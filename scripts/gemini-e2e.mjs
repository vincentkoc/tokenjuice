#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "gemini";
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-gemini-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const hostHome = join(root, "gemini-home");
const configDir = join(hostHome, ".gemini");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  GEMINI_CLI_HOME: hostHome,
  GEMINI_API_KEY: "fixture-no-secret",
  GEMINI_TELEMETRY_ENABLED: "false",
  DO_NOT_TRACK: "1",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  // Gemini uses Bash regardless of the user's login shell.
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
const failureOutput = Array.from({ length: 80 }, (_, index) => `failure-${index}`).join("\n") + "\n";
const failureStderr = "failure-stderr\n";
const cases = [
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "dialect", command: "values=(alpha beta); [[ ${values[1]} == beta ]] && printf '%s\\n' \"${values[1]}\"" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- find fixtures -type f` },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote(`process.stdout.write(${JSON.stringify(failureOutput)}); process.stderr.write(${JSON.stringify(failureStderr)}); process.exit(7);`)}` },
];

function commandOutput(content) {
  const match = /\nOutput: ([\s\S]*?)\n(?:Exit Code:|Process Group PGID:|<\/untrusted_context>)/u.exec(content);
  assert.ok(match, "native shell result must contain the output envelope");
  return match[1];
}

const observed = new Map();
let modelRequests = 0;
let serverError;
const server = createServer(async (request, response) => {
  try {
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    if (request.url.includes(":countTokens")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ totalTokens: 1 }));
      return;
    }
    assert.ok(request.url.includes(":streamGenerateContent"), request.url);
    const declarations = (payload.tools ?? []).flatMap((tool) => tool.functionDeclarations ?? []);
    const shellTool = declarations.find((tool) => tool.name === "run_shell_command");
    const hasExecute = Boolean(shellTool);
    if (hasExecute) {
      modelRequests++;
      assert.ok(modelRequests <= cases.length + 2, "host must make progress through fixture tools");
      const calls = new Map();
      for (const content of payload.contents ?? []) {
        for (const part of content.parts ?? []) {
          const call = part.functionCall;
          if (call?.name !== "run_shell_command") continue;
          const item = cases.find((item) => item.command === call.args.command);
          if (item) calls.set(call.id, item.id);
        }
      }
      for (const content of payload.contents ?? []) {
        for (const part of content.parts ?? []) {
          const result = part.functionResponse;
          if (result && calls.has(result.id)) {
            assert.equal(typeof result.response.output, "string", JSON.stringify(result));
            observed.set(calls.get(result.id), result.response.output);
          }
        }
      }
    }
    const next = hasExecute ? cases.find((item) => !observed.has(item.id)) : undefined;
    const parts = next
      ? [{ functionCall: { id: next.id, name: shellTool.name, args: { command: next.command, description: "Run the disposable fixture command" } } }]
      : [{ text: "fixture complete" }];
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end(`data: ${JSON.stringify({
      candidates: [{ content: { role: "model", parts }, finishReason: "STOP", index: 0 }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      modelVersion: "gemini-2.5-flash",
    })}\n\n`);
  } catch (error) {
    serverError = error;
    response.writeHead(400).end("invalid fixture request");
  }
});

async function session() {
  observed.clear();
  modelRequests = 0;
  const result = await run(host, [
    "--output-format", "stream-json", "--skip-trust",
    "--model", "gemini-2.5-flash", "--approval-mode", "default", "--allowed-tools", "run_shell_command",
    "--prompt", "Run the fixture shell tools.",
  ]);

  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "host must deliver every tool result in a follow-up model request");
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(events.find((event) => event.type === "result")?.status, "success");
  const results = events.filter((event) => event.type === "tool_result");
  assert.equal(results.length, cases.length);
  for (const item of cases) {
    const nativeResult = results.find((event) => event.tool_id === `run_shell_command__${item.id}`);
    assert.equal(nativeResult?.status, "success", `${item.id}: native tool status must survive`);
    assert.equal(nativeResult.error, undefined);
    if (item.id === "failure") assert.ok(observed.get(item.id).includes("\nExit Code: 7\n"));
    else assert.ok(!/\nExit Code: [1-9]/u.test(observed.get(item.id)));
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
  env.GOOGLE_GEMINI_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  await writeFile(join(configDir, "settings.json"), JSON.stringify({
    security: { auth: { selectedType: "gemini-api-key" } },
    model: { name: "gemini-2.5-flash", maxSessionTurns: 8 },
    general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
    privacy: { usageStatisticsEnabled: false },
    telemetry: { enabled: false },
  }));
  const version = (await run(host, ["--version"])).stdout.trim();
  const baseline = await session();
  const expectedEntries = new Set(Array.from({ length: 80 }, (_, index) => `fixtures/example-${index}.json`));
  for (const id of ["listing", "raw"]) {
    const nativeResult = baseline.get(id);
    const entries = commandOutput(nativeResult).split("\n");
    assert.equal(entries.length, 80, `${id}: native fixture must return exactly 80 entries`);
    assert.deepEqual(new Set(entries), expectedEntries, `${id}: native fixture must retain every file`);
  }
  assert.equal(commandOutput(baseline.get("exact")), exact.trim(), "native exact read must contain the fixture");
  assert.equal(commandOutput(baseline.get("dialect")), "beta", "native Bash syntax must execute independently of SHELL");
  await run(process.execPath, [cli, "install", "gemini-cli", "--local"]);
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "gemini-cli", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const installed = await session();
  const listing = installed.get("listing");
  assert.ok(commandOutput(listing).includes("80 matches"), "installed hook must compact the real shell listing before model delivery");
  assert.ok(commandOutput(listing).length < commandOutput(baseline.get("listing")).length);
  assert.equal(commandOutput(installed.get("exact")), commandOutput(baseline.get("exact")), "hook must preserve the native exact read");
  assert.equal(commandOutput(installed.get("dialect")), commandOutput(baseline.get("dialect")), "hook must retain native Bash syntax");
  const withoutPgid = (text) => text.replace(/\nProcess Group PGID: \d+(?=\n<\/untrusted_context>$)/u, "\nProcess Group PGID: <PGID>");
  assert.equal(withoutPgid(installed.get("raw")), withoutPgid(baseline.get("raw")), "raw bypass must preserve the native result apart from the process ID");
  assert.ok(installed.get("failure").includes(failureOutput.trimEnd()), "model must receive all 80 failure lines");
  const rewriteNotice = "\n\n[System] Tool input parameters were modified by a hook before execution.";
  assert.ok(installed.get("failure").endsWith(rewriteNotice), "host must retain its native input-rewrite notice");
  assert.equal(withoutPgid(installed.get("failure").slice(0, -rewriteNotice.length)), withoutPgid(baseline.get("failure")), "failure must preserve native output/status apart from process ID and rewrite notice");
  assert.ok(installed.get("failure").includes("failure-stderr"), "model must receive failure stderr");
  assert.ok(installed.get("failure").includes("\nExit Code: 7\n"), "model must receive failure status");
  process.stdout.write(`${JSON.stringify({ ok: true, host: "gemini-cli", version, modelRequestsPerSession: modelRequests, results: [...installed.keys()] }, null, 2)}\n`);
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
