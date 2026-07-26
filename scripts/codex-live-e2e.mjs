#!/usr/bin/env node

import { access, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const distCliPath = join(repoRoot, "dist", "cli", "main.js");
const tempRoot = await mkdtemp(join(tmpdir(), "tokenjuice-codex-live-e2e-"));
const rawMarker = "TOKENJUICE_CODEX_LIVE_RAW_MARKER";
const ghArgs = [
  "pr",
  "view",
  "206",
  "--json",
  "number,title,url,isDraft,headRefName,headRefOid,mergeStateStatus,statusCheckRollup",
];
const ghCommand = `gh ${ghArgs.join(" ")}`;
const ghPayload = {
  headRefName: "fix/compound-output-contract",
  headRefOid: "42238adab077bd3f39f862f92501bfa3d71bfae8",
  isDraft: false,
  mergeStateStatus: "UNKNOWN",
  number: 206,
  rawMarker,
  statusCheckRollup: [
    {
      __typename: "CheckRun",
      completedAt: "2026-06-18T08:25:58Z",
      conclusion: "SUCCESS",
      detailsUrl: "https://github.com/vincentkoc/tokenjuice/actions/runs/27746720696/job/82086723525",
      name: "assign",
      startedAt: "2026-06-18T08:25:53Z",
      status: "COMPLETED",
      workflowName: "Auto Assign",
    },
    {
      __typename: "CheckRun",
      completedAt: "2026-06-18T08:26:06Z",
      conclusion: "SUCCESS",
      detailsUrl: "https://github.com/vincentkoc/tokenjuice/actions/runs/27746725443/job/82086739798",
      name: "assign",
      startedAt: "2026-06-18T08:26:00Z",
      status: "COMPLETED",
      workflowName: "Auto Assign",
    },
    {
      __typename: "CheckRun",
      completedAt: "2026-06-18T08:26:51Z",
      conclusion: "SUCCESS",
      detailsUrl: "https://github.com/vincentkoc/tokenjuice/actions/runs/27746720707/job/82086723468",
      name: "quality",
      startedAt: "2026-06-18T08:25:53Z",
      status: "COMPLETED",
      workflowName: "CI",
    },
    {
      __typename: "CheckRun",
      completedAt: "2026-06-18T08:25:59Z",
      conclusion: "SUCCESS",
      detailsUrl: "https://github.com/vincentkoc/tokenjuice/actions/runs/27746720653/job/82086723479",
      name: "Update Release Draft",
      startedAt: "2026-06-18T08:25:53Z",
      status: "COMPLETED",
      workflowName: "Release Drafter",
    },
    {
      __typename: "CheckRun",
      completedAt: "2026-06-18T08:27:14Z",
      conclusion: "SUCCESS",
      detailsUrl: "https://github.com/vincentkoc/tokenjuice/actions/runs/27746720707/job/82086898704",
      name: "package",
      startedAt: "2026-06-18T08:26:55Z",
      status: "COMPLETED",
      workflowName: "CI",
    },
    {
      __typename: "StatusContext",
      context: "AccessLint",
      startedAt: "2026-06-18T08:27:20Z",
      state: "PENDING",
      targetUrl: "",
    },
  ],
  title: "fix(core): preserve compound command output",
  url: "https://github.com/vincentkoc/tokenjuice/pull/206",
};

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function run(command, args, options = {}) {
  const {
    cwd = repoRoot,
    env = {},
    timeoutMs = 180_000,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`timed out after ${timeoutMs}ms: ${[command, ...args].join(" ")}`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const exitCode = code ?? 128;
      if (exitCode !== 0) {
        reject(new Error([
          `command failed: ${[command, ...args].join(" ")}`,
          `exit: ${exitCode}${signal ? ` signal: ${signal}` : ""}`,
          stdout ? `stdout:\n${stdout}` : "",
          stderr ? `stderr:\n${stderr}` : "",
        ].filter(Boolean).join("\n")));
        return;
      }
      resolve({ code: exitCode, stdout, stderr });
    });
  });
}

async function assertFile(path, hint) {
  try {
    await access(path);
  } catch {
    fail(`${path} is missing${hint ? `; ${hint}` : ""}`);
  }
}

async function findFiles(root, suffix) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return findFiles(path, suffix);
    }
    return entry.isFile() && entry.name.endsWith(suffix) ? [path] : [];
  }));
  return nested.flat();
}

function messageText(payload) {
  if (payload.type !== "message" || !Array.isArray(payload.content)) {
    return "";
  }
  return payload.content
    .map((item) => typeof item?.text === "string" ? item.text : "")
    .join("");
}

function buildFakeGhSource() {
  return [
    "#!/usr/bin/env node",
    "",
    `const expectedArgs = ${JSON.stringify(ghArgs)};`,
    `const payload = ${JSON.stringify(ghPayload)};`,
    "const actualArgs = process.argv.slice(2);",
    "if (JSON.stringify(actualArgs) !== JSON.stringify(expectedArgs)) {",
    "  process.stderr.write(`unexpected fake gh arguments: ${actualArgs.join(\" \")}\\n`);",
    "  process.exit(64);",
    "}",
    "process.stdout.write(`${JSON.stringify(payload)}\\n`);",
    "",
  ].join("\n");
}

