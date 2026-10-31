#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "codex";
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-codex-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".codex");
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: home,
  CODEX_HOME: configDir,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  SHELL: "/bin/bash",
  // Keep the activation proof inside this disposable home.
  TOKENJUICE_STATS: "1",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  DO_NOT_TRACK: "1",
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
  { id: "failure", command: "find fixtures -type f; printf 'failure-stderr\\n' >&2; exit 7" },
];
const observed = new Map();
let modelRequests = 0;
let contexts = [];
let checkingInstalled = false;
let serverError;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/v1/responses");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    modelRequests++;
    assert.ok(modelRequests <= cases.length + 1, "host must make progress through fixture tools");
    const tools = (payload.tools ?? []).flatMap((tool) => tool.type === "namespace"
      ? tool.tools.map((member) => ({ ...member, namespace: tool.name })) : [tool]);
    const shell = tools.find((tool) => ["shell_command", "exec_command", "shell"].includes(tool.name));
    assert.ok(shell, `native shell tool must be available: ${JSON.stringify(payload.tools)}`);
    for (const item of payload.input ?? []) {
      if (item.type === "function_call_output" && cases.some((entry) => entry.id === item.call_id)) {
        if (checkingInstalled && item.call_id === "listing" && !observed.has("listing")) {
          const debug = JSON.parse(await readFile(join(configDir, "tokenjuice-hook.last.json"), "utf8"));
          assert.equal(debug.skipped, "missing-exit-code", "real installed hook must execute its status guard");
          assert.equal(debug.rewrote, false);
          assert.equal(debug.savedChars, 0);
        }
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

async function session(installed = false) {
  observed.clear();
  modelRequests = 0;
  contexts = [];
  checkingInstalled = installed;
  const result = await run(host, [
    "exec", "--json", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only",
    ...(installed ? ["--dangerously-bypass-hook-trust"] : []),
    "Run the disposable fixture shell tools.",
  ]);
  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "every tool result must reach the next model request");
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  const completed = events.filter((event) => event.type === "item.completed").map((event) => event.item);
  assert.deepEqual(completed.filter((item) => item.type === "error"
    && !item.message.includes("--dangerously-bypass-hook-trust")), [], "native host must report no unexpected errors");
  const commands = completed.filter((item) => item.type === "command_execution");
  assert.equal(commands.length, cases.length, `native shell commands must execute: ${JSON.stringify({
    events: result.stdout.slice(0, 4000), stderr: result.stderr.slice(0, 2000),
    results: [...observed].map(([id, output]) => [id, output.slice(0, 800)]),
  })}`);
  assert.deepEqual(commands.map((item) => item.exit_code), [0, 0, 0, 0, 7]);
  assert.deepEqual(commands.map((item) => item.status), ["completed", "completed", "completed", "completed", "failed"]);
  assert.equal(completed.find((item) => item.type === "agent_message")?.text, "fixture complete");
  assert.ok(events.some((event) => event.type === "turn.completed"));
  assert.equal(contexts.length, 0, "hook must not append duplicate observations");
  return new Map([...observed].map(([id, text]) => {
    const match = /\nProcess exited with code (-?\d+)\n(?:Original token count: \d+\n)?Output:\n([\s\S]*)$/u.exec(text);
    assert.ok(match, `${id}: native status and output envelope must survive`);
    return [id, { exitCode: Number(match[1]), output: match[2] }];
  }));
}

try {
  await mkdir(configDir, { recursive: true });
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
  assert.equal(version, "codex-cli 0.166.0");
  const baseline = await session();
  await run(process.execPath, [cli, "install", "codex", "--local"]);
  const hooks = JSON.parse(await readFile(join(configDir, "hooks.json"), "utf8"));
  const hookQuote = (value) => /^[A-Za-z0-9_./:-]+$/u.test(value) ? value : quote(value);
  assert.deepEqual(Object.keys(hooks.hooks), ["PostToolUse"]);
  assert.equal(hooks.hooks.PostToolUse.length, 1);
  assert.equal(hooks.hooks.PostToolUse[0].matcher, "^Bash$");
  assert.equal(hooks.hooks.PostToolUse[0].hooks.length, 1);
  const hook = hooks.hooks.PostToolUse[0].hooks[0];
  assert.equal(hook.type, "command");
  assert.equal(hook.command, `${hookQuote(process.execPath)} ${hookQuote(cli)} codex-post-tool-use`);
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "codex", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok", "installed configuration must be healthy");
  // The invocation trusts only the exact freshly installed hook checked above.
  const installed = await session(true);
  assert.deepEqual(installed, baseline, "missing hook exit status must preserve every native model result");
  const expectedEntries = new Set(Array.from({ length: 80 }, (_, index) => `fixtures/example-${index}.json`));
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
  assert.equal(installed.get("failure").output.split("\n").filter((line) => expectedEntries.has(line)).length, 80);
  process.stdout.write(`${JSON.stringify({ ok: true, host: "codex", version })}\n`);
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
