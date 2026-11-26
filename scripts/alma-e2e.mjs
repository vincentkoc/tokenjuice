#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { removeReadOnlyFixture } from "./e2e-process.mjs";

const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-alma-e2e-")));
const home = join(root, "home");
const bin = join(root, "bin");
const exactFile = join(root, "exact.txt");
const exactText = "first fixture line\nsecond fixture line\n";
const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const bundle = fileURLToPath(new URL("../dist/hosts/alma/bundle/", import.meta.url));
const runtime = "/opt/alma-server";
const trace = join(root, "wrapped");
const base = "http://127.0.0.1:23001";
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const env = {
  HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"),
  XDG_CACHE_HOME: join(home, ".cache"), ALMA_DATA_DIR: join(home, "data"),
  ALMA_API_URL: base, ALMA_PORT: "23001", ALMA_TOOL_APPROVAL: "auto",
  PATH: [bin, dirname(process.execPath), "/usr/local/bin", "/usr/bin", "/bin"].join(":"),
};
// Alma reduces file inventories itself, so use ordinary progress output for this comparison.
const list = "seq -f 'fixture-progress-%03g' 0 159";
const expected = Array.from({ length: 160 }, (_, i) => `fixture-progress-${String(i).padStart(3, "0")}\n`).join("");
let turn;
let modelError;
const model = createServer(async (request, response) => {
  try {
    if (request.method === "GET") {
      const entry = { id: "gpt-4o", object: "model", created: 1, owned_by: "fixture" };
      if (request.url === "/v1/models" || request.url === "/v1/models/gpt-4o") {
        const data = request.url === "/v1/models" ? { object: "list", data: [entry] } : entry;
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(data));
      } else {
        response.writeHead(404).end();
      }
      return;
    }
    assert.equal(request.method, "POST", `Unexpected Alma provider request: ${request.method} ${request.url}`);
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    // Alma asks the configured provider for embeddings while preparing a fresh turn.
    if (request.url === "/v1/embeddings") {
      const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
      const embedding = [1, ...Array(1535).fill(0)];
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        object: "list", model: payload.model, data: inputs.map((_, index) => ({ object: "embedding", index, embedding })),
        usage: { prompt_tokens: 1, total_tokens: 1 },
      }));
      return;
    }
    assert.equal(request.url, "/v1/responses");
    const input = Array.isArray(payload.input) ? payload.input : [];
    const requested = turn && JSON.stringify(payload.input).includes(turn.prompt);
    const tools = payload.tools ?? [];
    const bash = tools.find(tool => tool.type === "function" && tool.name?.toLowerCase() === "bash");
    const names = tools.map(tool => tool.name ?? tool.type).join(",") || "none";
    const roles = input.map(item => item.role ?? item.type).join(",") || typeof payload.input;
    const descriptor = `model=${payload.model} tools=${names} input=${roles} fixturePrompt=${Boolean(requested)}`;
    if (turn && !turn.requests.has(descriptor)) {
      turn.requests.add(descriptor);
    }
    const result = input.find(item => item.type === "function_call_output" && item.call_id === turn?.id);
    if (result) turn.result = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
    const needsTool = requested && bash && !result && !turn.result;
    if (needsTool) assert.equal(++turn.calls, 1, "Alma must return the native Bash result to its model");
    const item = needsTool ? {
      type: "function_call", id: `fc_${turn.id}`, call_id: turn.id, name: bash.name, status: "completed",
      arguments: JSON.stringify({ command: turn.command, description: "Read the disposable fixture" }),
    } : { type: "message", id: "msg_fixture", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: "fixture complete", annotations: [] }] };
    const envelope = { id: `resp_${turn?.id ?? "aux"}_${needsTool ? "tool" : "done"}`, object: "response",
      model: "gpt-4o", created_at: 1, status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    if (payload.stream) {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      let sequence = 0;
      const event = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...data })}\n\n`);
      event("response.created", { response: { ...envelope, status: "in_progress", output: [] } });
      event("response.output_item.added", { output_index: 0, item: needsTool
        ? { ...item, arguments: "", status: "in_progress" } : { ...item, content: [], status: "in_progress" } });
      if (needsTool) {
        event("response.function_call_arguments.delta", { item_id: item.id, output_index: 0, delta: item.arguments });
        event("response.function_call_arguments.done", { item_id: item.id, output_index: 0, arguments: item.arguments });
      } else {
        event("response.output_text.delta", { item_id: item.id, output_index: 0, content_index: 0, delta: "fixture complete" });
      }
      event("response.output_item.done", { output_index: 0, item });
      event("response.completed", { response: envelope });
      response.end();
    } else {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(envelope));
    }
    if (result) turn.complete();
  } catch (error) {
    modelError = error;
    turn?.fail(error);
    response.writeHead(500).end("invalid fixture request");
  }
});

async function api(path, method = "GET", data) {
  const response = await fetch(base + path, {
    method, headers: { "content-type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(12_000),
  });
  const body = await response.text();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

async function bashTurn(providerId, label, command) {
  const thread = await api("/api/threads", "POST", { title: label, headless: true });
  const socket = new WebSocket(base.replace("http:", "ws:") + "/ws/threads");
  const done = Promise.withResolvers();
  const events = new Set();
  turn = { id: `call_${label}`, command, calls: 0, requests: new Set(), prompt: `Use the Bash tool to run the ${label} fixture command.`, complete: done.resolve, fail: done.reject };
  const deadline = setTimeout(() => done.reject(new Error(`${label}: no native Bash result; requests: ${[...turn.requests]}; events: ${[...events].join(", ")}`)), 40_000);
  try {
    // The shipped Alma client sends this message to the same pipeline as its web composer.
    socket.addEventListener("open", () => socket.send(JSON.stringify({
      type: "generate_response",
      data: { threadId: thread.id, model: `${providerId}:gpt-4o`, tools: ["Bash"], userMessage: { role: "user", parts: [{ type: "text", text: turn.prompt }] } },
    })));
    socket.addEventListener("error", () => done.reject(new Error("Alma generation socket failed")));
    socket.addEventListener("message", event => {
      const { type, data } = JSON.parse(event.data);
      events.add(type);
      if (type === "generation_error" && data?.threadId === thread.id) done.reject(new Error(JSON.stringify(data).slice(0, 700)));
    });
    await done.promise;
  } finally {
    clearTimeout(deadline);
    socket.close();
  }
  assert.ifError(modelError);
  assert.equal(turn.calls, 1, `${label}: native Bash dispatch`);
  assert.ok(turn.result, `${label}: result reached the next model request`);
  return JSON.parse(turn.result);
}

let host;
let hostLog = "";
try {
  await Promise.all([home, bin].map(path => mkdir(path)));
  await writeFile(trace, "");
  await writeFile(join(bin, "tokenjuice"), `#!/bin/sh\nprintf '%s\\n' "$*" >> ${shellQuote(trace)}\nexec ${shellQuote(process.execPath)} ${shellQuote(cli)} "$@"\n`, { mode: 0o755 });
  await writeFile(exactFile, exactText);
  await new Promise(ready => model.listen(0, "127.0.0.1", ready));
  host = spawn(join(runtime, "bin/alma-server"), [], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [host.stdout, host.stderr]) stream.on("data", data => { hostLog = (hostLog + data).slice(-6000); });
  for (let i = 0; ; i++) {
    if (await fetch(base + "/api/health").then(r => r.ok, () => false)) break;
    assert.ok(host.exitCode === null && i < 150, "Alma failed to start");
    await delay(200);
  }

  const provider = await api("/api/providers", "POST", {
    name: "Tokenjuice fixture", type: "openai", apiKey: "fixture", enabled: true,
    baseURL: `http://127.0.0.1:${model.address().port}/v1`, models: ["gpt-4o"], isResponseAPI: true,
  });
  // Offline Alma cannot look up a provider's capabilities in its external model catalog.
  // Declare the fixture's function-calling support through the same setting as the UI.
  const modelsPath = `/api/providers/${encodeURIComponent(provider.id)}/models`;
  await api(modelsPath, "PUT", {
    models: ["gpt-4o"],
    availableModels: [{ id: "gpt-4o", name: "Fixture", isManual: true, capabilityOverrides: { functionCalling: true } }],
  });
  const { models } = await api(modelsPath);
  assert.equal(models.find(model => model.id === "gpt-4o")?.capabilities.functionCalling, true);

  const { globalPath } = await api("/api/plugins-path");
  const localPath = relative(home, resolve(globalPath));
  assert.ok(localPath && !localPath.startsWith("..") && !localPath.startsWith("/"), "Alma's plugin directory must be under the fixture HOME");
  await cp(bundle, join(globalPath, "tokenjuice"), { recursive: true });
  await api("/api/plugins/refresh", "POST");
  const plugin = (await api("/api/plugins")).find(p => p.name === "Tokenjuice");
  assert.ok(plugin, "Alma must discover the built plugin");
  const route = `/api/plugins/${encodeURIComponent(plugin.id)}`;
  assert.equal((await api(route + "/enable", "POST")).enabled, true);
  assert.equal((await api(route + "/disable", "POST")).enabled, false);
  console.log("Alma discovered, enabled and disabled the built bundle via its plugin manager.");
  const baseline = await bashTurn(provider.id, "baseline", list);
  assert.equal(baseline.exitCode, 0);
  assert.equal(baseline.stdout, expected);
  assert.equal(await readFile(trace, "utf8"), "");

  assert.equal((await api(route + "/enable", "POST")).enabled, true);
  console.log("Alma enabled the plugin via its plugin manager.");
  const compact = await bashTurn(provider.id, "enabled", list);
  assert.match(await readFile(trace, "utf8"), /wrap --keep-failures --source alma/);
  assert.equal(compact.exitCode, 0);
  assert.match(compact.stdout, /fixture-progress-000/);
  assert.ok(compact.stdout.length < baseline.stdout.length, "enabled hook must reduce model-visible stdout");

  const exact = await bashTurn(provider.id, "exact", `cat ${shellQuote(exactFile)}`);
  assert.equal(exact.stdout, exactText);
  assert.equal(exact.exitCode, 0);

  const raw = await bashTurn(provider.id, "raw", `${shellQuote(join(bin, "tokenjuice"))} wrap --raw -- /bin/sh -c ${shellQuote(list)}`);
  assert.equal(raw.exitCode, 0);
  assert.equal(raw.stdout, expected);
  const failed = await bashTurn(provider.id, "failed", "printf 'failed-out\\n'; printf 'failed-err\\n' >&2; exit 7");
  assert.equal(failed.exitCode, 7);
  assert.match(failed.stdout, /failed-out/);
  assert.match([failed.stdout, failed.stderr].join("\n"), /failed-err/);
  const beforeDisable = await readFile(trace, "utf8");
  assert.equal(beforeDisable.split("\n").filter(line => line.startsWith("wrap --keep-failures")).length, 3);
  assert.equal((await api(route + "/disable", "POST")).enabled, false);
  const disabled = await bashTurn(provider.id, "disabled", list);
  assert.equal(disabled.exitCode, 0);
  assert.equal(disabled.stdout, expected);
  assert.equal(await readFile(trace, "utf8"), beforeDisable, "disabling the plugin must dispose its hook");
  console.log("Alma plugin discovery, enable, reduced Bash output, exact file read, raw bypass, exit 7 and disable passed.");
} catch (error) {
  console.error(hostLog);
  throw modelError ?? error;
} finally {
  if (host && host.exitCode === null && host.signalCode === null) {
    const stopped = once(host, "exit");
    host.kill("SIGTERM");
    const timeout = setTimeout(() => host.kill("SIGKILL"), 4_000);
    await stopped;
    clearTimeout(timeout);
  }
  model.closeAllConnections();
  model.close();
  await removeReadOnlyFixture(root);
}
