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
import { createProcessRunner, removeReadOnlyFixture } from "./e2e-process.mjs";

const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-alma-e2e-")));
const home = join(root, "home");
const bin = join(root, "bin");
const files = join(root, "files");
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
const run = createProcessRunner({ cwd: root, env });
const list = `cd ${shellQuote(root)} && find files -type f`;
let turn;
let modelError;
const model = createServer(async (request, response) => {
  try {
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    assert.equal(request.url, "/v1/chat/completions");
    const bash = payload.tools?.find(tool => tool.function?.name === "Bash");
    const result = payload.messages.find(message => message.role === "tool" && message.tool_call_id === turn?.id);
    if (result) turn.result = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    const needsTool = bash && turn && !result;
    if (needsTool) assert.equal(++turn.calls, 1, "Alma must return the native Bash result to its model");
    const call = needsTool && {
      id: turn.id, type: "function",
      function: { name: bash.function.name, arguments: JSON.stringify({ command: turn.command, description: "Read the disposable fixture" }) },
    };
    const message = call ? { role: "assistant", tool_calls: [call] } : { role: "assistant", content: "fixture complete" };
    const finish = call ? "tool_calls" : "stop";
    const envelope = { id: "native-alma-fixture", model: "fixture", created: 1 };
    if (!payload.stream) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ...envelope, object: "chat.completion", choices: [{ index: 0, message, finish_reason: finish }] }));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const delta = call ? { ...message, tool_calls: [{ index: 0, ...call }] } : message;
    for (const [piece, reason] of [[delta, null], [{}, finish]]) {
      response.write(`data: ${JSON.stringify({ ...envelope, object: "chat.completion.chunk", choices: [{ index: 0, delta: piece, finish_reason: reason }] })}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  } catch (error) {
    modelError = error;
    response.writeHead(500).end("invalid fixture request");
  }
});

async function api(path, method = "GET", data) {
  const response = await fetch(base + path, {
    method, headers: { "content-type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(12_000),
  });
  const body = await response.text();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

async function bashTurn(providerId, label, command) {
  turn = { id: `call_${label}`, command, calls: 0 };
  await run(process.execPath, [join(runtime, "resources/cli/alma"), "run", "--model", `${providerId}:fixture`,
    "--tools", "Bash", "--timeout", "40", `Run the ${label} fixture tool.`], 60_000);
  assert.ifError(modelError);
  assert.equal(turn.calls, 1, `${label}: native Bash dispatch`);
  assert.ok(turn.result, `${label}: result reached the next model request`);
  return turn.result;
}

let host;
let hostLog = "";
try {
  await Promise.all([home, bin, files].map(path => mkdir(path)));
  await writeFile(trace, "");
  await writeFile(join(bin, "tokenjuice"), `#!/bin/sh\nprintf '%s\\n' "$*" >> ${shellQuote(trace)}\nexec ${shellQuote(process.execPath)} ${shellQuote(cli)} "$@"\n`, { mode: 0o755 });
  for (let i = 0; i < 80; i++) await writeFile(join(files, `item-${i}.txt`), "fixture\n");
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
    baseURL: `http://127.0.0.1:${model.address().port}/v1`, models: ["fixture"], isResponseAPI: false,
  });
  const baseline = await bashTurn(provider.id, "baseline", list);
  assert.match(baseline, /item-79\.txt/);
  assert.equal(await readFile(trace, "utf8"), "");

  const { globalPath } = await api("/api/plugins-path");
  const localPath = relative(home, resolve(globalPath));
  assert.ok(localPath && !localPath.startsWith("..") && !localPath.startsWith("/"), "Alma's plugin directory must be under the fixture HOME");
  await cp(bundle, join(globalPath, "tokenjuice"), { recursive: true });
  await api("/api/plugins/refresh", "POST");
  const plugin = (await api("/api/plugins")).find(p => p.name === "Tokenjuice");
  assert.ok(plugin, "Alma must discover the built plugin");
  const route = `/api/plugins/${encodeURIComponent(plugin.id)}`;
  assert.equal((await api(route + "/enable", "POST")).enabled, true);
  const compact = await bashTurn(provider.id, "enabled", list);
  assert.match(await readFile(trace, "utf8"), /wrap --keep-failures --source alma/);
  assert.ok(compact.length < baseline.length && compact !== baseline, "enabled hook must reduce model-visible output");

  const raw = await bashTurn(provider.id, "raw", `${shellQuote(join(bin, "tokenjuice"))} wrap --raw -- /bin/sh -c ${shellQuote(list)}`);
  assert.match(raw, /item-79\.txt/);
  const failed = await bashTurn(provider.id, "failed", "printf 'failed-out\\n'; printf 'failed-err\\n' >&2; exit 7");
  assert.match(failed, /failed-out/);
  assert.match(failed, /failed-err/);
  const beforeDisable = await readFile(trace, "utf8");
  assert.equal(beforeDisable.split("\n").filter(line => line.startsWith("wrap --keep-failures")).length, 2);
  assert.equal((await api(route + "/disable", "POST")).enabled, false);
  const disabled = await bashTurn(provider.id, "disabled", list);
  assert.match(disabled, /item-79\.txt/);
  assert.equal(await readFile(trace, "utf8"), beforeDisable, "disabling the plugin must dispose its hook");
  console.log("Alma plugin discovery, enable, reduced Bash output, raw bypass, failure output and disable passed.");
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
