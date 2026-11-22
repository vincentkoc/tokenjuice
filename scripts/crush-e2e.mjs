#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : "crush";
const root = await realpath(await mkdtemp(join(tmpdir(), "tj-crush-")));
const home = join(root, "home");
const project = join(root, "project");
const bin = join(root, "bin");
const skillPath = join(project, ".crush", "skills", "tokenjuice", "SKILL.md");
const socket = join(root, "s");
const address = `unix://${socket}`;
const env = {
  HOME: home,
  PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: join(root, "tmp"),
  DO_NOT_TRACK: "1",
  CRUSH_DISABLE_METRICS: "1",
  CRUSH_DISABLE_PROVIDER_AUTO_UPDATE: "1",
  NO_PROXY: "127.0.0.1,localhost",
  no_proxy: "127.0.0.1,localhost",
  TERM: "dumb",
  TOKENJUICE_STATS: "0",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
};

function start(command, args) {
  const child = spawn(command, args, { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "", spawnError;
  let exited = false;
  child.stdout.setEncoding("utf8").on("data", chunk => stdout += chunk);
  child.stderr.setEncoding("utf8").on("data", chunk => stderr += chunk);
  child.on("error", error => { spawnError = error; });
  const closed = new Promise(done => child.on("close", code => { exited = true; done(code); }));
  return { child, closed, get exited() { return exited; }, get stdout() { return stdout; }, get stderr() { return stderr; }, get error() { return spawnError; } };
}

async function stop(process) {
  if (process.exited) return;
  process.child.kill("SIGTERM");
  const timer = setTimeout(() => process.child.kill("SIGKILL"), 2000);
  try { await process.closed; } finally { clearTimeout(timer); }
}

async function run(command, args) {
  const process = start(command, args);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void stop(process); }, 90_000);
  try {
    const code = await process.closed;
    if (process.error) throw process.error;
    assert.ok(!timedOut, `timed out running ${command}`);
    assert.equal(code, 0, `${command} exited ${code}\n${process.stderr}\n${process.stdout}`);
    return { stdout: process.stdout, stderr: process.stderr };
  } finally { clearTimeout(timer); }
}

const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const customSkill = "---\nname: tokenjuice\ndescription: native-crush-custom-skill-sentinel\n---\nCustom project guidance.\n";
const wrapHint = "tokenjuice wrap -- <command>";
const rawHint = "tokenjuice wrap --raw -- <command>";
const failureStdout = Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n") + "\n";
const failureStderr = "failure-stderr\n";
const exact = "  exact content\r\ntrailing blanks\n\n";
const cases = [
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: "tokenjuice wrap --raw -- find fixtures -type f" },
  { id: "failure", command: `${quote(process.execPath)} -e ${quote(`process.stdout.write(${JSON.stringify(failureStdout)}); process.stderr.write(${JSON.stringify(failureStderr)}); process.exit(7);`)}` },
];
const commandFor = (item, guided) => guided && item.id !== "raw"
  ? `tokenjuice wrap${item.id === "failure" ? " --keep-failures" : ""} -- ${item.command}`
  : item.command;
function textContent(content) {
  if (typeof content === "string") return content;
  assert.ok(Array.isArray(content));
  assert.ok(content.every(item => item.type === "text"));
  return content.map(item => item.text).join("");
}

let expected, modelRequests, serverError;
const observed = new Map();
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    let next;
    // Crush also requests a session title without tools; it is not an agent turn.
    if (payload.tools?.some(item => item.function?.name === "bash")) {
      modelRequests++;
      assert.ok(modelRequests <= cases.length + (expected.catalog ? 2 : 1), "host must make progress");
      assert.ok(payload.tools.some(item => item.function?.name === "view"));
      const system = payload.messages.filter(item => item.role === "system").map(item => textContent(item.content)).join("\n");
      const location = /<name>tokenjuice<\/name>[\s\S]*?<location>([^<]+)<\/location>/u.exec(system)?.[1];
      assert.equal(location, expected.catalog ? skillPath : undefined, "native skill catalog must reflect the current configuration");
      assert.ok(!system.includes(wrapHint), "skill body must be loaded on demand");
      const calls = new Map();
      for (const message of payload.messages) {
        for (const call of message.tool_calls ?? []) {
          const input = JSON.parse(call.function.arguments);
          if (call.function.name === "view" && input.file_path === location) calls.set(call.id, "skill");
          if (call.function.name === "bash") {
            const item = cases.find(item => [commandFor(item, false), commandFor(item, true)].includes(input.command));
            if (item) calls.set(call.id, item.id);
          }
        }
      }
      for (const message of payload.messages) {
        if (message.role === "tool" && calls.has(message.tool_call_id)) observed.set(calls.get(message.tool_call_id), textContent(message.content));
      }
      const skill = observed.get("skill") ?? "";
      // Choose wrappers from the body actually returned by native view, not the expected phase.
      // This qualifies discovery and tool transport, not arbitrary model adherence.
      const guided = skill.includes(wrapHint) && skill.includes(rawHint);
      if (location && !observed.has("skill")) {
        next = { id: "skill", name: "view", args: { file_path: location } };
      } else {
        assert.equal(guided, expected.guided, "native view must deliver installed guidance");
        assert.equal(skill.includes("Custom project guidance."), expected.custom);
        if (guided) assert.ok(skill.includes("Do not rewrite commands that intentionally change Crush shell state"));
        const item = cases.find(item => !observed.has(item.id));
        if (item) next = { id: item.id, name: "bash", args: { command: commandFor(item, guided), description: `disposable ${item.id} fixture` } };
      }
    }
    const message = next ? { role: "assistant", tool_calls: [{ index: 0, id: next.id, type: "function", function: { name: next.name, arguments: JSON.stringify(next.args) } }] }
      : { role: "assistant", content: "fixture complete" };
    const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
    response.writeHead(200, { "Content-Type": payload.stream ? "text/event-stream" : "application/json" });
    if (!payload.stream) {
      response.end(JSON.stringify({ id: "fixture", object: "chat.completion", created: 0, model: "fixture", choices: [{ index: 0, message, finish_reason: next ? "tool_calls" : "stop" }], usage }));
      return;
    }
    for (const [delta, reason] of [[message, null], [{}, next ? "tool_calls" : "stop"]]) {
      response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture", choices: [{ index: 0, delta, finish_reason: reason }], usage })}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  } catch (error) {
    serverError ??= error;
    response.writeHead(500).end("invalid fixture request");
  }
});

