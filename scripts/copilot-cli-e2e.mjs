#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "copilot";
const adapter = process.argv[3] ?? "copilot-cli";
assert.ok(["copilot-cli", "copilot-agent"].includes(adapter));
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-copilot-cli-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".copilot");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  COPILOT_HOME: configDir,
  COPILOT_OFFLINE: "true",
  ...(adapter === "copilot-agent" ? { COPILOT_AGENT_PROJECT_DIR: project } : {}),
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

function shellResult(text) {
  const match = /^(.*)\n<shellId: (\d+) completed with exit code (-?\d+)>$/su.exec(text);
  assert.ok(match, "native shell completion footer must reach the model");
  return { output: match[1], shellId: Number(match[2]), exitCode: Number(match[3]) };
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
          observed.set(calls.get(message.tool_call_id), textContent(message.content));
        }
      }
    }
    const next = hasExecute ? cases.find((item) => !observed.has(item.id)) : undefined;
    const delta = next
      ? { role: "assistant", tool_calls: [{
          index: 0, id: next.id, type: "function",
          function: { name: shellTool.function.name, arguments: JSON.stringify({ command: next.command, description: next.id }) },
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

async function session({ trustFolder = adapter === "copilot-agent" } = {}) {
  observed.clear();
  modelRequests = 0;
  const result = await run(host, [
    ...(trustFolder ? ["--trust-folder"] : []),
    "--output-format", "json", "--model", "fixture/fixture", "--no-auto-update", "--disable-builtin-mcps",
    "--no-custom-instructions", "--no-ask-user", "--allow-all-tools", "--add-dir", dirname(process.execPath),
    "--add-dir", dirname(cli), "--prompt", "Run the disposable fixture shell tools.",
  ]);

  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "host must deliver every tool result in a follow-up model request");
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map(JSON.parse);
  const tools = events.filter(e => e.type === "tool.execution_complete");
  assert.equal(tools.length, cases.length);
  for (let i = 0; i < cases.length; i++) {
    const { data } = tools[i];
    const modelResult = shellResult(observed.get(cases[i].id));
    assert.equal(data.toolCallId, cases[i].id);
    assert.equal(data.success, true, "native invocation success includes nonzero shell exits");
    assert.equal(data.shellExecution.exitCode, i === cases.length - 1 ? 7 : 0);
    assert.equal(modelResult.exitCode, data.shellExecution.exitCode);
    assert.equal(modelResult.shellId, i);
  }
  assert.ok(events.some(e => e.type === "assistant.message" && e.data.content === "fixture complete"));
  assert.ok(!events.some(e => e.type === "error" || e.type === "session.error"));
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
  await writeFile(join(configDir, "providers.json"), JSON.stringify({
    providers: [{ name: "fixture", type: "openai", baseUrl: `http://127.0.0.1:${server.address().port}/v1` }],
    models: [{ id: "fixture", provider: "fixture", maxPromptTokens: 128000, maxOutputTokens: 4096 }],
  }));
  const version = (await run(host, ["--version"])).stdout.split("\n")[0].trim();
  assert.equal(version, "GitHub Copilot CLI 1.0.105.");
  if (adapter === "copilot-agent") await run("git", ["init", "--quiet"]);
  const baseline = await session();
  await run(process.execPath, [cli, "install", adapter, "--local"]);
  const hooksPath = adapter === "copilot-agent" ? join(project, ".github", "hooks", "tokenjuice-agent.json")
    : join(configDir, "hooks", "tokenjuice-cli.json");
  const hooks = JSON.parse(await readFile(hooksPath, "utf8"));
  if (adapter === "copilot-cli") assert.equal(hooks.hooks.postToolUse[0].matcher, "bash");
  else assert.equal(hooks.hooks.postToolUse[0].bash, hooks.hooks.postToolUse[0].command);
  const originalCommand = hooks.hooks.postToolUse[0].command;
  const receipt = join(root, "hook-receipt.jsonl");
  const probe = join(project, "hook-probe.mjs");
  await writeFile(probe, `import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const input = readFileSync(0, 'utf8');
const output = execFileSync('/bin/bash', ['-c', ${JSON.stringify(originalCommand)}], { input, encoding: 'utf8' });
appendFileSync(${JSON.stringify(receipt)}, JSON.stringify({ input: JSON.parse(input), output: JSON.parse(output) }) + '\\n');
process.stdout.write(output);
`);
  hooks.hooks.postToolUse[0].command = `${quote(process.execPath)} ${quote(probe)}`;
  if (adapter === "copilot-agent") hooks.hooks.postToolUse[0].bash = hooks.hooks.postToolUse[0].command;
  await writeFile(hooksPath, JSON.stringify(hooks));
  if (adapter === "copilot-agent") {
    const untrusted = await session({ trustFolder: false });
    assert.deepEqual(untrusted, baseline, "untrusted repository hooks must not execute");
    await assert.rejects(readFile(receipt), { code: "ENOENT" });
  }
  const installed = await session();
  const receipts = (await readFile(receipt, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(receipts.length, cases.length, "the actual installed hook must run for every native bash result");
  for (let i = 0; i < cases.length; i++) {
    assert.equal(receipts[i].input.toolName, "bash");
    assert.equal(receipts[i].input.toolArgs.command, cases[i].command);
    assert.equal(receipts[i].input.toolResult.resultType, "success");
    if (i === 0) assert.equal(receipts[i].output.modifiedResult.textResultForLlm, installed.get("listing"));
    else assert.deepEqual(receipts[i].output, {});
  }
  const entries = shellResult(baseline.get("listing")).output.split("\n");
  assert.equal(entries.length, 80);
  assert.deepEqual(new Set(entries), new Set(Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`)));
  assert.equal(shellResult(baseline.get("exact")).output, exact.trim());
  assert.equal(shellResult(baseline.get("raw")).output, shellResult(baseline.get("listing")).output);
  assert.ok(installed.get("listing").length < baseline.get("listing").length);
  assert.match(installed.get("listing"), /^80 matches\n/u);
  for (const id of ["exact", "wrapped", "raw", "failure"]) assert.equal(installed.get(id), baseline.get(id), id);
  assert.ok(baseline.get("wrapped").length < baseline.get("listing").length);
  assert.match(baseline.get("wrapped"), /80 matches/u);
  const failed = baseline.get("failure");
  assert.ok(failed.includes(Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n")));
  assert.ok(failed.includes("failure-stderr"));
  process.stdout.write(`${JSON.stringify({ ok: true, host: "copilot-cli", adapter, version, modelRequestsPerSession: modelRequests })}\n`);

} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
