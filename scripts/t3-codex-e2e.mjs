#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProcessRunner } from "./e2e-process.mjs";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "t3";
const provider = process.argv[3] ? resolve(process.argv[3]) : "codex";
const root = await realpath(await mkdtemp(join(tmpdir(), "tj-t3-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(root, "custom-codex-home");
const baseDir = join(root, "t3-data");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  SHELL: "/bin/bash",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  DO_NOT_TRACK: "1",
  NO_PROXY: "127.0.0.1,localhost",
  no_proxy: "127.0.0.1,localhost",
};

const run = createProcessRunner({ cwd: project, env });

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const cases = [
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: `${quote(process.execPath)} ${quote(cli)} wrap -- cat exact.txt` },
  { id: "wrapped", command: `${quote(process.execPath)} ${quote(cli)} wrap -- find fixtures -type f` },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- find fixtures -type f` },
  { id: "failure", command: `${quote(process.execPath)} ${quote(cli)} wrap --keep-failures -- /bin/bash -c ${quote("find fixtures -type f; printf 'failure-stderr\\n' >&2; exit 7")}` },
];
const observed = new Map();
let modelRequests = 0;
let contexts = [];
let serverError;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/responses");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    assert.ok(JSON.stringify(payload.input).includes("native-t3-fixture-sentinel"), "T3 must forward the new thread message");
    modelRequests++;
    assert.ok(modelRequests <= cases.length + 1, "host must make progress through fixture tools");
    const tools = (payload.tools ?? []).flatMap((tool) => tool.type === "namespace"
      ? tool.tools.map((member) => ({ ...member, namespace: tool.name })) : [tool]);
    const shell = tools.find((tool) => ["shell_command", "exec_command", "shell"].includes(tool.name));
    assert.ok(shell, `native shell tool must be available: ${JSON.stringify(payload.tools)}`);
    for (const item of payload.input ?? []) {
      if (item.type === "function_call_output" && cases.some((entry) => entry.id === item.call_id)) {
        observed.set(item.call_id, item.output);
      }
    }
    contexts = (payload.input ?? []).filter((item) => item.role === "developer" && item.content?.some((part) => part.text?.startsWith("<tokenjuice_compacted_tool_observation>")));
    const next = cases.find((item) => !observed.has(item.id));
    const item = next ? {
      type: "function_call", id: `fc_${next.id}`, call_id: next.id,
      name: shell.name, ...(shell.namespace ? { namespace: shell.namespace } : {}),
      arguments: JSON.stringify(shell.name === "exec_command"
        ? { cmd: next.command, workdir: project, max_output_tokens: 6000 }
        : shell.name === "shell" ? { command: ["/bin/bash", "-c", next.command], workdir: project }
          : { command: next.command, workdir: project, timeout_ms: 10_000 }),
    } : {
      type: "message", id: "msg_complete", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: "fixture complete", annotations: [] }],
    };
    const envelope = {
      id: `resp_${modelRequests}`, object: "response", created_at: 0,
      model: "fixture", status: "completed", output: [item],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    let sequence = 0;
    const event = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...data })}\n\n`);
    event("response.created", { response: { ...envelope, status: "in_progress", output: [] } });
    event("response.output_item.added", { output_index: 0, item });
    event("response.output_item.done", { output_index: 0, item });
    event("response.completed", { response: envelope });
    response.end();
  } catch (error) {
    process.stderr.write(`fixture request failure: ${error.stack}\n`);
    serverError = error;
    response.writeHead(500).end("invalid fixture request");
  }
});

async function session() {
  observed.clear();
  modelRequests = 0;
  const result = await run(host, ["thread", "start", "--base-dir", baseDir,
    "--provider", "fixture-codex", "--model", "fixture", "--wait", "--json",
    project, "native-t3-fixture-sentinel: run only the disposable fixture shell tools."]);
  assert.ifError(serverError);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "completed");
  assert.equal(receipt.error, null);
  assert.equal(modelRequests, cases.length + 1, "every native tool result must reach the next model request");
  assert.equal(observed.size, cases.length);
  assert.equal(contexts.length, 0, "explicit wrapping must not append duplicate observations");
  return new Map([...observed].map(([id, text]) => {
    const match = /\nProcess exited with code (-?\d+)\n(?:Original token count: \d+\n)?Output:\n([\s\S]*)$/u.exec(text);
    assert.ok(match, `${id}: native status and output envelope must survive`);
    return [id, { exitCode: Number(match[1]), output: match[2] }];
  }));
}

let daemon, daemonClosed;
async function stopDaemon() {
  if (!daemon || daemon.exitCode !== null) return;
  daemon.kill("SIGTERM");
  const timer = setTimeout(() => daemon.kill("SIGKILL"), 2000);
  try { await daemonClosed; } finally { clearTimeout(timer); }
}

