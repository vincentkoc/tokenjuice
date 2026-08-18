#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const distCli = join(repoRoot, "dist", "cli", "main.js");
const tempRoot = await mkdtemp(join(tmpdir(), "tokenjuice-code-mode-e2e-"));
const codexHome = join(tempRoot, "codex-home");
const workspace = join(tempRoot, "workspace");
const fakeBin = join(tempRoot, "bin");
const rawMarker = "TOKENJUICE_CODE_MODE_RAW_MARKER";
const ghCommand = "gh pr view 206 --json number,title,url,statusCheckRollup";
const requests = [];
let responseIndex = 0;

function sse(res, events) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.end();
}

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
  if (!req.url?.endsWith("/responses")) {
    res.writeHead(404).end();
    return;
  }
  requests.push(body);
  responseIndex += 1;
  if (responseIndex === 1) {
    const code = [
      `const command = ${JSON.stringify(ghCommand)};`,
      "try {",
      "  const result = await tools.exec_command({ cmd: command });",
      "  text(result.output);",
      "} catch (error) {",
      "  text(String(error));",
      "}",
    ].join("\n");
    sse(res, [
      { type: "response.created", response: { id: "resp-1" } },
      {
        type: "response.output_item.done",
        item: { type: "custom_tool_call", call_id: "code-call-1", name: "exec", input: code },
      },
      {
        type: "response.completed",
        response: { id: "resp-1", usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } },
      },
    ]);
    return;
  }
  sse(res, [
    { type: "response.created", response: { id: "resp-2" } },
    {
      type: "response.output_item.done",
      item: {
        type: "message",
        role: "assistant",
        id: "msg-1",
        content: [{ type: "output_text", text: "POC_DONE" }],
      },
    },
    {
      type: "response.completed",
      response: { id: "resp-2", usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } },
    },
  ]);
});

function run(command, args, env, cwd = repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error(`${command} exited ${code}\n${stdout}\n${stderr}`)));
  });
}

function contentText(item) {
  if (!Array.isArray(item?.content)) return "";
  return item.content.map((part) => part?.text ?? "").join("");
}

let report;
try {
  await Promise.all([
    mkdir(codexHome, { recursive: true }),
    mkdir(workspace, { recursive: true }),
    mkdir(fakeBin, { recursive: true }),
  ]);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing mock server port");

  const statuses = Array.from({ length: 12 }, (_, index) => ({
    __typename: "CheckRun",
    name: `quality-${index}`,
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: `https://example.invalid/check/${index}`,
  }));
  const fakeGh = join(fakeBin, "gh");
  await writeFile(fakeGh, [
    "#!/usr/bin/env node",
    `process.stdout.write(${JSON.stringify(JSON.stringify({
      number: 206,
      title: "fix(core): preserve compound command output",
      url: "https://github.com/vincentkoc/tokenjuice/pull/206",
      statusCheckRollup: statuses,
      rawMarker,
    }) + "\n")});`,
  ].join("\n"), { mode: 0o755 });
  await writeFile(join(codexHome, "config.toml"), [
    'model = "gpt-5.4"',
    'model_provider = "poc"',
    '[model_providers.poc]',
    'name = "POC"',
    `base_url = "http://127.0.0.1:${address.port}/v1"`,
    'env_key = "POC_API_KEY"',
    'wire_api = "responses"',
  ].join("\n"));

  const env = {
    ...process.env,
    CODEX_HOME: codexHome,
    POC_API_KEY: "dummy",
    PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
    TOKENJUICE_DEBUG: "1",
    TOKENJUICE_NO_OMISSION: "",
    NODE_COMPILE_CACHE: join(tempRoot, "node-compile-cache"),
  };
  await run(process.execPath, [distCli, "install", "codex", "--local"], env);
  const codexRun = await run("codex", [
    "exec",
    "--enable", "hooks",
    "--enable", "code_mode",
    "--sandbox", "workspace-write",
    "--dangerously-bypass-hook-trust",
    "--skip-git-repo-check",
    "--color", "never",
    "run the requested command",
  ], env, workspace);

  const secondInput = requests[1]?.input ?? [];
  const customOutput = secondInput.find((item) => item?.type === "custom_tool_call_output");
  const developerContext = secondInput
    .filter((item) => item?.type === "message" && item?.role === "developer")
    .map(contentText)
    .join("\n");
  const debug = JSON.parse(await readFile(join(codexHome, "tokenjuice-hook.last.json"), "utf8"));
  report = {
    ok: debug.rewrote === true
      && !JSON.stringify(customOutput).includes(rawMarker)
      && developerContext.includes("#206 fix(core): preserve compound command output"),
    codexVersion: codexRun.stderr.match(/OpenAI Codex v[^\n]+/)?.[0] ?? "unknown",
    hook: {
      rewrote: debug.rewrote,
      rawChars: debug.rawChars,
      reducedChars: debug.reducedChars,
    },
    outerCustomToolOutput: {
      type: customOutput?.type,
      output: customOutput?.output,
      rawMarkerAbsent: !JSON.stringify(customOutput).includes(rawMarker),
    },
    compactedDeveloperContextPresent: developerContext.includes("#206 fix(core): preserve compound command output"),
    assistantCompleted: codexRun.stdout.includes("POC_DONE") || codexRun.stderr.includes("POC_DONE"),
  };
} finally {
  server.close();
  await rm(tempRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
