#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "cline";
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-cline-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".cline");
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
cases.push({ id: "batch", commands: [cases[0].command, cases[3].command] });
const commandsFor = item => item.commands ?? [item.command];
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

    const shellTool = payload.tools?.find((tool) => tool.function?.name === "run_commands");
    assert.ok(shellTool, "available tools: " + JSON.stringify(payload.tools?.map(t => t.function?.name)));
    const hasExecute = Boolean(shellTool);

    if (hasExecute) {
      modelRequests++;
      assert.ok(modelRequests <= cases.length + 2, "host must make progress through the fixture tools");
      // Follow the host's returned tool-call IDs rather than assuming fixture IDs survive.
      const calls = new Map();
      for (const message of payload.messages ?? []) {
        for (const call of message.tool_calls ?? []) {
          if (call.function?.name !== "run_commands") continue;
          const input = JSON.parse(call.function.arguments);
          const item = cases.find((item) => JSON.stringify(commandsFor(item)) === JSON.stringify(input.commands));
          if (item) calls.set(call.id, item.id);
        }
      }
      for (const message of payload.messages ?? []) {
        if (message.role === "tool" && calls.has(message.tool_call_id)) {
          const id = calls.get(message.tool_call_id);
          const results = JSON.parse(textContent(message.content));
          assert.equal(results.length, id === "batch" ? 2 : 1);
          observed.set(id, id === "batch" ? results : results[0]);
        }
      }
    }
    const next = hasExecute ? cases.find((item) => !observed.has(item.id)) : undefined;
    const delta = next
      ? { role: "assistant", tool_calls: [{
          index: 0, id: next.id, type: "function",
          function: { name: shellTool.function.name, arguments: JSON.stringify({ commands: commandsFor(next) }) },
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
  const result = await run(host, ["--config", configDir, "--data-dir", join(configDir, "data"), "--provider", "openai", "--model", "fixture", "--compaction", "off", "--thinking", "none", "--json", "Run the disposable fixture tools."]);

  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "host must deliver every tool result in a follow-up model request");
  assert.equal(observed.size, cases.length);
  assert.ok(result.stdout.includes("fixture complete"));
  const events = result.stdout.trim().split("\n").map(JSON.parse);
  const finished = events.filter(item => item.type === "agent_event" && item.event.type === "content_end" && item.event.contentType === "tool");
  assert.equal(finished.length, cases.length);
  for (const item of cases) {
    const event = finished.find(entry => entry.event.toolCallId === item.id)?.event;
    assert.equal(event?.toolName, "run_commands");
    assert.deepEqual(event.output, item.id === "batch" ? observed.get(item.id) : [observed.get(item.id)]);
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
  await run(host, ["auth", "openai", "--config", configDir, "--data-dir", join(configDir, "data"), "--apikey", "fixture-no-secret", "--modelid", "fixture", "--baseurl", `http://127.0.0.1:${server.address().port}/v1`]);
  const version = (await run(host, ["--version"])).stdout.trim();
  assert.equal(version, "3.0.74");
  const baseline = await session();
  const legacyDir = join(home, "Documents", "Cline", "Hooks");
  await mkdir(legacyDir, { recursive: true });
  const legacyPath = join(legacyDir, "tokenjuice-post-tool-use");
  await writeFile(legacyPath, `#!/usr/bin/env bash\nset -euo pipefail\nexec ${quote(process.execPath)} ${quote(cli)} cline-post-tool-use\n`, { mode: 0o755 });
  const marker = join(root, "legacy-hook-ran");
  const installedScript = await readFile(legacyPath, "utf8");
  await writeFile(legacyPath, installedScript.replace("set -euo pipefail", `set -euo pipefail\nprintf ran > ${quote(marker)}`));
  const legacy = await session();
  assert.deepEqual(legacy, baseline);
  await assert.rejects(readFile(marker), { code: "ENOENT" });
  // Replace the instrumented legacy file with the exact old generated script for migration.
  await writeFile(legacyPath, installedScript);
  const installed = JSON.parse((await run(process.execPath, [cli, "install", "cline", "--local", "--format", "json"])).stdout);
  await assert.rejects(readFile(legacyPath), { code: "ENOENT" });
  const generatedScript = await readFile(installed.hookPath, "utf8");
  const probe = join(root, "pre-probe.mjs");
  const receipts = join(root, "pre-receipts.jsonl");
  await writeFile(probe, `import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
let raw = ''; for await (const chunk of process.stdin) raw += chunk;
const output = execFileSync('/bin/bash', ['-c', ${JSON.stringify(installed.command)}], { input: raw, encoding: 'utf8' });
appendFileSync(${JSON.stringify(receipts)}, JSON.stringify({ payload: JSON.parse(raw), response: JSON.parse(output) }) + '\\n');
process.stdout.write(output);
`);
  await writeFile(installed.hookPath, `#!/usr/bin/env bash\nexec ${quote(process.execPath)} ${quote(probe)}\n`, { mode: 0o755 });
  const rewritten = await session();
  assert.match(rewritten.get('listing').result, /80 matches/u);
  assert.ok(rewritten.get('listing').result.length < baseline.get('listing').result.length);
  for (const item of cases.slice(1, 5)) {
    assert.equal(rewritten.get(item.id).result, baseline.get(item.id).result);
    assert.equal(rewritten.get(item.id).success, baseline.get(item.id).success);
  }
  const seen = (await readFile(receipts, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(seen.length, cases.length);
  for (const [index, receipt] of seen.entries()) {
    assert.equal(receipt.payload.hookName, "tool_call");
    assert.equal(receipt.payload.tool_call.name, "run_commands");
    assert.deepEqual(receipt.payload.tool_call.input.commands, commandsFor(cases[index]));
    if (["wrapped", "raw"].includes(cases[index].id)) assert.deepEqual(receipt.response, {});
    else assert.ok(receipt.response.overrideInput.commands[0].includes("wrap --keep-failures"));
  }
  assert.match(rewritten.get("batch")[0].result, /80 matches/u);
  assert.equal(rewritten.get("batch")[1].result, baseline.get("listing").result);
  assert.equal(seen.at(-1).response.overrideInput.commands[1], cases[3].command);
  await writeFile(installed.hookPath, generatedScript, { mode: 0o755 });
  const sibling = join(dirname(installed.hookPath), "custom-hook");
  await writeFile(sibling, "custom hook\n");
  const removed = JSON.parse((await run(process.execPath, [cli, "uninstall", "cline", "--format", "json"])).stdout);
  assert.equal(removed.removed, true);
  await assert.rejects(readFile(installed.hookPath), { code: "ENOENT" });
  assert.equal(await readFile(sibling, "utf8"), "custom hook\n");


  const entries = baseline.get("listing").result.trimEnd().split("\n");
  assert.equal(entries.length, 80);
  assert.deepEqual(new Set(entries), new Set(Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`)));
  assert.equal(baseline.get("exact").result, exact);
  assert.equal(baseline.get("raw").result, baseline.get("listing").result);
  assert.equal(baseline.get("wrapped").success, true);
  assert.ok(baseline.get("wrapped").result.length < baseline.get("listing").result.length);
  assert.match(baseline.get("wrapped").result, /80 matches/u);
  const failed = baseline.get("failure");
  assert.equal(failed.success, false);
  assert.equal(failed.error, "Command exited with code 7");
  assert.match(failed.result, /^\[Command exited with code 7\]\n/u);
  assert.equal(rewritten.get("failure").error, failed.error);
  assert.ok(failed.result.includes(Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n")));
  assert.ok(failed.result.includes("[stderr]\nfailure-stderr"));
  process.stdout.write(`${JSON.stringify({ ok: true, host: "cline", version, modelRequestsPerSession: modelRequests })}\n`);

} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
