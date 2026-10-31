#!/usr/bin/env node

import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const distCliPath = join(repoRoot, "dist", "cli", "main.js");
const tempRoot = await mkdtemp(join(tmpdir(), "tokenjuice hook contracts '-"));

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
      env: {
        PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
        HOME: tempRoot,
        XDG_CONFIG_HOME: join(tempRoot, "config"),
        SHELL: "/bin/bash",
        TOKENJUICE_ARTIFACT_DIR: join(tempRoot, "artifacts"),
        TOKENJUICE_STATS: "0",
        ...env,
      },
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

    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") reject(error);
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

async function runCodexContracts() {
  const codexHome = join(tempRoot, "codex-home");
  await mkdir(codexHome, { recursive: true });
  await writeFile(join(codexHome, "config.toml"), "[features]\ncodex_hooks = true\n", "utf8");

  await run(process.execPath, [distCliPath, "install", "codex", "--local"], {
    env: { CODEX_HOME: codexHome },
  });
  const doctor = await run(process.execPath, [distCliPath, "doctor", "codex", "--local", "--format", "json"], {
    env: { CODEX_HOME: codexHome },
  });
  const report = JSON.parse(doctor.stdout);
  assert(report.status === "ok", `expected Codex doctor status ok, got ${doctor.stdout}`);
  assert(report.detectedCommands?.length === 1, `expected one Codex hook command, got ${doctor.stdout}`);
  assert(report.detectedCommands[0]?.runtimePath === process.execPath, `expected pinned Codex Node runtime, got ${doctor.stdout}`);
  assert(report.duplicateHookCount === 0, `expected no duplicate Codex hooks, got ${doctor.stdout}`);
  assert(report.missingPaths?.length === 0, `expected no missing Codex hook paths, got ${doctor.stdout}`);
  assert(report.nonExecutablePaths?.length === 0, `expected executable Codex hook paths, got ${doctor.stdout}`);
  assert(report.runtimeMismatches?.length === 0, `expected current Codex Node runtime, got ${doctor.stdout}`);
  assert(report.packageVersionMismatches?.length === 0, `expected current Codex package version, got ${doctor.stdout}`);
  const hookEnv = {
    CODEX_HOME: codexHome,
    // Keep the authoritative-vs-normalized assertions independent of a developer's shell env.
    TOKENJUICE_NO_OMISSION: "",
  };

  const installed = await readInstalledHook(join(codexHome, "hooks.json"), "PostToolUse");
  const invoke = (input, env = hookEnv) => run("/bin/sh", ["-c", installed], { env, input });
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
  const hook = await invoke(payload);

  assert(hook.stderr === "", `expected Codex hook stderr to stay empty, got ${hook.stderr}`);
  const output = JSON.parse(hook.stdout);
  const additionalContext = output.stopReason;
  assert(output.continue === false, "Codex must replace the original result without rejecting nested tools");
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

  const logText = Array.from(
    { length: 40 },
    (_, index) => `${(index + 1).toString(16).padStart(7, "a")} feat: commit ${index}`,
  ).join("\n");
  const authoritativePayload = postToolUsePayload("git log --oneline", logText);
  const authoritativeHook = await invoke(authoritativePayload);
  const authoritativeOutput = JSON.parse(authoritativeHook.stdout);
  const authoritativeContext = authoritativeOutput.stopReason;
  assert(typeof authoritativeContext === "string", "expected authoritative Codex context");
  const authoritativeObservation = JSON.parse(
    authoritativeContext.slice(observationPrefix.length, -observationSuffix.length),
  );
  assert(
    authoritativeObservation.authority === "authoritative-omission",
    "expected authoritative Codex omission label",
  );
  assert(authoritativeObservation.recoveryReference === undefined, "must not claim raw recovery without storage");
  const storedHook = await invoke(authoritativePayload, { ...hookEnv, TOKENJUICE_CODEX_STORE: "1" });
  const storedContext = JSON.parse(storedHook.stdout).stopReason;
  assert(typeof storedContext === "string", "expected stored Codex observation");
  const storedObservation = JSON.parse(storedContext.slice(observationPrefix.length, -observationSuffix.length));
  const recovery = storedObservation.recoveryReference;
  assert(typeof recovery === "string" && /^tokenjuice cat [a-zA-Z0-9_-]+$/.test(recovery), "expected stored artifact recovery command");
  const recovered = await run(process.execPath, [distCliPath, "cat", recovery.split(" ")[2]], { env: hookEnv });
  assert(recovered.stdout === `${logText}\n`, "stored Codex raw output did not round-trip through cat");

  // Exercise the packaged CLI at both fail-open thresholds: compaction itself
  // is optional above 1 MiB, while stdin is drained above 16 MiB so Tokenjuice
  // exits cleanly instead of failing on oversized hook input.
  const oversizedResponse = await invoke(postToolUsePayload("bin/rails test", "x".repeat(1024 * 1024 + 1)));
  assert(oversizedResponse.code === 0, `expected oversized Codex hook exit 0, got ${oversizedResponse.code}`);
  assert(oversizedResponse.stdout === "", "expected oversized Codex hook stdout to stay empty");
  assert(oversizedResponse.stderr === "", `expected oversized Codex hook stderr to stay empty, got ${oversizedResponse.stderr}`);

  const overInputLimit = await invoke(postToolUsePayload("bin/rails test", "x".repeat(16 * 1024 * 1024)));
  assert(overInputLimit.code === 0, `expected over-limit Codex hook exit 0, got ${overInputLimit.code}`);
  assert(overInputLimit.stdout === "", "expected over-limit Codex hook stdout to stay empty");
  assert(overInputLimit.stderr === "", `expected over-limit Codex hook stderr to stay empty, got ${overInputLimit.stderr}`);

  return {
    doctor: report.status,
    exitCodes: {
      compacted: hook.code,
      oversizedResponse: oversizedResponse.code,
      overInputLimit: overInputLimit.code,
    },
  };
}

