import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const vendor = createRequire(join(resolve(process.argv[2]), "package.json"));
const dist = resolve(process.argv[3] ?? "dist");
const load = name => import(pathToFileURL(vendor.resolve(name)).href);
const { Agent } = await load("@mastra/core/agent");
const { createTool } = await load("@mastra/core/tools");
const { createOpenAICompatible } = await load("@ai-sdk/openai-compatible");
const { z } = await load("zod");
const { CopilotClient, approveAll } = await load("@github/copilot-sdk");
const { createMastraProcessor } = await import(pathToFileURL(join(dist, "hosts/mastra/index.js")).href);
const { createCopilotSdkHooks } = await import(pathToFileURL(join(dist, "hosts/copilot-sdk/index.js")).href);
const root = await mkdtemp(join(tmpdir(), "tokenjuice-framework-native-"));
const raw = Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`).join("\n");
const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
const commands = ["find fixtures -type f", "cat exact.txt", `${quote(process.execPath)} ${quote(join(dist, "cli/main.js"))} wrap --raw -- find fixtures -type f`,
  "for ((i=0;i<80;i++)); do printf 'failure-%s\\n' \"$i\"; done; printf 'failure-stderr\\n' >&2; exit 7"];
process.env.TOKENJUICE_STATS = "off";
const requests = [];
let selected = 0;
let serverError;
const server = createServer(async (request, response) => {
  try {
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    requests.push(payload);
    const toolResult = payload.messages?.findLast(message => message.role === "tool");
    const toolName = payload.tools?.find(tool => tool.function?.name === "bash")?.function.name;
    const next = !toolResult && toolName;
    const message = next ? { role: "assistant", content: null, tool_calls: [{ id: "native-call", type: "function", function: { name: toolName, arguments: JSON.stringify({ command: commands[selected] }) } }] }
      : { role: "assistant", content: "fixture complete" };
    if (payload.stream) {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      const delta = next ? { role: "assistant", tool_calls: message.tool_calls.map(call => ({ index: 0, ...call })) } : message;
      for (const [part, reason] of [[delta, null], [{}, next ? "tool_calls" : "stop"]]) {
        response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture", choices: [{ index: 0, delta: part, finish_reason: reason }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
      }
      response.end("data: [DONE]\n\n");
    } else {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: "fixture", object: "chat.completion", created: 0, model: "fixture", choices: [{ index: 0, message, finish_reason: next ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    }
  } catch (error) { serverError = error; response.writeHead(500).end("invalid fixture request"); }
});

function observed() {
  assert.ifError(serverError);
  const messages = requests.flatMap(request => request.messages ?? []);
  const tool = messages.findLast(message => message.role === "tool");
  assert.ok(tool, "a subsequent native model request must contain the tool result");
  assert.ok(tool.tool_call_id, "native call identity survives");
  return typeof tool.content === "string" ? tool.content : tool.content.map(part => part.text ?? "").join("");
}

try {
  await mkdir(join(root, "fixtures"));
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(root, "fixtures", `example-${i}.json`), "{}")));
  await writeFile(join(root, "exact.txt"), raw);
  await new Promise(ready => server.listen(0, "127.0.0.1", ready));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const provider = createOpenAICompatible({ name: "fixture", baseURL: baseUrl, apiKey: "fixture" });
  for (selected = 0; selected < commands.length; selected++) {
    requests.length = 0;
    const processor = createMastraProcessor({
      decode: input => input.toolName === "bash" ? input.result : undefined,
      replace: (original, text) => ({ ...original, output: text }),
    });
    const agent = new Agent({ id: "fixture", name: "fixture", instructions: "Run the requested shell tool.", model: provider("fixture"),
      tools: { bash: createTool({ id: "bash", description: "Captured shell output", inputSchema: z.object({ command: z.string() }),
        execute: async ({ command }) => ({ command, output: raw, exitCode: selected === 3 ? 7 : 0, native: true }) }) }, outputProcessors: [processor] });
    const result = await agent.generate("run the fixture", { maxSteps: 3 });
    assert.equal(result.text, "fixture complete");
    const data = JSON.parse(observed());
    assert.equal(data.native, true);
    assert.equal(data.exitCode, selected === 3 ? 7 : 0);
    if (selected === 0) assert.ok(data.output.includes("80 matches") && data.output.length < raw.length);
    else assert.equal(data.output, raw);
  }
  console.log("native Mastra model request contracts passed");

  const client = new CopilotClient({ baseDirectory: join(root, "copilot"), workingDirectory: root,
    env: { HOME: root, COPILOT_OFFLINE: "true", TOKENJUICE_STATS: "off", DO_NOT_TRACK: "1" } });
  try {
    await client.start();
    // The SDK owns shell execution. Only this disposable fixture grants tools permission.
    for (selected = 0; selected < commands.length; selected++) {
      requests.length = 0;
      const session = await client.createSession({ model: "fixture", provider: { type: "openai", baseUrl, apiKey: "fixture" },
        workingDirectory: root, availableTools: ["bash"], onPermissionRequest: approveAll, hooks: createCopilotSdkHooks() });
      try {
        await session.sendAndWait({ prompt: "run the fixture" }, 60_000);
        const text = observed();
        if (selected === 0) assert.ok(text.includes("80 matches") && text.length < raw.length);
        else if (selected === 3) {
          for (let i = 0; i < 80; i++) assert.ok(text.includes(`failure-${i}\n`));
          assert.ok(text.includes("failure-stderr"));
        } else if (selected === 1) assert.ok(text.includes(raw));
        else for (let i = 0; i < 80; i++) assert.ok(text.includes(`fixtures/example-${i}.json`));
        assert.match(text, new RegExp(`\\n<(?:shellId: \\d+ completed with exit code|exited with exit code) ${selected === 3 ? 7 : 0}>$`, "u"));
      } finally { await session[Symbol.asyncDispose](); }
    }
  } finally { await client.stop(); }
  console.log("native Copilot SDK model request contracts passed");
} finally {
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  await rm(root, { recursive: true, force: true });
}
