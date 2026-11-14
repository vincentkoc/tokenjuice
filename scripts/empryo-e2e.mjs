#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createProcessRunner } from "./e2e-process.mjs";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = resolve(process.argv[2]);
const bun = resolve(process.argv[3]);
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-empryo-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const settings = join(project, ".soulforge", "config.json");
const receipts = join(root, "hooks.jsonl");
const observer = join(root, "observe.mjs");
const env = {
  HOME: home,
  USERPROFILE: home,
  PATH: `${dirname(bun)}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  SOULFORGE_NO_REPOMAP: "1",
  DO_NOT_TRACK: "1",
  NO_PROXY: "127.0.0.1,localhost",
  no_proxy: "127.0.0.1,localhost",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  // The native host uses sh, independently of the user's configured shell.
  SHELL: "/fixture/not-a-shell",
};
const run = createProcessRunner({ cwd: project, env });
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const exact = "  exact content\r\ntrailing blanks\n\n";
// SoulForge collapses lines differing only in digits, including failed output.
const label = (index) => String.fromCharCode(97 + Math.floor(index / 26), 97 + index % 26);
const failureOutput = Array.from({ length: 80 }, (_, index) => `failure-${label(index)}`).join("\n") + "\n";
const failureStderr = "failure-stderr\n";
const cases = [
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "shell", command: "value=posix; printf '%s' \"$value\"" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- find fixtures -type f` },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote(`process.stdout.write(${JSON.stringify(failureOutput)}); process.stderr.write(${JSON.stringify(failureStderr)}); process.exit(7);`)}` },
  { id: "status", command: "printf 'status-output\\n'; exit 7" },
  { id: "denied", command: "rm -rf guarded" },
];
const inputFor = (item) => ({ command: item.command, cwd: project, timeout: 10_000 });
const readHint = (tool) => `\n\nCommand succeeded, but ${tool} is faster, gets cached, and is visible to dispatch dedup. Use ${tool} instead of shell for this.`;
const group = (label) => ({ matcher: "Bash", hooks: [{
  type: "command", command: `${quote(process.execPath)} ${quote(observer)} ${quote(receipts)} ${label}`, timeout: 10,
}] });
const observed = new Map();
let requests = 0;
let serverError;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    assert.ok(payload.tools?.some((tool) => tool.function?.name === "shell"));
    requests++;
    assert.ok(requests <= cases.length + 1, "native host must advance through tool calls");
    const calls = new Map();
    for (const message of payload.messages ?? []) {
      for (const call of message.tool_calls ?? []) {
        const item = cases.find((item) => call.function?.name === "shell"
          && JSON.parse(call.function.arguments).command === item.command);
        if (item) calls.set(call.id, item.id);
      }
    }
    for (const message of payload.messages ?? []) {
      if (message.role === "tool" && calls.has(message.tool_call_id)) {
        assert.equal(typeof message.content, "string");
        observed.set(calls.get(message.tool_call_id), message.content);
      }
    }
    const next = cases.find((item) => !observed.has(item.id));
    const delta = next ? { role: "assistant", tool_calls: [{
      index: 0, id: next.id, type: "function",
      function: { name: "shell", arguments: JSON.stringify(inputFor(next)) },
    }] } : { role: "assistant", content: "fixture complete" };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const [value, reason] of [[delta, null], [{}, next ? "tool_calls" : "stop"]]) {
      response.write(`data: ${JSON.stringify({
        id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture",
        choices: [{ index: 0, delta: value, finish_reason: reason }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  } catch (error) {
    serverError ??= error;
    response.writeHead(500).end("invalid fixture request");
  }
});

async function session(wrapped, afterObserver = false) {
  observed.clear();
  requests = 0;
  await writeFile(receipts, "");
  const result = await run(process.execPath, [host,
    "--headless", "--events", "--no-repomap", "--max-steps", "10", "--timeout", "60000",
    "--model", "fixture/fixture", "Run the disposable fixture shell tools.",
  ]).catch((error) => { throw serverError ?? error; });
  assert.ifError(serverError);
  assert.equal(requests, cases.length + 1, "every result must reach a follow-up model request");
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(events.at(-1)?.type, "done");
  assert.ok(events.some((event) => event.type === "text" && event.content === "fixture complete"));
  assert.equal(await readFile(join(project, "guarded"), "utf8"), "preserve me\n");
  // PostToolUse commands run asynchronously and can outlive the model response.
  let recorded = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    const text = await readFile(receipts, "utf8");
    recorded = text.slice(0, text.lastIndexOf("\n")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
    if (recorded.filter((entry) => entry.label === "result").length === cases.length) break;
    await delay(100);
  }
  assert.equal(recorded.filter((entry) => entry.label === "result").length, cases.length);
  const before = recorded.filter((entry) => entry.label === "before");
  assert.equal(before.length, cases.length, "native loader must execute the custom hook");
  for (const [index, item] of cases.entries()) {
    assert.equal(before[index].input.tool_name, "Bash");
    assert.deepEqual(before[index].input.tool_input, inputFor(item));
  }
  const after = recorded.filter((entry) => entry.label === "after");
  assert.equal(after.length, afterObserver ? cases.length : 0);
  for (const [index, entry] of after.entries()) {
    const item = cases[index];
    const input = entry.input.tool_input;
    assert.equal(input.cwd, project);
    assert.equal(input.timeout, 10_000);
    if (wrapped && item.id !== "raw") {
      assert.ok(input.command.includes("--keep-failures"));
      assert.ok(input.command.includes("--source empryo"));
      assert.match(input.command, /\/sh -c /u);
      assert.ok(!input.command.includes(" -lc "));
    } else {
      assert.equal(input.command, item.command);
    }
  }
  const responses = recorded.filter((entry) => entry.label === "result")
    .map((entry) => entry.input.tool_response);
  assert.deepEqual(responses.find((response) => response?.output === failureOutput), {
    success: false, output: failureOutput, error: failureStderr,
  }, "native failed result must retain all stdout, stderr and its failure flag");
  assert.deepEqual(responses.find((response) => response?.output === "status-output\n"), {
    success: false, output: "status-output\n", error: "Exit code: 7",
  }, "native exit status must survive wrapping");
  return new Map(observed);
}

try {
  assert.notEqual(process.platform, "win32");
  await mkdir(join(home, ".soulforge"), { recursive: true });
  await mkdir(join(project, ".soulforge"), { recursive: true });
  await mkdir(join(project, "fixtures"));
  await mkdir(env.TMPDIR);
  await writeFile(observer, `import { appendFile } from "node:fs/promises";
let text = ""; for await (const chunk of process.stdin) text += chunk;
await appendFile(process.argv[2], JSON.stringify({label: process.argv[3], input: JSON.parse(text)}) + "\\n");
`);
  await Promise.all(Array.from({ length: 80 }, (_, index) =>
    writeFile(join(project, "fixtures", `example-${label(index)}.json`), "{}\n")));
  await writeFile(join(project, "exact.txt"), exact);
  await writeFile(join(project, "guarded"), "preserve me\n");
  const custom = { fixtureSentinel: "preserve", hooks: {
    PreToolUse: [group("before")], PostToolUse: [group("result")],
  } };
  await writeFile(settings, JSON.stringify(custom));
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  await writeFile(join(home, ".soulforge", "config.json"), JSON.stringify({
    defaultModel: "fixture/fixture",
    providers: [{ id: "fixture", baseURL: `http://127.0.0.1:${server.address().port}/v1`, models: ["fixture"], modelsAPI: false }],
    repoMap: false, telemetry: false, telemetryNoticeShown: true,
    webSearch: false, codeIntelligence: { enabled: false },
  }));
  const version = (await run(process.execPath, [host, "--version"])).stdout.trim();
  assert.equal(version, "soulforge 2.20.25");
  const baseline = await session(false);
  await run(process.execPath, [cli, "install", "empryo", "--local"]);
  const installedSettings = JSON.parse(await readFile(settings, "utf8"));
  assert.equal(installedSettings.fixtureSentinel, custom.fixtureSentinel);
  assert.deepEqual(installedSettings.hooks.PreToolUse[0], group("before"));
  assert.equal(installedSettings.hooks.PreToolUse.length, 2);
  installedSettings.hooks.PreToolUse.push(group("after"));
  await writeFile(settings, JSON.stringify(installedSettings));
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "empryo", "--local", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const installed = await session(true, true);
  await run(process.execPath, [cli, "uninstall", "soulforge"]);
  assert.deepEqual(JSON.parse(await readFile(settings, "utf8")), {
    ...custom, hooks: { ...custom.hooks, PreToolUse: [group("before"), group("after")] },
  });
  assert.deepEqual(await session(false, true), baseline);
  const nativeListing = baseline.get("listing");
  assert.ok(nativeListing.endsWith(readHint("glob")));
  const listingOutput = nativeListing.slice(0, -readHint("glob").length);
  assert.deepEqual(new Set(listingOutput.trimEnd().split("\n")),
    new Set(Array.from({ length: 80 }, (_, index) => `fixtures/example-${label(index)}.json`)));
  assert.ok(installed.get("listing").includes("80 matches"));
  assert.ok(installed.get("listing").length < baseline.get("listing").length);
  // The unwrapped host adds a read-tool hint; the exact file bytes stay unchanged.
  assert.equal(baseline.get("exact"), exact + readHint("read"));
  assert.equal(installed.get("exact"), exact);
  for (const results of [baseline, installed]) {
    assert.equal(results.get("shell"), "posix");
    assert.equal(results.get("raw"), listingOutput);
    assert.equal(results.get("failure"), failureOutput);
    assert.equal(results.get("status"), "status-output\n");
    assert.equal(results.get("denied"), "Denied: delete files/directories");
  }
  // This pinned host serializes output alone, omitting the separate error/status.
  // Do not turn native acceptance into a claim of complete failure delivery.
  process.stdout.write(`${JSON.stringify({
    ok: true, host: "empryo", version, modelRequestsPerSession: requests,
    hooks: "loaded/rewritten/uninstalled", shell: "sh -c", permission: "default denial preserved",
    listing: "80-entry summary", exactRead: "file bytes preserved; native hint removed",
    raw: "preserved", failure: "native result preserves stdout/stderr/status; model sees stdout only",
  })}\n`);
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
