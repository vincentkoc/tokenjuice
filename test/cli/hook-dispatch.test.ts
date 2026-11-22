import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HOOK_DISPATCH_COMMANDS } from "./helpers/host-targets.js";
import { runDist } from "./helpers/run-dist.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalCodexHome = process.env.CODEX_HOME;
const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
const originalCursorHome = process.env.CURSOR_HOME;

afterEach(async () => {
  process.env.HOME = originalHome;
  if (originalCodexHome === undefined) {
    delete process.env.CODEX_HOME;
  } else {
    process.env.CODEX_HOME = originalCodexHome;
  }
  if (originalClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
  }
  if (originalCursorHome === undefined) {
    delete process.env.CURSOR_HOME;
  } else {
    process.env.CURSOR_HOME = originalCursorHome;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const CODEX_PAYLOAD = JSON.stringify({
  hook_event_name: "PostToolUse",
  tool_name: "Bash",
  tool_input: { command: "echo hi" },
  tool_response: "hi\n",
});

const CLAUDE_PRE_PAYLOAD = JSON.stringify({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "echo hi" },
});

const CLAUDE_POST_PAYLOAD = JSON.stringify({
  hook_event_name: "PostToolUse",
  tool_name: "Bash",
  tool_input: { command: "echo hi" },
  tool_response: { stdout: "hi\n", stderr: "", interrupted: false, isImage: false },
});

const CURSOR_PRE_PAYLOAD = JSON.stringify({
  tool_name: "Shell",
  command: "echo hi",
});

function payloadFor(command: string): string {
  switch (command) {
    case "codex-post-tool-use":
      return CODEX_PAYLOAD;
    case "claude-code-pre-tool-use":
    case "codebuddy-pre-tool-use":
    case "devin-pre-tool-use":
    case "vscode-copilot-pre-tool-use":
      return CLAUDE_PRE_PAYLOAD;
    case "claude-code-post-tool-use":
    case "cline-post-tool-use":
    case "command-code-post-tool-use":
    case "grok-cli-post-tool-use":
    case "kimi-post-tool-use":
    case "openhands-post-tool-use":
    case "qwen-code-post-tool-use":
    case "copilot-agent-post-tool-use":
    case "copilot-cli-post-tool-use":
    case "droid-post-tool-use":
      return CLAUDE_POST_PAYLOAD;
    case "cursor-pre-tool-use":
      return CURSOR_PRE_PAYLOAD;
    case "gemini-cli-after-tool":
      return JSON.stringify({
        tool_name: "run_shell_command",
        tool_input: { command: "echo hi" },
        tool_response: "hi\n",
      });
    case "mux-post-tool-use":
      return "";
    default:
      return "{}";
  }
}

function argvFor(command: string): string[] {
  if (command.endsWith("pre-tool-use")) {
    return [command, "--wrap-launcher", "tokenjuice"];
  }
  return [command];
}

const EXPECTED_HOOK_OUTPUT: Record<string, { stdout: string; stderr: string }> = {
  "codex-post-tool-use": { stdout: "", stderr: "" },
  "claude-code-pre-tool-use": {
    stdout:
      '{"hookSpecificOutput":{"hookEventName":"PreToolUse","updatedInput":{"command":"tokenjuice wrap --keep-failures --source claude-code --min-reduce-chars 16384 -- /bin/bash -lc \'echo hi\'"}}}\n',
    stderr: "",
  },
  "claude-code-post-tool-use": {
    stdout: "",
    stderr: "",
  },
  "cline-post-tool-use": {
    stdout: '{"cancel":false,"contextModification":"","errorMessage":""}\n',
    stderr: "",
  },
  "codebuddy-pre-tool-use": {
    stdout:
      '{"hookSpecificOutput":{"hookEventName":"PreToolUse","updatedInput":{"command":"tokenjuice wrap --keep-failures --source codebuddy -- /bin/bash -lc \'echo hi\'"}}}\n',
    stderr: "",
  },
  "command-code-post-tool-use": { stdout: "{}\n", stderr: "" },
  "cursor-pre-tool-use": { stdout: "", stderr: "" },
  "devin-pre-tool-use": { stdout: "", stderr: "" },
  "gemini-cli-after-tool": { stdout: "{}\n", stderr: "" },
  "grok-cli-post-tool-use": { stdout: "{}\n", stderr: "" },
  "kimi-post-tool-use": { stdout: "", stderr: "" },
  "mux-post-tool-use": { stdout: "", stderr: "" },
  "openhands-post-tool-use": { stdout: "{}\n", stderr: "" },
  "qwen-code-post-tool-use": { stdout: "{}\n", stderr: "" },
  "vscode-copilot-pre-tool-use": { stdout: "{}\n", stderr: "" },
  "copilot-agent-post-tool-use": { stdout: "{}\n", stderr: "" },
  "copilot-cli-post-tool-use": { stdout: "{}\n", stderr: "" },
  "droid-post-tool-use": { stdout: "{}\n", stderr: "" },
};

describe("host hook argv dispatch", () => {
  it.each(HOOK_DISPATCH_COMMANDS)("routes stdin to $command", async ({ command }) => {
    const home = await createTempDir("tokenjuice-hook-dispatch-");
    process.env.HOME = home;
    process.env.CODEX_HOME = home;
    process.env.CLAUDE_CONFIG_DIR = home;
    process.env.CURSOR_HOME = home;

    const result = await runDist(argvFor(command), payloadFor(command));
    const expected = EXPECTED_HOOK_OUTPUT[command]!;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(expected.stdout);
    expect(result.stderr).toBe(expected.stderr);
  });
});