async function runLiveE2E() {
  const sourceCodexHome = process.env.TOKENJUICE_CODEX_LIVE_SOURCE_HOME
    ?? process.env.CODEX_HOME
    ?? join(homedir(), ".codex");
  const sourceAuthPath = join(sourceCodexHome, "auth.json");
  const codexHome = join(tempRoot, "codex-home");
  const fakeBin = join(tempRoot, "bin");
  const fakeGhPath = join(fakeBin, "gh");
  const transcriptRoot = join(codexHome, "sessions");
  const debugPath = join(codexHome, "tokenjuice-hook.last.json");

  await assertFile(distCliPath, "run `pnpm build` first");
  await assertFile(sourceAuthPath, "run `codex login` before this manual live E2E");
  await mkdir(codexHome, { recursive: true });
  await mkdir(fakeBin, { recursive: true });
  await symlink(sourceAuthPath, join(codexHome, "auth.json"));
  await writeFile(fakeGhPath, buildFakeGhSource(), { encoding: "utf8", mode: 0o755 });
  await writeFile(join(fakeBin, "gh.cmd"), "@echo off\r\nnode \"%~dp0gh\" %*\r\n", "utf8");

  const env = {
    CODEX_HOME: codexHome,
    PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
    TOKENJUICE_DEBUG: "1",
  };
  const codexVersion = (await run("codex", ["--version"], { env })).stdout.trim();
  await run(process.execPath, [distCliPath, "install", "codex", "--local"], { env });

  const prompt = [
    `Run exactly this one shell command and do not use any other tool: ${ghCommand}.`,
    "After it returns, respond exactly TOKENJUICE_CODEX_LIVE_E2E_DONE.",
  ].join(" ");
  await run("codex", [
    "exec",
    "--sandbox",
    "read-only",
    "--dangerously-bypass-hook-trust",
    "--skip-git-repo-check",
    "--color",
    "never",
    prompt,
  ], {
    cwd: tempRoot,
    env,
  });

  const transcriptPaths = await findFiles(transcriptRoot, ".jsonl");
  assert(transcriptPaths.length === 1, `expected one Codex transcript, found ${transcriptPaths.length}`);
  const transcriptPath = transcriptPaths[0];
  assert(typeof transcriptPath === "string", "expected Codex transcript path");
  const transcriptEntries = (await readFile(transcriptPath, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const responseItems = transcriptEntries
    .filter((entry) => entry.type === "response_item")
    .map((entry) => entry.payload);
  const summaryText = responseItems
    .filter((payload) => payload.type === "message" && payload.role === "developer")
    .map(messageText)
    .find((text) => text.includes("#206 fix(core): preserve compound command output"));
  assert(typeof summaryText === "string", "expected Tokenjuice summary in Codex developer context");
  assert(summaryText.includes("need raw? `tokenjuice wrap --raw -- <command>`"), "expected raw rerun hint in Tokenjuice summary");
  assert(!summaryText.includes(rawMarker), "raw marker leaked into Tokenjuice summary");

  const functionCallOutputs = responseItems
    .filter((payload) => payload.type === "function_call_output")
    .map((payload) => payload.output)
    .filter((output) => typeof output === "string");
  assert(functionCallOutputs.length === 1, `expected one model-visible function_call_output, found ${functionCallOutputs.length}`);
  const functionCallOutput = functionCallOutputs[0];
  assert(typeof functionCallOutput === "string", "expected model-visible function_call_output");
  assert(!functionCallOutput.includes(rawMarker), "raw marker leaked into model-visible function_call_output");

  const debug = JSON.parse(await readFile(debugPath, "utf8"));
  assert(debug.rewrote === true, "expected Tokenjuice hook debug rewrote:true");
  assert(typeof debug.rawChars === "number", "expected rawChars in Tokenjuice hook debug");
  assert(typeof debug.reducedChars === "number", "expected reducedChars in Tokenjuice hook debug");

  const sessionMeta = transcriptEntries.find((entry) => entry.type === "session_meta");
  const finalModelContextChars = summaryText.length + functionCallOutput.length;
  return {
    ok: true,
    codexVersion,
    sessionId: sessionMeta?.payload?.session_id,
    checks: {
      summaryPresent: true,
      rawMarkerAbsentFromFunctionCallOutput: true,
      hookRewrote: true,
    },
    chars: {
      raw: debug.rawChars,
      compressed: debug.reducedChars,
      summaryContext: summaryText.length,
      functionCallOutput: functionCallOutput.length,
      finalModelContext: finalModelContextChars,
    },
  };
}

let report;
try {
  report = await runLiveE2E();
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({ ...report, cleanedUp: true }, null, 2)}\n`);
