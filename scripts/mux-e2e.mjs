#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
assert.ok(process.argv[2], "pass the published Xum CLI entrypoint");
const host = resolve(process.argv[2]);
const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-mux-e2e-")));
const home = join(root, "home");
const project = join(root, "project");
const configDir = join(home, ".xum");
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
          const item = cases.find((item) => item.command === input.script);
          if (item) calls.set(call.id, item.id);
        }
      }
      for (const message of payload.messages ?? []) {
        if (message.role === "tool" && calls.has(message.tool_call_id)) {
          observed.set(calls.get(message.tool_call_id), JSON.parse(textContent(message.content)));
        }
      }
    }
    const next = hasExecute ? cases.find((item) => !observed.has(item.id)) : undefined;
    const delta = next
      ? { role: "assistant", tool_calls: [{
          index: 0, id: next.id, type: "function",
          function: { name: shellTool.function.name, arguments: JSON.stringify({ script: next.command, timeout_secs: 10, display_name: next.id }) },
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
  const result = await run(process.execPath, [host, "run", "--dir", project, "--model", "fixture:fixture", "--thinking", "off", "--no-mcp-config", "--json", "Run the disposable fixture shell tools."]);

  assert.ifError(serverError);
  assert.equal(modelRequests, cases.length + 1, "host must deliver every tool result in a follow-up model request");
  assert.equal(observed.size, cases.length);
  const events = result.stdout.trim().split("\n").map(JSON.parse);
  assert.ok(events.some(event => event.type === "run-complete"));
  assert.ok(!events.some(event => ["run-fatal", "run-cleanup-error"].includes(event.type)
    || event.payload?.type === "stream-error"));
  const toolEnds = events.filter(event => event.payload?.type === "tool-call-end").map(event => event.payload);
  assert.equal(toolEnds.length, cases.length);
  assert.deepEqual(toolEnds.map(event => event.result.exitCode), [0, 0, 0, 0, 7]);
  for (let index = 0; index < cases.length; index++) {
    assert.deepEqual(toolEnds[index].result, observed.get(cases[index].id));
  }
  assert.ok(result.stdout.includes("fixture complete"));
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
  await writeFile(join(configDir, "providers.jsonc"), JSON.stringify({ fixture: {
    providerType: "openai-compatible", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: "fixture-no-secret", models: ["fixture"],
  } }));
  const version = (await run(process.execPath, [host, "--version"])).stdout.trim();
  assert.match(version, /^v0\.32\.1 /u);
  await run(process.execPath, [host, "trust", "--dir", project]);
  const baseline = await session();
  await mkdir(join(project, ".mux"));
  const hookPath = join(project, ".mux", "tool_post");
  await writeFile(hookPath, "#!/usr/bin/env bash\nprintf 'native-post-hook-marker\\n'\n", { mode: 0o755 });
  const additive = await session();
  for (const item of cases) {
    assert.equal(additive.get(item.id).output, baseline.get(item.id).output);
    assert.equal(additive.get(item.id).exitCode, baseline.get(item.id).exitCode);
    assert.equal(additive.get(item.id).hook_output, "native-post-hook-marker");
  }
  await writeFile(hookPath, `#!/usr/bin/env bash\n${quote(process.execPath)} ${quote(cli)} mux-post-tool-use\n`, { mode: 0o755 });
  const silent = await session();
  for (const item of cases) {
    assert.equal(silent.get(item.id).output, baseline.get(item.id).output);
    assert.equal(silent.get(item.id).exitCode, baseline.get(item.id).exitCode);
    assert.equal(silent.get(item.id).hook_output, undefined);
  }
  const entries = baseline.get("listing").output.split("\n");
  assert.equal(entries.length, 80);
  assert.deepEqual(new Set(entries), new Set(Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`)));
  // Xum normalizes CRLF through its native terminal/output pipeline.
  assert.equal(baseline.get("exact").output, "  exact content\n\ntrailing blanks\n");
  assert.equal(baseline.get("raw").output, baseline.get("listing").output);
  assert.ok(baseline.get("wrapped").output.length < baseline.get("listing").output.length);
  assert.match(baseline.get("wrapped").output, /80 matches/u);
  const failed = baseline.get("failure");
  assert.equal(failed.exitCode, 7);
  assert.ok(failed.output.includes(Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n")));
  assert.ok(failed.output.includes("failure-stderr"));
  const before = await readFile(hookPath, "utf8");
  await assert.rejects(run(process.execPath, [cli, "install", "mux", "--local"]), /do not replace tool output/u);
  assert.equal(await readFile(hookPath, "utf8"), before);
  process.stdout.write(`${JSON.stringify({ ok: true, host: "mux", version, modelRequestsPerSession: modelRequests })}\n`);

} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
