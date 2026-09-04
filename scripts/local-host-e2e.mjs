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

function postToolUsePayload(command, toolResponse, exitCode = 0) {
  return `${JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    exit_code: exitCode,
    tool_input: { command },
    tool_response: toolResponse,
  })}\n`;
}

function preToolUsePayload(command, toolInput = {}) {
  return `${JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { ...toolInput, command },
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
  const hookEnv = {
    CODEX_HOME: codexHome,
    // Keep the authoritative-vs-normalized assertions independent of a developer's shell env.
    TOKENJUICE_NO_OMISSION: "",
  };

  const payload = postToolUsePayload(
    "git status",
    [
      "On branch pr-65478-security-fix",
      "Your branch and 'origin/pr-65478-security-fix' have diverged,",
      "and have 8 and 642 different commits each, respectively.",
      "",
      "Changes not staged for commit:",
      "\tmodified:   src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts",
      "\tmodified:   src/agents/pi-embedded-runner/run/attempt.test.ts",
      "",
      "no changes added to commit",
    ].join("\n"),
  );
  const hook = await run(process.execPath, [distCliPath, "codex-post-tool-use"], {
    env: hookEnv,
    input: payload,
  });

  assert(hook.stderr === "", `expected Codex hook stderr to stay empty, got ${hook.stderr}`);
  const output = JSON.parse(hook.stdout);
  const additionalContext = output.hookSpecificOutput?.additionalContext;
  assert(output.hookSpecificOutput?.hookEventName === "PostToolUse", "expected Codex PostToolUse output");
  assert(typeof additionalContext === "string", "expected Codex additionalContext");
  const observationPrefix = "<tokenjuice_compacted_tool_observation>\n";
  const observationSuffix = "\n</tokenjuice_compacted_tool_observation>";
  assert(additionalContext.startsWith(observationPrefix), "expected delimited Codex observation");
  assert(additionalContext.endsWith(observationSuffix), "expected closed Codex observation");
  const observation = JSON.parse(additionalContext.slice(observationPrefix.length, -observationSuffix.length));
  assert(observation.source === "codex-post-tool-use", "expected factual Codex observation source");
  assert(observation.exitCode === 0, "expected factual Codex observation exit code");
  assert(observation.authority === "non-authoritative-rewrite", "expected non-authoritative rewrite label");
  assert(observation.compactedOutput.includes("Changes not staged:"), "expected Codex hook output to retain status context");
  assert(
    observation.compactedOutput.includes("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts"),
    "expected Codex hook output to include compacted status paths",
  );
  assert(!observation.compactedOutput.includes("and have 8 and 642"), "expected Codex hook output to omit noisy branch details");
  assert(
    observation.recoveryReference === undefined,
    "expected non-authoritative Codex rewrites to omit recovery references",
  );
  assert(!hook.stdout.includes("\"decision\""), "Codex hook feedback must not emit JSON decision:block output");

  const authoritativeHook = await run(process.execPath, [distCliPath, "codex-post-tool-use"], {
    env: hookEnv,
    input: postToolUsePayload(
      "git log --oneline",
      Array.from(
        { length: 40 },
        (_, index) => `${(index + 1).toString(16).padStart(7, "a")} feat: commit ${index}`,
      ).join("\n"),
    ),
  });
  const authoritativeOutput = JSON.parse(authoritativeHook.stdout);
  const authoritativeContext = authoritativeOutput.hookSpecificOutput?.additionalContext;
  assert(typeof authoritativeContext === "string", "expected authoritative Codex context");
  const authoritativeObservation = JSON.parse(
    authoritativeContext.slice(observationPrefix.length, -observationSuffix.length),
  );
  assert(
    authoritativeObservation.authority === "authoritative-omission",
    "expected authoritative Codex omission label",
  );
  assert(
    authoritativeObservation.recoveryReference === "tokenjuice wrap --raw -- <command>",
    "expected authoritative Codex omissions to retain a factual recovery reference",
  );

  // Exercise the packaged CLI at both fail-open thresholds: compaction itself
  // is optional above 1 MiB, while stdin is drained above 16 MiB so Tokenjuice
  // exits cleanly instead of failing on oversized hook input.
  const oversizedResponse = await run(process.execPath, [distCliPath, "codex-post-tool-use"], {
    env: { CODEX_HOME: codexHome },
    input: postToolUsePayload("bin/rails test", "x".repeat(1024 * 1024 + 1)),
  });
  assert(oversizedResponse.code === 0, `expected oversized Codex hook exit 0, got ${oversizedResponse.code}`);
  assert(oversizedResponse.stdout === "", "expected oversized Codex hook stdout to stay empty");
  assert(oversizedResponse.stderr === "", `expected oversized Codex hook stderr to stay empty, got ${oversizedResponse.stderr}`);

  const overInputLimit = await run(process.execPath, [distCliPath, "codex-post-tool-use"], {
    env: { CODEX_HOME: codexHome },
    input: postToolUsePayload("bin/rails test", "x".repeat(16 * 1024 * 1024)),
  });
  assert(overInputLimit.code === 0, `expected over-limit Codex hook exit 0, got ${overInputLimit.code}`);
  assert(overInputLimit.stdout === "", "expected over-limit Codex hook stdout to stay empty");
  assert(overInputLimit.stderr === "", `expected over-limit Codex hook stderr to stay empty, got ${overInputLimit.stderr}`);

  return {
    version: version.stdout.trim(),
    doctor: report.status,
    exitCodes: {
      compacted: hook.code,
      oversizedResponse: oversizedResponse.code,
      overInputLimit: overInputLimit.code,
    },
  };
}

async function runClaudeE2E() {
  const claudeHome = join(tempRoot, "claude-home");
  const shellPath = join(tempRoot, "claude-host-shell");
  await mkdir(claudeHome, { recursive: true });
  await writeFile(shellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

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

  const payload = preToolUsePayload("rg --files src/rules", {
    shell: shellPath,
    description: "List rule fixtures",
    timeout: 120000,
  });
  const hook = await run(process.execPath, [distCliPath, "claude-code-pre-tool-use", "--wrap-launcher", distCliPath], {
    env: { CLAUDE_CONFIG_DIR: claudeHome, CLAUDE_HOME: claudeHome },
    input: payload,
  });

  assert(hook.stderr === "", `expected Claude Code hook stderr to stay empty, got ${hook.stderr}`);
  const output = JSON.parse(hook.stdout);
  const hookOutput = output.hookSpecificOutput;
  assert(hookOutput?.hookEventName === "PreToolUse", "expected Claude Code PreToolUse output");
  assert(hookOutput.permissionDecision === undefined, "Claude Code rewrite must not grant permission");
  assert(hookOutput.updatedInput?.description === "List rule fixtures", "expected Claude Code to preserve tool input fields");
  assert(hookOutput.updatedInput?.timeout === 120000, "expected Claude Code to preserve numeric tool input fields");
  assert(hookOutput.updatedInput?.command?.includes("wrap --source claude-code --"), "expected Claude Code command to route through tokenjuice wrap");
  assert(hookOutput.updatedInput?.command?.includes(shellPath), "expected Claude Code command to use host shell path");
  assert(hookOutput.updatedInput?.command?.includes("rg --files src/rules"), "expected Claude Code command to preserve original command");

  return {
    version: version.stdout.trim(),
    doctor: report.status,
    exitCode: hook.code,
  };
}

async function runCodeBuddyE2E() {
  const codebuddyHome = join(tempRoot, "codebuddy-home");
  const shellPath = join(tempRoot, "codebuddy-host-shell");
  await mkdir(codebuddyHome, { recursive: true });
  await writeFile(shellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

  const env = { CODEBUDDY_CONFIG_DIR: codebuddyHome, CODEBUDDY_HOME: codebuddyHome };
  await run(process.execPath, [distCliPath, "install", "codebuddy", "--local"], { env });
  const doctor = await run(process.execPath, [distCliPath, "doctor", "codebuddy", "--local", "--format", "json"], { env });
  const report = JSON.parse(doctor.stdout);
  assert(report.status === "ok", `expected CodeBuddy doctor status ok, got ${doctor.stdout}`);

  const payload = preToolUsePayload("git status --short", {
    shell: shellPath,
    description: "Check working tree",
  });
  const hook = await run(process.execPath, [distCliPath, "codebuddy-pre-tool-use", "--wrap-launcher", distCliPath], {
    env,
    input: payload,
  });

  assert(hook.stderr === "", `expected CodeBuddy hook stderr to stay empty, got ${hook.stderr}`);
  const output = JSON.parse(hook.stdout);
  const hookOutput = output.hookSpecificOutput;
  assert(hookOutput?.hookEventName === "PreToolUse", "expected CodeBuddy PreToolUse output");
  assert(hookOutput.permissionDecision === undefined, "CodeBuddy rewrite must not grant permission");
  assert(hookOutput.modifiedInput?.description === "Check working tree", "expected CodeBuddy to preserve tool input fields");
  assert(hookOutput.modifiedInput?.command?.includes("wrap --source codebuddy --"), "expected CodeBuddy command to route through tokenjuice wrap");
  assert(hookOutput.modifiedInput?.command?.includes(shellPath), "expected CodeBuddy command to use host shell path");
  assert(hookOutput.modifiedInput?.command?.includes("git status --short"), "expected CodeBuddy command to preserve original command");

  return {
    doctor: report.status,
    exitCode: hook.code,
  };
}

try {
  await assertFile(distCliPath, "run `pnpm build` first");
  const results = {
    codex: await runCodexE2E(),
    claudeCode: await runClaudeE2E(),
    codebuddy: await runCodeBuddyE2E(),
  };
  process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
