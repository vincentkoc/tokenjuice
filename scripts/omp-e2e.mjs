#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProcessRunner } from "./e2e-process.mjs";

const bun = resolve(process.argv[2]);
const host = resolve(process.argv[3]);
const packageRoot = process.argv[4] ? resolve(process.argv[4]) : fileURLToPath(new URL("..", import.meta.url));
const cli = join(packageRoot, "dist", "cli", "main.js");
const root = await mkdtemp(join(tmpdir(), "tokenjuice-omp-e2e-"));
const home = join(root, "home");
const project = join(root, "project");
const agentDir = join(home, ".omp", "agent");
const beforeFile = join(root, "before.jsonl");
const afterFile = join(root, "after.jsonl");
const afterProbe = join(root, "after-probe.js");
const env = {
  HOME: home,
  PATH: `${dirname(bun)}:${dirname(process.execPath)}:/usr/bin:/bin`,
  SHELL: "/bin/bash",
  PI_CODING_AGENT_DIR: agentDir,
  PI_OFFLINE: "1",
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  OMP_FIXTURE_BEFORE: beforeFile,
  OMP_FIXTURE_AFTER: afterFile,
};
const run = createProcessRunner({ cwd: project, env });
const runHost = (args) => run(bun, [host, ...args], 120_000);
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const cases = [
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- find fixtures -type f` },
  { id: "failure", command: "for i in $(seq 0 79); do printf 'failure-%s\\n' \"$i\"; done; printf 'failure-stderr\\n' >&2; exit 7" },
];
let observed = new Map();
let requests = 0;
let serverError;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    requests++;
    assert.ok(requests <= cases.length + 2, "OMP must make progress through the fixture tools");
    for (const message of payload.messages ?? []) {
      if (message.role === "tool") observed.set(message.tool_call_id, message.content);
    }
    const next = cases.find((item) => !observed.has(item.id));
    if (next) assert.ok(payload.tools?.some((tool) => tool.function?.name === "bash"), "OMP must expose its native bash tool");
    const delta = next ? { role: "assistant", tool_calls: [{
      index: 0, id: next.id, type: "function",
      function: { name: "bash", arguments: JSON.stringify({ command: next.command }) },
    }] } : { role: "assistant", content: "fixture complete" };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (value, finishReason) => `data: ${JSON.stringify({
      id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture",
      choices: [{ index: 0, delta: value, finish_reason: finishReason }],
    })}\n\n`;
    response.write(chunk(delta, null));
    response.write(chunk({}, next ? "tool_calls" : "stop"));
    response.end("data: [DONE]\n\n");
  } catch (error) {
    serverError = error;
    response.writeHead(500).end("invalid fixture request");
  }
});

function text(content) {
  if (typeof content === "string") return content;
  assert.ok(Array.isArray(content), "model tool result must contain text");
  return content.map((block) => {
    assert.equal(block.type, "text");
    return block.text;
  }).join("\n");
}

async function readEvents(path) {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

const probe = (variable) => `import { appendFileSync } from "node:fs";
export default function observer(omp) {
  omp.on("tool_result", (event) => {
    appendFileSync(process.env.${variable}, JSON.stringify({
      toolName: event.toolName, toolCallId: event.toolCallId, input: event.input,
      content: event.content, details: event.details, isError: event.isError
    }) + "\\n");
  });
}\n`;

async function session(label, compacted, baseline) {
  observed = new Map();
  requests = 0;
  serverError = undefined;
  await writeFile(beforeFile, "");
  await writeFile(afterFile, "");
  const session = await runHost([
    "--mode", "json", "--print", "--no-session", "--no-context-files",
    "--no-skills", "--no-rules", "--no-lsp", "--no-title",
    "--approval-mode", "yolo", "--provider", "fixture", "--model", "fixture",
    "--tools", "bash", "--extension", afterProbe, "Run the fixture shell tools.",
  ]);
  assert.ifError(serverError);
  assert.equal(requests, cases.length + 1, `${label}: every result must reach a follow-up model request`);
  const before = await readEvents(beforeFile);
  const after = await readEvents(afterFile);
  assert.equal(before.length, cases.length, `${label}: native discovery must load the observer`);
  assert.equal(after.length, cases.length);
  for (const item of cases) {
    const raw = before.find((event) => event.toolCallId === item.id);
    const final = after.find((event) => event.toolCallId === item.id);
    assert.ok(raw && final, `${label}: missing native observation ${item.id}`);
    assert.deepEqual(final.details, raw.details, `${label}: ${item.id} metadata and replay trace must survive`);
    assert.equal(final.isError, raw.isError, `${label}: ${item.id} native failure flag must survive`);
  }
  const listing = text(observed.get("listing"));
  const nativeListing = before.find((event) => event.toolCallId === "listing");
  assert.ok(nativeListing.details.trace && typeof nativeListing.details.trace === "object", `${label}: exercise a real native replay trace`);
  if (compacted) {
    assert.ok(listing.includes("tokenjuice"), `${label}: native package must compact model-visible output`);
    assert.ok(listing.length < text(nativeListing.content).length);
  } else {
    assert.ok(!listing.includes("tokenjuice"), `${label}: unloaded package must leave the output alone`);
    for (let index = 0; index < 80; index++) assert.ok(listing.includes(`fixture-${index}.json`));
  }
  for (const id of ["exact", "raw", "failure"]) {
    const raw = before.find((event) => event.toolCallId === id);
    const final = after.find((event) => event.toolCallId === id);
    assert.deepEqual(final.content, raw.content, `${label}: preserve native ${id} result bytes`);
    assert.equal(text(observed.get(id)), text(final.content), `${label}: model must receive native ${id} output`);
  }
  if (baseline) {
    assert.equal(text(observed.get("exact")), baseline.exact, `${label}: exact read must match unhooked session`);
    assert.equal(text(observed.get("raw")), baseline.raw, `${label}: explicit raw must match unhooked session`);
  }
  const failure = text(observed.get("failure"));
  for (let index = 0; index < 80; index++) assert.ok(failure.includes(`failure-${index}\n`));
  assert.ok(failure.includes("failure-stderr"));
  const failed = after.find((event) => event.toolCallId === "failure");
  assert.equal(failed.isError, true);
  assert.equal(failed.details.exitCode, 7);
  assert.ok(session.stdout.includes("tool_execution_end"), "native CLI must emit execution events");
  process.stdout.write(`native OMP ${label}: model-visible output and metadata passed\n`);
  return { exact: text(observed.get("exact")), raw: text(observed.get("raw")) };
}

try {
  await mkdir(join(agentDir, "extensions"), { recursive: true });
  await mkdir(join(project, "fixtures"), { recursive: true });
  for (let index = 0; index < 80; index++) await writeFile(join(project, "fixtures", `fixture-${index}.json`), "{}\n");
  await writeFile(join(project, "exact.txt"), "  exact content\r\ntrailing blanks\n\n");
  await writeFile(join(agentDir, "extensions", "before-probe.js"), probe("OMP_FIXTURE_BEFORE"));
  await writeFile(afterProbe, probe("OMP_FIXTURE_AFTER"));
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  await writeFile(join(agentDir, "models.yml"), JSON.stringify({ providers: { fixture: {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    api: "openai-completions", apiKey: "fixture-no-secret",
    models: [{ id: "fixture", name: "Fixture", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 }],
  } } }));
  await writeFile(join(agentDir, "config.yml"), JSON.stringify({ shellMinimizer: { enabled: false } }));
  const version = (await runHost(["--version"])).stdout.trim();
  const baseline = await session("baseline", false);
  await runHost(["plugin", "link", packageRoot]);
  assert.ok((await runHost(["plugin", "list"])).stdout.includes("tokenjuice"));
  await runHost(["plugin", "doctor"]);
  await session("installed", true, baseline);
  await runHost(["plugin", "disable", "tokenjuice"]);
  await session("disabled", false, baseline);
  await runHost(["plugin", "enable", "tokenjuice"]);
  await session("enabled", true, baseline);
  await runHost(["plugin", "uninstall", "tokenjuice"]);
  assert.ok(!(await runHost(["plugin", "list"])).stdout.includes("tokenjuice"));
  await session("uninstalled", false, baseline);
  process.stdout.write(`${JSON.stringify({ ok: true, host: "omp", version,
    phases: ["baseline", "installed", "disabled", "enabled", "uninstalled"],
    cases: cases.map(({ id }) => id), nativeMetadataPreserved: true })}\n`);
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