try {
  assert.notEqual(process.platform, "win32", "this fixture requires a POSIX shell");
  await mkdir(configDir, { recursive: true });
  await mkdir(join(baseDir, "userdata"), { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(env.TMPDIR, { recursive: true });
  await mkdir(join(project, "fixtures"), { recursive: true });
  await Promise.all(Array.from({ length: 80 }, (_, index) =>
    writeFile(join(project, "fixtures", `example-${index}.json`), "{}\n")));
  await writeFile(join(project, "exact.txt"), "  exact content\r\ntrailing blanks\n\n");
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  await writeFile(join(configDir, "config.toml"), `
model = "fixture"
model_provider = "fixture"
model_catalog_json = ${JSON.stringify(join(configDir, "models.json"))}
approval_policy = "never"
cli_auth_credentials_store = "file"
[model_providers.fixture]
name = "Disposable fixture"
base_url = "http://127.0.0.1:${server.address().port}/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
[features]
hooks = true
plugins = false
plugin_discovery_prefetch = false
[analytics]
enabled = false
[feedback]
enabled = false
`);
  await writeFile(join(configDir, "models.json"), JSON.stringify({ models: [{
    slug: "fixture", display_name: "Fixture", description: "Local acceptance fixture",
    default_reasoning_level: "low", supported_reasoning_levels: [],
    shell_type: "shell_command", visibility: "list", supported_in_api: true, priority: 0,
    availability_nux: null, upgrade: null, model_messages: null,
    support_verbosity: false,
    experimental_supported_tools: [],
    base_instructions: "Run only the disposable acceptance fixture commands.",
    truncation_policy: { mode: "tokens", limit: 10_000 },
    input_modalities: ["text"],
  }] }));
  const version = (await run(host, ["--version"])).stdout.trim();
  const providerVersion = (await run(provider, ["--version"])).stdout.trim();
  assert.equal(version, "t3 v0.1.6");
  assert.equal(providerVersion, "codex-cli 0.166.0");
  await writeFile(join(baseDir, "userdata", "settings.json"), JSON.stringify({ providerInstances: {
    "fixture-codex": { driver: "codex", enabled: true, config: {
      setupMode: "existing", binaryPath: provider, homePath: configDir, customModels: ["fixture"],
    } },
  } }));
  // The CLI rejects port 0. Reserve an ephemeral loopback port, then give it to
  // this private server; a bind failure must not attach to another instance.
  const portProbe = createServer();
  await new Promise(ready => portProbe.listen(0, "127.0.0.1", ready));
  const port = portProbe.address().port;
  await new Promise(done => portProbe.close(done));
  daemon = spawn(host, ["serve", "--base-dir", baseDir, "--host", "127.0.0.1", "--port", String(port)],
    { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "", spawnError;
  daemon.stdout.setEncoding("utf8").on("data", chunk => logs += chunk);
  daemon.stderr.setEncoding("utf8").on("data", chunk => logs += chunk);
  daemon.on("error", error => { spawnError = error; });
  daemonClosed = new Promise(done => daemon.on("close", done));
  let ready = false;
  for (let i = 0; i < 300; i++) {
    if (spawnError) throw spawnError;
    assert.equal(daemon.exitCode, null, "private T3 server must remain running");
    if (logs.includes(`http://127.0.0.1:${port}`)) { ready = true; break; }
    await delay(100);
  }
  assert.ok(ready, "private T3 server must become ready");
  await run(host, ["project", "add", "--base-dir", baseDir, project]);
  const installed = await session();
  const expectedEntries = new Set(Array.from({ length: 80 }, (_, index) => `fixtures/example-${index}.json`));
  for (const id of ["listing", "exact", "wrapped", "raw"]) assert.equal(installed.get(id).exitCode, 0);
  for (const id of ["listing", "raw"]) {
    const entries = installed.get(id).output.trimEnd().split("\n");
    assert.equal(entries.length, 80);
    assert.deepEqual(new Set(entries), expectedEntries);
  }
  assert.equal(installed.get("exact").output, "  exact content\r\ntrailing blanks\n\n");
  assert.ok(installed.get("wrapped").output.includes("80 matches"), "explicit wrap must compact before native delivery");
  assert.ok(installed.get("wrapped").output.length < installed.get("listing").output.length);
  assert.equal(installed.get("failure").exitCode, 7);
  assert.ok(installed.get("failure").output.includes("failure-stderr"));
  const failureEntries = installed.get("failure").output.split("\n").filter((line) => expectedEntries.has(line));
  assert.equal(failureEntries.length, 80);
  assert.deepEqual(new Set(failureEntries), expectedEntries);
  process.stdout.write(`${JSON.stringify({ ok: true, host: "t3", version, providerVersion, provider: "custom Codex instance", level: "native-cli-model-requests", wrapping: "explicit", exactRead: "CRLF and blank lines preserved", failureExit: 7 })}\n`);
} finally {
  await stopDaemon();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