// Read the on-disk command rather than reproducing the installer's launcher.
async function readInstalledHook(path, event) {
  const config = JSON.parse(await readFile(path, "utf8"));
  const hooks = (config.hooks[event] ?? []).flatMap((entry) => entry.hooks ?? [entry]);
  assert(hooks.length === 1, `expected one installed ${event} command in ${path}`);
  assert(typeof hooks[0].command === "string", `missing installed command in ${path}`);
  return hooks[0].command;
}

const preToolHosts = [
  { host: "droid", dir: ".factory", file: "settings.json", envKey: "FACTORY_HOME", tool: "Execute" },
  { host: "claude-code", dir: ".claude", file: "settings.json", envKey: "CLAUDE_CONFIG_DIR" },
  { host: "codebuddy", dir: ".codebuddy", file: "settings.json", envKey: "CODEBUDDY_CONFIG_DIR" },
  { host: "cursor", dir: ".cursor", file: "hooks.json", envKey: "CURSOR_HOME", event: "preToolUse", tool: "Shell" },
  { host: "vscode-copilot", dir: ".copilot/hooks", file: "tokenjuice-vscode.json", tool: "run_in_terminal" },
];

async function runPreToolContracts(spec) {
  const home = join(tempRoot, spec.host);
  const configDir = join(home, spec.dir);
  const env = { HOME: home, ...(spec.envKey ? { [spec.envKey]: configDir } : {}) };
  await mkdir(home, { recursive: true });
  const cli = (args) => run(process.execPath, [distCliPath, ...args], { cwd: home, env });
  await cli(["install", spec.host, "--local"]);
  await cli(["install", spec.host, "--local"]);
  const doctor = JSON.parse((await cli(["doctor", spec.host, "--local", "--format", "json"])).stdout);
  assert(doctor.status === "ok", `${spec.host}: doctor failed: ${JSON.stringify(doctor)}`);
  const configPath = join(configDir, spec.file);
  const installed = await readInstalledHook(configPath, spec.event ?? "PreToolUse");
  const invoke = (input) => run("/bin/sh", ["-c", installed], { cwd: home, env, input });
  const payload = (command) => {
    const value = JSON.parse(preToolUsePayload(command, { shell: "/bin/bash", description: "contract fixture", timeout: 120000 }));
    value.tool_name = spec.tool ?? "Bash";
    return JSON.stringify(value);
  };
  const rewrite = async (command) => {
    const hook = await invoke(payload(command));
    assert(hook.stderr === "", `${spec.host}: unexpected hook stderr: ${hook.stderr}`);
    const output = JSON.parse(hook.stdout);
    if (spec.host === "droid") {
      assert(output.hookSpecificOutput?.hookEventName === "PreToolUse", "droid: wrong hook event");
      assert(output.hookSpecificOutput?.permissionDecision === undefined, "droid: wrapper changed permission policy");
    }
    const updated = spec.host === "cursor" ? output.updated_input : output.hookSpecificOutput?.updatedInput;
    assert(updated?.description === "contract fixture" && updated.timeout === 120000, `${spec.host}: lost input fields`);
    assert(typeof updated.command === "string" && updated.command !== command, `${spec.host}: missing rewrite`);
    return updated.command;
  };
  const execute = (command, ok = [0]) => run("/bin/bash", ["-c", command], { cwd: home, env, ok });

  await mkdir(join(home, "files space"));
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(home, "files space", `example-${i}.json`), "{}\n")));
  const listing = "find 'files space' -type f";
  const raw = await execute(listing);
  const rewritten = await rewrite(listing);
  const compacted = await execute(rewritten);
  assert(compacted.stdout.length < raw.stdout.length, `${spec.host}: listing was not compacted`);
  assert(compacted.stdout.includes("80 matches"), `${spec.host}: listing lost match count`);
  assert(compacted.stdout.includes("files space/example-"), `${spec.host}: listing lost paths`);

  // The output resembles a reducible inventory, but an exact file read must stay byte-for-byte raw.
  const exact = `${raw.stdout}quote: ' " $ \`\n\n`;
  for (const text of [exact, exact.trimEnd(), "", "\r\n"]) {
    await writeFile(join(home, "exact content.txt"), text);
    const exactResult = await execute(await rewrite("cat 'exact content.txt'"));
    assert(exactResult.stdout === text && exactResult.stderr === "", `${spec.host}: exact read changed (${text.length} chars)`);
  }

  const failureStdout = Array.from({ length: 80 }, (_, index) => `failure-${index}`).join("\n") + "\n";
  const failure = `"${process.execPath}" -e 'process.stdout.write(${JSON.stringify(failureStdout)}); process.stderr.write("err" + String.fromCharCode(10)); process.exit(7)'`;
  const failed = await execute(await rewrite(failure), [7]);
  assert(failed.stdout === failureStdout, `${spec.host}: failed stdout changed`);
  assert(failed.stderr === "err\n", `${spec.host}: failed stderr changed`);

  const secondPass = await invoke(payload(rewritten));
  assert(secondPass.stderr === "", `${spec.host}: second pass wrote stderr`);
  assert(secondPass.stdout === "" || !JSON.parse(secondPass.stdout).hookSpecificOutput, `${spec.host}: double wrap`);
  if (spec.host === "cursor") assert(!secondPass.stdout, "cursor: double wrap");
  for (const input of ["{broken", "null", "[]", "true", "42"]) {
    const malformed = await invoke(input);
    assert(malformed.stderr === "" && (malformed.stdout === "" || malformed.stdout.trim() === "{}"), `${spec.host}: non-object input ${input} did not fail open`);
  }
  const explicit = await invoke(payload("'/opt/my tools/tokenjuice' wrap --raw -- git status"));
  assert(explicit.stderr === "" && (explicit.stdout === "" || explicit.stdout.trim() === "{}"), `${spec.host}: absolute raw wrapper was wrapped again`);

  if (spec.host === "droid") {
    const rawBypass = await invoke(payload(`"${process.execPath}" "${distCliPath}" wrap --raw -- ${listing}`));
    assert(rawBypass.stdout.trim() === "{}" && rawBypass.stderr === "", "droid: explicit raw bypass was wrapped again");
  }

  await cli(["uninstall", spec.host]);
  const removed = JSON.parse(await readFile(configPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "{}";
    throw error;
  }));
  const remaining = (removed.hooks?.[spec.event ?? "PreToolUse"] ?? []).flatMap((entry) => entry.hooks ?? [entry]);
  assert(!remaining.some((entry) => entry.command === installed), `${spec.host}: uninstall left the hook command`);
  return { doctor: doctor.status, listing: "compacted", exactRead: "preserved", failureExit: failed.code };
}

