#!/usr/bin/env node

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

assert.ok(process.argv[2], "pass the pinned OpenHanako source directory");
const host = resolve(process.argv[2]);
const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const bundle = fileURLToPath(new URL("../dist/hosts/openhanako/bundle", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "tokenjuice-openhanako-e2e-"));
const home = join(root, "home");
const project = join(root, "project");
const agentDir = join(home, "pi-agent");
const pluginsDir = join(home, "plugins");
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const text = content => typeof content === "string" ? content
  : (content ?? []).filter(part => part.type === "text").map(part => part.text).join("\n");
const cases = [
  { id: "listing", command: "find fixtures -type f" },
  { id: "exact", command: "cat exact.txt" },
  { id: "raw", command: `${quote(process.execPath)} ${quote(cli)} wrap --raw -- find fixtures -type f` },
  { id: "failure", command: "printf 'failure-output\\n'; exit 7" },
  { id: "truncated", command: "find large-fixtures -type f" },
];
let activeCases = cases;
let observed = new Map();
let modelRequests = 0;
let serverError;
let session;
let sdk;
const originalCwd = process.cwd();
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      assert.ok(body.length < 1_000_000, "bounded model request");
    }
    const payload = JSON.parse(body);
    assert.ok(++modelRequests <= 10, "native session must finish the fixture");
    for (const message of payload.messages ?? []) {
      if (message.role === "tool") observed.set(message.tool_call_id, text(message.content));
    }
    const next = activeCases.find(item => !observed.has(item.id));
    if (next) assert.ok(payload.tools?.some(tool => tool.function?.name === "exec_command"));
    const delta = next ? {
      role: "assistant", tool_calls: [{ index: 0, id: next.id, type: "function",
        function: { name: "exec_command", arguments: JSON.stringify({ cmd: next.command, tty: false, workdir: project }) } }],
    } : { role: "assistant", content: "fixture complete" };
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

