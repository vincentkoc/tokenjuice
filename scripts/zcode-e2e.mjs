#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProcessRunner } from "./e2e-process.mjs";

const cli = process.argv[3] ? resolve(process.argv[3]) : fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = resolve(process.argv[2]);
const shell = process.argv[4] ?? "/bin/bash";
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-zcode-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  USERPROFILE: home,
  ZCODE_DATA_BASE_DIR: home,
  ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: join(home, ".zcode", "v2", "provider_config.json"),
  // Explicit native paths keep the bundled definitions local; no CDN refresh.
  ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: join(dirname(host), "provider", "zcode-builtin.json"),
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  SHELL: shell,
  DO_NOT_TRACK: "1",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
};
const run = createProcessRunner({ cwd: project, env });
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const failureOutput = Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n") + "\n";
const failureStderr = "failure-stderr\n";
const exact = "  exact content\r\ntrailing blanks\n\n";
const cases = [
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- find fixtures -type f` },
  { id: "failure", command: `${quote(process.execPath)} fail.cjs` },
  { id: "change_directory", command: "cd nested" },
  { id: "nested_directory", command: "pwd" },
  { id: "compound", command: "cd .. && printf 'compound-preserved\\n'" },
  { id: "restored_directory", command: "pwd" },
];

function textContent(content) {
  if (typeof content === "string") return content;
  assert.ok(Array.isArray(content), "native tool result must contain text");
  return content.map((part) => {
    assert.equal(part.type, "text");
    return part.text;
  }).join("");
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
    const bash = payload.tools?.find((tool) => tool.function?.name === "Bash");
    assert.ok(bash, "native model request must advertise the actual Bash tool");
    assert.equal(bash.function.parameters.properties.command.type, "string");
    modelRequests++;
    assert.ok(modelRequests <= cases.length + 1, "native session must make progress");
    for (const message of payload.messages ?? []) {
      if (message.role === "tool" && cases.some((item) => item.id === message.tool_call_id)) {
        observed.set(message.tool_call_id, textContent(message.content));
      }
    }
    const next = cases.find((item) => !observed.has(item.id));
    const message = next
      ? { role: "assistant", content: null, tool_calls: [{
          id: next.id, type: "function", function: { name: bash.function.name,
            arguments: JSON.stringify({ command: next.command, description: "Run the disposable fixture command" }) },
        }] }
      : { role: "assistant", content: "fixture complete" };
    const finishReason = next ? "tool_calls" : "stop";
    const common = { id: "fixture", created: 0, model: "fixture", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
    if (payload.stream) {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      const delta = next ? { ...message, tool_calls: message.tool_calls.map((call) => ({ index: 0, ...call })) } : message;
      response.write(`data: ${JSON.stringify({ ...common, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ ...common, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\n`);
      response.end("data: [DONE]\n\n");
    } else {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ...common, object: "chat.completion", choices: [{ index: 0, message, finish_reason: finishReason }] }));
    }
  } catch (error) {
    serverError = error;
    response.writeHead(500).end("invalid fixture request");
  }
});

async function session() {
  observed.clear();
  modelRequests = 0;
  serverError = undefined;
  const result = await run(process.execPath, [host, "--prompt", "Run the fixture shell tools.", "--cwd", project, "--mode", "yolo", "--json", "--no-color"]);
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "all results must reach a subsequent model request");
  assert.equal(observed.size, cases.length);
  assert.ok(result.stdout.includes("fixture complete"), result.stdout.slice(-1500));
  return new Map(observed);
}

try {
  await Promise.all([mkdir(join(home, ".zcode", "cli"), { recursive: true }), mkdir(dirname(env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE), { recursive: true }),
    mkdir(join(project, "fixtures"), { recursive: true }), mkdir(join(project, "nested"), { recursive: true }), mkdir(env.TMPDIR, { recursive: true })]);
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(project, "fixtures", `example-${i}.json`), "{}\n")));
  await writeFile(join(project, "exact.txt"), exact);
  await writeFile(join(project, "fail.cjs"), `process.stdout.write(${JSON.stringify(failureOutput)}); process.stderr.write(${JSON.stringify(failureStderr)}); process.exit(7);`);
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  await writeFile(env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE, JSON.stringify({ schemaVersion: 1, config: {
    providerConfigRules: { providerRules: [{ providerId: "fixture", providerName: "Fixture", config: {
      group: "standard-personal", access: { type: "api-key", apiKey: "fixture-no-secret" },
      api: { type: "openai-chat-completions", baseUrl: `http://127.0.0.1:${server.address().port}/v1` }, personalModelIds: ["fixture"],
    } }] }, modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] },
    defaultModelSelection: { providerId: "fixture", modelId: "fixture" },
  } }), { mode: 0o600 });
  await writeFile(join(home, ".zcode", "cli", "config.json"), JSON.stringify({
    features: { mcp: false, subagent: false, memory: false, skill: false }, memory: { use: false },
    plugins: { enabled: false }, skills: { enabled: false },
  }));
  const version = (await run(process.execPath, [host, "--version"])).stdout.trim();
  assert.equal(version, "0.17.1", "this fixture qualifies the pinned 3.18.2 desktop agent");
  const baseline = await session();
  const expectedEntries = new Set(Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`));
  for (const id of ["listing", "raw"]) {
    assert.deepEqual(new Set(baseline.get(id).split("\n")), expectedEntries);
  }
  // ZCode trims the final whitespace before model delivery, including without hooks.
  assert.equal(baseline.get("exact"), exact.trimEnd());
  assert.equal(baseline.get("failure"), `Exit code 7\n${failureOutput}${failureStderr}`.trimEnd());
  assert.equal(baseline.get("compound"), "compound-preserved");
  await run(process.execPath, [cli, "install", "zcode", "--local"]);
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "zcode", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const installed = await session();
  assert.ok(installed.get("listing").includes("80 matches"), installed.get("listing"));
  assert.ok(installed.get("listing").length < baseline.get("listing").length);
  for (const id of ["exact", "raw", "failure", "change_directory", "nested_directory", "compound", "restored_directory"]) {
    assert.equal(installed.get(id), baseline.get(id), `${id}: native model-visible result must be preserved`);
  }
  assert.ok(installed.get("nested_directory").includes(join(project, "nested")));
  assert.ok(installed.get("restored_directory").includes(project));
  await run(process.execPath, [cli, "uninstall", "zcode"]);
  const uninstalled = await session();
  assert.deepEqual(uninstalled, baseline, "uninstall must restore native model-visible results");
  assert.equal(JSON.parse((await run(process.execPath, [cli, "doctor", "zcode", "--format", "json"])).stdout).status, "disabled");
  process.stdout.write(`${JSON.stringify({ ok: true, host: "zcode", version, shell, sessions: 3,
    modelRequestsPerSession: modelRequests, listingBytes: { baseline: baseline.get("listing").length, installed: installed.get("listing").length },
    results: [...installed.keys()] }, null, 2)}\n`);
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