async function runQoderContracts() {
  const home = join(tempRoot, "qoder-cli");
  const settingsPath = join(home, ".qoder", "settings.json");
  await mkdir(dirname(settingsPath), { recursive: true });
  const foreign = { matcher: "Read", hooks: [{ type: "command", command: "printf preserved", async: false }] };
  await writeFile(settingsPath, JSON.stringify({ editor: { theme: "preserved" }, hooks: { PostToolUse: [foreign] } }));
  const env = { HOME: home, USERPROFILE: home };
  const cli = (args) => run(process.execPath, [distCliPath, ...args], { cwd: home, env });
  await cli(["install", "qoder-cli", "--local"]);
  const first = await readFile(settingsPath, "utf8");
  await cli(["install", "qoder-cli", "--local"]);
  assert(await readFile(settingsPath, "utf8") === first, "qoder-cli: reinstall changed settings");
  const doctor = JSON.parse((await cli(["doctor", "qoder-cli", "--local", "--format", "json"])).stdout);
  assert(doctor.status === "ok", `qoder-cli: doctor failed: ${JSON.stringify(doctor)}`);
  const groups = JSON.parse(first).hooks.PostToolUse;
  const hook = groups.find((group) => group.matcher === "Bash")?.hooks?.[0];
  assert(hook?.async === false && hook.timeout === 10, "qoder-cli: replacement hook must be synchronous and bounded");
  assert(typeof hook.command === "string", "qoder-cli: installed command missing");
  const invoke = async (payload) => {
    const output = await run("/bin/sh", ["-c", hook.command], { cwd: home, env, input: payload });
    assert(output.stderr === "", `qoder-cli: unexpected hook stderr: ${output.stderr}`);
    return JSON.parse(output.stdout);
  };
  const stdout = ["On branch main", "Changes not staged for commit:",
    ...Array.from({ length: 40 }, (_, i) => `\tmodified:   src/file-${i}.ts`), "no changes added to commit"].join("\n");
  const response = { stdout, stderr: "warning retained\n", exitCode: 0, extra: { preserved: true } };
  const payload = (command, toolResponse = response) => JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash",
    cwd: home, tool_input: { command }, tool_response: toolResponse });
  const replacement = (await invoke(payload("git status"))).hookSpecificOutput;
  assert(replacement?.hookEventName === "PostToolUse", "qoder-cli: wrong replacement event");
  assert(typeof replacement.updatedToolOutput === "string", "qoder-cli: replacement must be a serialized response string");
  const updated = JSON.parse(replacement.updatedToolOutput);
  assert(updated.stdout.length < stdout.length && updated.stdout.includes("src/file-0.ts"), "qoder-cli: stdout not compacted");
  assert(updated.stderr === response.stderr && updated.exitCode === 0 && updated.extra.preserved === true, "qoder-cli: response envelope changed");
  for (const command of ["cat exact-file.txt", "tokenjuice wrap --raw -- git status",
    "env X=1 tokenjuice wrap --raw -- git status", `"${process.execPath}" "${distCliPath}" wrap --raw -- git status`]) {
    assert(Object.keys(await invoke(payload(command))).length === 0, `qoder-cli: exact/raw command changed: ${command}`);
  }
  for (const patch of [{ exitCode: 7 }, { interrupted: true }, { kind: "backgrounded", taskId: "task" }]) {
    assert(Object.keys(await invoke(payload("git status", { ...response, ...patch }))).length === 0, "qoder-cli: unsafe outcome changed");
  }
  for (const input of ["{broken", "null", "[]"]) {
    assert(Object.keys(await invoke(input)).length === 0, "qoder-cli: malformed input did not fail open");
  }
  await cli(["uninstall", "qoder-cli"]);
  const remaining = JSON.parse(await readFile(settingsPath, "utf8"));
  assert(JSON.stringify(remaining.hooks.PostToolUse) === JSON.stringify([foreign]), "qoder-cli: uninstall changed foreign hooks");
  assert(remaining.editor.theme === "preserved", "qoder-cli: uninstall changed other settings");
  return { doctor: doctor.status, stdout: "compacted", envelope: "preserved", unsafe: "unchanged" };
}