async function session(name, catalog, guided, custom) {
  expected = { catalog, guided, custom };
  modelRequests = 0;
  observed.clear();
  await rm(socket, { force: true });
  // Never attach to the user's default persistent server or socket.
  const daemon = start(host, ["server", "--host", address, "--data-dir", join(root, `data-${name}`)]);
  try {
    let ready = false;
    for (let i = 0; i < 300; i++) {
      if (daemon.exited) throw daemon.error ?? new Error(`Crush server exited\n${daemon.stderr}\n${daemon.stdout}`);
      if ((await stat(socket).catch(() => undefined))?.isSocket()) { ready = true; break; }
      await delay(50);
    }
    assert.ok(ready, "private Crush server must become ready");
    const result = await run(host, ["run", "--host", address, "--model", "fixture/fixture", "--small-model", "fixture/fixture", "--quiet", "Run the disposable fixture tools."]).catch(error => { throw serverError ?? error; });
    assert.ifError(serverError);
    assert.equal(modelRequests, cases.length + (catalog ? 2 : 1));
    assert.equal(observed.size, cases.length + (catalog ? 1 : 0));
    assert.match(result.stdout, /fixture complete/u);
    const output = new Map();
    for (const item of cases) {
      const value = observed.get(item.id);
      const suffix = `\n\n<cwd>${project}</cwd>`;
      assert.ok(value.endsWith(suffix), "native Bash cwd metadata must survive");
      output.set(item.id, value.slice(0, -suffix.length));
    }
    return output;
  } finally { await stop(daemon); }
}

try {
  assert.notEqual(process.platform, "win32", "this fixture requires a POSIX shell");
  assert.ok(Buffer.byteLength(socket) < 104, "private Unix socket path must fit the native limit");
  await mkdir(home, { recursive: true });
  await mkdir(bin);
  await mkdir(env.TMPDIR);
  await mkdir(dirname(skillPath), { recursive: true });
  await mkdir(join(project, "fixtures"));
  await writeFile(join(bin, "tokenjuice"), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(cli)} "$@"\n`, { mode: 0o755 });
  await writeFile(skillPath, customSkill);
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(project, "fixtures", `example-${i}.json`), "{}\n")));
  await writeFile(join(project, "exact.txt"), exact);
  await new Promise(ready => server.listen(0, "127.0.0.1", ready));
  const config = `provider add fixture --type completions --base-url http://127.0.0.1:${server.address().port}/v1 --api-key fixture-no-secret\nmodel add fixture/fixture --context-window 128000 --default-max-tokens 4096\nmodel large fixture/fixture\nmodel small fixture/fixture\npermissions allow bash view\noption provider-auto-update false\noption notifications disabled\n`;
  await writeFile(join(project, "crushrc"), config);
  const version = (await run(host, ["--version"])).stdout.trim();
  assert.equal(version, "crush version v0.99.0");
  const baseline = await session("baseline", true, false, true);
  await run(process.execPath, [cli, "install", "crush"]);
  const installedSkill = await readFile(skillPath, "utf8");
  assert.equal(await readFile(`${skillPath}.bak`, "utf8"), customSkill);
  await run(process.execPath, [cli, "install", "crush"]);
  assert.equal(await readFile(skillPath, "utf8"), installedSkill);
  assert.equal(await readFile(`${skillPath}.bak`, "utf8"), customSkill);
  const doctor = JSON.parse((await run(process.execPath, [cli, "doctor", "crush", "--format", "json"])).stdout);
  assert.equal(doctor.status, "ok");
  const installed = await session("installed", true, true, false);
  await writeFile(join(project, "crushrc"), `${config}option disable-skill tokenjuice\n`);
  assert.deepEqual(await session("disabled", false, false, false), baseline);
  await run(process.execPath, [cli, "uninstall", "crush"]);
  assert.equal(await readFile(skillPath, "utf8"), customSkill);
  await writeFile(join(project, "crushrc"), config);
  assert.deepEqual(await session("restored", true, false, true), baseline);

  assert.deepEqual(new Set(baseline.get("listing").trimEnd().split("\n")), new Set(Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`)));
  assert.match(installed.get("listing"), /80 matches/u);
  assert.ok(installed.get("listing").length < baseline.get("listing").length);
  for (const results of [baseline, installed]) {
    assert.equal(results.get("exact"), baseline.get("exact"));
    assert.equal(results.get("raw"), baseline.get("listing"));
    assert.equal(results.get("failure"), `${failureStdout}\n\n${failureStderr}\nExit code 7`);
  }
  assert.equal(baseline.get("exact"), exact);
  process.stdout.write(`${JSON.stringify({ ok: true, host: "crush", version, level: "native-cli-model-requests", skills: "catalog/view/disabled/restored", listing: "80-entry summary", exactRead: "CRLF and blank lines preserved", raw: "preserved", failureExit: 7 })}\n`);
} finally {
  await new Promise(done => server.close(done));
  await rm(root, { recursive: true, force: true });
}
