#!/usr/bin/env node

import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const distCliPath = join(repoRoot, "dist", "cli", "main.js");
const tempRoot = await mkdtemp(join(tmpdir(), "tokenjuice-host-e2e-"));

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function compactableOutput(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}/example-${index + 1}.json`).join("\n");
}

function postToolUsePayload(command, toolResponse) {
  return `${JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command },
    tool_response: toolResponse,
  })}\n`;
}

function run(command, args, options = {}) {
  const {
    cwd = repoRoot,
    env = {},
    input,
    ok = [0],
    timeoutMs = 30_000,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
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
      if (!ok.includes(exitCode)) {
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

    if (input !== undefined) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}

async function assertFile(path, hint) {
  try {
    await access(path);
  } catch {
    fail(`${path} is missing${hint ? `; ${hint}` : ""}`);
  }
}

async function runCodexE2E() {
  const codexHome = join(tempRoot, "codex-home");
  const schemaDir = join(tempRoot, "codex-app-server-schema");
  await mkdir(codexHome, { recursive: true });
  await writeFile(join(codexHome, "config.toml"), "[features]\ncodex_hooks = true\n", "utf8");

  const version = await run("codex", ["--version"]);
  await run("codex", ["app-server", "generate-json-schema", "--experimental", "--out", schemaDir], {
    env: { CODEX_HOME: codexHome },
  });
  await assertFile(join(schemaDir, "v2", "CommandExecParams.json"));

  await run(process.execPath, [distCliPath, "install", "codex", "--local"], {
    env: { CODEX_HOME: codexHome },
  });
  const doctor = await run(process.execPath, [distCliPath, "doctor", "codex", "--local", "--format", "json"], {
    env: { CODEX_HOME: codexHome },
  });
  const report = JSON.parse(doctor.stdout);
  assert(report.status === "ok", `expected Codex doctor status ok, got ${doctor.stdout}`);

  const payload = postToolUsePayload(
    "find src/rules -maxdepth 2 -type f | head -n 40",
    compactableOutput("src/rules", 40),
  );
  const hook = await run(process.execPath, [distCliPath, "codex-post-tool-use"], {
    env: { CODEX_HOME: codexHome },
    input: payload,
    ok: [2],
  });

  assert(hook.stdout === "", `expected Codex hook stdout to stay empty, got ${hook.stdout}`);
  assert(hook.stderr.includes("40 matches"), "expected Codex hook stderr to contain compacted match count");
  assert(hook.stderr.includes("src/rules/example-1.json"), "expected Codex hook stderr to include compacted paths");
  assert(hook.stderr.includes("tokenjuice wrap --raw -- <command>"), "expected Codex hook stderr to include raw rerun hint");
  assert(!hook.stderr.includes("\"decision\""), "Codex hook feedback must not emit JSON decision:block output");

  return {
    version: version.stdout.trim(),
    doctor: report.status,
    exitCode: hook.code,
  };
}

async function runClaudeE2E() {
  const claudeHome = join(tempRoot, "claude-home");
  await mkdir(claudeHome, { recursive: true });

  const version = await run("claude", ["--version"]);
  await run("claude", ["-p", "--help"]);

  await run(process.execPath, [distCliPath, "install", "claude-code", "--local"], {
    env: { CLAUDE_CONFIG_DIR: claudeHome, CLAUDE_HOME: claudeHome },
  });
  const doctor = await run(process.execPath, [distCliPath, "doctor", "claude-code", "--local", "--format", "json"], {
    env: { CLAUDE_CONFIG_DIR: claudeHome, CLAUDE_HOME: claudeHome },
  });
  const report = JSON.parse(doctor.stdout);
  assert(report.status === "ok", `expected Claude Code doctor status ok, got ${doctor.stdout}`);

  const payload = postToolUsePayload("rg --files src/rules", compactableOutput("src/rules", 30));
  const hook = await run(process.execPath, [distCliPath, "claude-code-post-tool-use"], {
    env: { CLAUDE_CONFIG_DIR: claudeHome, CLAUDE_HOME: claudeHome },
    input: payload,
  });

  assert(hook.stderr === "", `expected Claude Code hook stderr to stay empty, got ${hook.stderr}`);
  const output = JSON.parse(hook.stdout);
  assert(output.suppressOutput === true, "expected Claude Code hook output to suppress raw tool output");
  assert(output.decision === undefined, "Claude Code hook output must not include decision:block");
  assert(output.reason === undefined, "Claude Code hook output must not include block reason");
  const additionalContext = output.hookSpecificOutput?.additionalContext;
  assert(typeof additionalContext === "string", "expected Claude Code additionalContext");
  assert(additionalContext.includes("30 paths"), "expected Claude Code additionalContext to contain compacted path count");
  assert(additionalContext.includes("tokenjuice wrap --raw -- <command>"), "expected Claude Code additionalContext to include raw rerun hint");

  return {
    version: version.stdout.trim(),
    doctor: report.status,
    exitCode: hook.code,
  };
}

try {
  await assertFile(distCliPath, "run `pnpm build` first");
  const results = {
    codex: await runCodexE2E(),
    claudeCode: await runClaudeE2E(),
  };
  process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