async function runOpenCodeV2Contracts() {
  const previousStats = process.env.TOKENJUICE_STATS;
  process.env.TOKENJUICE_STATS = "off";
  try {
    const home = join(tempRoot, "opencode-v2");
    const env = { HOME: home, OPENCODE_CONFIG_DIR: join(home, "config") };
    await mkdir(home, { recursive: true });
    const cli = (args) => run(process.execPath, [distCliPath, ...args], { cwd: home, env });
    const installed = JSON.parse((await cli(["install", "opencode-v2", "--format", "json"])).stdout);
    const doctor = JSON.parse((await cli(["doctor", "opencode-v2", "--format", "json"])).stdout);
    assert(doctor.status === "ok", `opencode-v2: doctor failed: ${JSON.stringify(doctor)}`);
    // This is the installed self-contained entrypoint, not a source-tree import.
    const plugin = (await import(pathToFileURL(installed.extensionPath).href)).default;
    assert(plugin.id === "tokenjuice", "opencode-v2: invalid default plugin definition");
    let listener;
    let disposed = false;
    const cleanup = await plugin.setup({ tool: { async hook(name, callback) {
      assert(name === "execute.after", "opencode-v2: wrong hook event");
      listener = callback;
      return { async dispose() { disposed = true; } };
    } } });
    assert(typeof listener === "function", "opencode-v2: hook was not registered");
    const stdout = ["On branch main", "Changes not staged for commit:",
      ...Array.from({ length: 40 }, (_, i) => `\tmodified:   src/file-${i}.ts`), "no changes added to commit"].join("\n");
    const fixture = (command = "git status", patch = {}) => ({ tool: "shell", status: "completed", input: { command },
      result: { output: { output: stdout, status: "completed", truncated: false, exit: 0, ...patch },
        content: [{ type: "text", text: stdout }], metadata: { preserved: true } } });
    const event = fixture();
    await listener(event);
    assert(event.result.output.output.length < stdout.length, "opencode-v2: installed bundle did not compact stdout");
    assert(event.result.content[0].text === event.result.output.output, "opencode-v2: projections diverged");
    assert(event.result.metadata.preserved === true, "opencode-v2: metadata changed");
    for (const input of [fixture("cat exact.txt"), fixture("tokenjuice wrap --raw -- git status"),
      fixture("git status", { exit: 7 }), fixture("git status", { status: "running", shellID: "background" })]) {
      const original = input.result;
      await listener(input);
      assert(input.result === original, "opencode-v2: exact/raw/failure/background result changed");
    }
    await cleanup();
    assert(disposed, "opencode-v2: cleanup did not dispose the registration");
    await cli(["uninstall", "opencode-v2"]);
    const disabled = JSON.parse((await cli(["doctor", "opencode-v2", "--format", "json"])).stdout);
    assert(disabled.status === "disabled", "opencode-v2: uninstall left the plugin active");
    return { doctor: doctor.status, bundle: "loaded", projections: "coherent", rawAndFailure: "preserved" };
  } finally {
    if (previousStats === undefined) delete process.env.TOKENJUICE_STATS;
    else process.env.TOKENJUICE_STATS = previousStats;
  }
}

try {
  assert(process.platform !== "win32", "hook contracts require POSIX shells; run on Linux, macOS, or WSL");
  await assertFile(distCliPath, "run `pnpm build` first");
  const results = { codex: await runCodexContracts(), "qoder-cli": await runQoderContracts(), "opencode-v2": await runOpenCodeV2Contracts() };
  for (const spec of preToolHosts) results[spec.host] = await runPreToolContracts(spec);
  process.stdout.write(`${JSON.stringify({ ok: true, level: "installed-hook-contract", results }, null, 2)}\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