try {
  await Promise.all([home, project, agentDir, pluginsDir].map(path => mkdir(path, { recursive: true })));
  await mkdir(join(project, "fixtures"));
  await mkdir(join(project, "large-fixtures"));
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(project, "fixtures", `example-${i}.json`), "{}\n")));
  await Promise.all(Array.from({ length: 2100 }, (_, i) => writeFile(join(project, "large-fixtures", `padding-example-${i}.json`), "{}\n")));
  const exact = "  exact content\r\ntrailing blanks\n\n";
  await writeFile(join(project, "exact.txt"), exact);
  await cp(bundle, join(pluginsDir, "tokenjuice"), { recursive: true });
  Object.assign(process.env, {
    HOME: home, HANA_HOME: home, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1",
    XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"),
    XDG_STATE_HOME: join(home, ".local/state"), XDG_CACHE_HOME: join(home, ".cache"),
    TOKENJUICE_STATS: "off", TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"), SHELL: "/bin/bash",
  });
  process.chdir(project);
  const load = relative => import(pathToFileURL(join(host, relative)).href);
  const [{ PluginManager }, { PreferencesManager }, { EventBus }, nativeSdk, { createExecCommandTools }] = await Promise.all([
    load("core/plugin-manager.ts"), load("core/preferences-manager.ts"), load("hub/event-bus.ts"),
    load("lib/pi-sdk/index.ts"), load("lib/exec-command/tool.ts"),
  ]);
  sdk = nativeSdk;
  const preferences = new PreferencesManager({ userDir: home, agentsDir: join(home, "agents") });
  const hostPackage = JSON.parse(await readFile(join(host, "package.json"), "utf8"));
  const pluginManager = new PluginManager({ pluginsDir, dataDir: join(home, "plugin-data"),
    bus: new EventBus(), preferencesManager: preferences, appVersion: hostPackage.version });
  pluginManager.scan();
  await pluginManager.loadAll();
  assert.equal(pluginManager.getPlugin("tokenjuice").status, "restricted");
  assert.equal(pluginManager.getExtensionFactories().length, 0, "native permission gate must deny the plugin initially");
  await pluginManager.setFullAccess(true);
  assert.equal(pluginManager.getPlugin("tokenjuice").status, "loaded");
  assert.equal(pluginManager.getExtensionFactories().length, 1, "native loader must import the packaged extension");
  await new Promise(ready => server.listen(0, "127.0.0.1", ready));
  const auth = sdk.AuthStorage.inMemory();
  const registry = sdk.createModelRegistry(auth, join(agentDir, "models.json"));
  sdk.registerModelProvider(registry, "fixture", {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: "openai-completions", apiKey: "fixture-no-secret",
    models: [{ id: "fixture", name: "fixture", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 }],
  });
  const model = registry.find("fixture", "fixture");
  assert.ok(model);
  const createSession = async () => {
    const settings = sdk.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
    const loader = new sdk.DefaultResourceLoader({ cwd: project, agentDir, settingsManager: settings,
      noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: pluginManager.getExtensionFactories(), systemPrompt: "Run the requested fixture tools." });
    await loader.reload();
    const tools = createExecCommandTools({ bashTool: sdk.createBashTool(project), getCwd: () => project });
    return (await sdk.createAgentSession({ cwd: project, agentDir, authStorage: auth, modelRegistry: registry, model,
      thinkingLevel: "off", settingsManager: settings, sessionManager: sdk.SessionManager.inMemory(project),
      tools, resourceLoader: loader })).session;
  };
  session = await createSession();
  const events = [];
  session.subscribe(event => { if (event.type === "tool_execution_end") events.push(event); });
  await session.prompt("Run every fixture command in order.");
  assert.ifError(serverError);
  assert.equal(observed.size, cases.length, "real tool results must reach the next model request");
  assert.ok(observed.get("listing").includes("80 matches"));
  assert.ok(observed.get("listing").includes("tokenjuice"));
  assert.equal(observed.get("exact"), exact);
  assert.equal(observed.get("raw").trimEnd().split("\n").length, 80);
  assert.ok(!observed.get("raw").includes("tokenjuice"));
  assert.ok(observed.get("failure").includes("failure-output"));
  const failed = events.find(event => event.toolCallId === "failure");
  assert.equal(failed.isError, true);
  assert.equal(failed.result.details.execCommand.exitCode, 7);
  const completed = events.find(event => event.toolCallId === "listing");
  assert.equal(completed.result.details.execCommand.ok, true);
  assert.equal(completed.result.details.execCommand.tty, false);
  const truncated = events.find(event => event.toolCallId === "truncated");
  assert.ok(truncated.result.details.fullOutputPath, "real Bash tool must exercise its truncation boundary");
  assert.ok(!observed.get("truncated").includes("[tokenjuice"), "truncated results must pass through");
  await sdk.emitSessionShutdown(session);
  session.dispose();
  session = undefined;
  await pluginManager.setFullAccess(false);
  assert.equal(pluginManager.getPlugin("tokenjuice").status, "restricted");
  assert.equal(pluginManager.getExtensionFactories().length, 0);
  activeCases = [cases[0]];
  observed = new Map();
  session = await createSession();
  await session.prompt("Run the listing again with the plugin disabled.");
  assert.ifError(serverError);
  assert.equal(observed.get("listing").trimEnd().split("\n").length, 80);
  assert.ok(!observed.get("listing").includes("tokenjuice"));
  process.stdout.write(`${JSON.stringify({ ok: true, host: "openhanako-app-core", version: hostPackage.version,
    modelRequests, cases: cases.map(item => item.id), permissionGate: "deny-grant-revoke", desktopUi: "unverified" })}\n`);
} finally {
  if (session) {
    await sdk.emitSessionShutdown(session);
    session.dispose();
  }
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  process.chdir(originalCwd);
  await rm(root, { recursive: true, force: true });
}
