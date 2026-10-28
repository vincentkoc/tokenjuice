import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Characterization tests for the per-host install, uninstall, and doctor
// commands. Each target runs in its own throwaway HOME and project directory,
// and the full transcript (exit codes, stdout, stderr) is pinned by snapshot so
// that refactors of the CLI dispatch cannot silently change behavior. Several
// host modules resolve their config paths when they are imported, so the CLI
// is re-imported after the sandbox environment is in place.

const HOST_TARGETS = [
  "adal",
  "aether",
  "agent-init",
  "agent-layer",
  "agentinit",
  "agentlink",
  "agentloom",
  "agents-cli",
  "agents-md",
  "agentsge",
  "agentsmd",
  "agentsmesh",
  "ai-memory-protocol",
  "aictl",
  "aider",
  "aimemoryprotocol",
  "amazon-q",
  "amp",
  "antigravity",
  "anywhere-agents",
  "augment",
  "avante",
  "baz",
  "bito",
  "blackbox",
  "blocks",
  "bob",
  "builder",
  "cagent",
  "charlie",
  "claude-code",
  "clawdbot",
  "cline",
  "codeant",
  "codebuddy",
  "codebuff",
  "codegen",
  "coder-agents",
  "coderabbit",
  "coderagents",
  "codex",
  "command-code",
  "commandcode",
  "continue",
  "copilot-agent",
  "copilot-cli",
  "crush",
  "cursor",
  "deepagents",
  "devin",
  "docker-agent",
  "dockeragent",
  "dot-agents",
  "droid",
  "eca",
  "elyra",
  "firebase-studio",
  "forge-code",
  "forgecode",
  "gemini-cli",
  "gitlab-duo",
  "goose",
  "gptme",
  "greptile",
  "grok-bot",
  "grok-build",
  "grok-cli",
  "grokbot",
  "jean2",
  "jetbrains-ai",
  "jules",
  "junie",
  "kilo",
  "kimi",
  "kiro",
  "knowns",
  "leanctl",
  "local-code",
  "localcode",
  "mcp-agent",
  "mcpagent",
  "mini-swe-agent",
  "mini-sweagent",
  "mistral-vibe",
  "mistralvibe",
  "mux",
  "novakit",
  "ona",
  "open-interpreter",
  "opencode",
  "openhands",
  "openinterpreter",
  "openwebui",
  "pi",
  "pi-go",
  "pigo",
  "plandex",
  "qoder",
  "qodo",
  "qwen-code",
  "replit",
  "replit-agent",
  "roo",
  "rovo",
  "rovo-dev",
  "ruler",
  "stagewise",
  "swe-agent",
  "sweagent",
  "tabby",
  "tabnine",
  "trae",
  "uipath",
  "vscode-copilot",
  "warp",
  "windsurf",
  "zed",
  "zencoder",
] as const;

const PATH_ENV_KEYS = ["HOME", "USERPROFILE", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "APPDATA", "LOCALAPPDATA"];

let savedEnv: NodeJS.ProcessEnv;
let savedCwd: string;
const sandboxes: string[] = [];

beforeAll(() => {
  savedEnv = { ...process.env };
  savedCwd = process.cwd();
});

afterAll(async () => {
  process.chdir(savedCwd);
  replaceEnv(savedEnv);
  await Promise.all(sandboxes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// Mutate process.env in place: assigning a new object would detach it from the
// real environment that os.homedir() and child processes read.
function replaceEnv(next: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in next)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, next);
}

async function enterSandbox(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-host-cli-")));
  sandboxes.push(root);
  const home = join(root, "home");
  const project = join(root, "project");
  const bin = join(root, "bin");
  await Promise.all([mkdir(home), mkdir(project), mkdir(bin)]);

  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(savedEnv)) {
    if (key.startsWith("TOKENJUICE_") || key.endsWith("_PROJECT_DIR") || key.endsWith("_HOME") || key.startsWith("XDG_")) {
      continue;
    }
    env[key] = value;
  }
  for (const key of PATH_ENV_KEYS) {
    env[key] = home;
  }
  env.XDG_CONFIG_HOME = join(home, ".config");
  env.XDG_DATA_HOME = join(home, ".local", "share");
  env.XDG_STATE_HOME = join(home, ".local", "state");
  env.XDG_CACHE_HOME = join(home, ".cache");
  env.PATH = bin;
  env.SHELL = "/bin/sh";
  env.TOKENJUICE_ARTIFACT_DIR = join(root, "artifacts");
  replaceEnv(env);
  process.chdir(project);
  return root;
}

function normalize(text: string, root: string): string {
  const launcher = process.argv[1] ?? "<no-launcher>";
  return text
    .split(root).join("<SANDBOX>")
    .split(launcher).join("<LAUNCHER>")
    .split(process.execPath).join("<NODE>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}[-:]\d{2}[-:]\d{2}(?:[.-]\d{3})?Z?/g, "<TIMESTAMP>")
    .replace(/\b\d{13}\b/g, "<EPOCH_MS>");
}

type Main = (argv: string[]) => Promise<number>;

async function loadMain(): Promise<Main> {
  vi.resetModules();
  const module = await import("../../src/cli/main.js");
  return module.main;
}

async function run(main: Main, argv: string[], root: string): Promise<string> {
  const chunks: string[] = [];
  const capture = (stream: "stdout" | "stderr") => (chunk: string | Uint8Array) => {
    chunks.push(`[${stream}] ${typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")}`);
    return true;
  };
  const out = vi.spyOn(process.stdout, "write").mockImplementation(capture("stdout") as typeof process.stdout.write);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(capture("stderr") as typeof process.stderr.write);
  let status: string;
  try {
    status = `exit ${await main(argv)}`;
  } catch (error: unknown) {
    status = `throws ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
  return normalize(`$ tokenjuice ${argv.join(" ")}\n${chunks.join("")}${status}\n`, root);
}

async function transcript(target: string): Promise<string> {
  const root = await enterSandbox();
  const main = await loadMain();
  const steps = [
    ["doctor", target],
    ["install", target],
    ["doctor", target],
    ["doctor", target, "--format", "json"],
    ["install", target, "--format", "json"],
    ["uninstall", target],
    ["uninstall", target, "--format", "json"],
    ["doctor", target],
  ];
  const parts: string[] = [];
  for (const argv of steps) {
    parts.push(await run(main, argv, root));
  }
  return parts.join("\n");
}

// Host config locations are platform-specific, so the pinned transcripts are
// Linux-only (CI runs on ubuntu-latest).
describe.skipIf(process.platform !== "linux")("host CLI commands", () => {
  it.each(HOST_TARGETS)("install, doctor, and uninstall %s", async (target) => {
    expect(await transcript(target)).toMatchSnapshot();
  });

  it("rejects unknown or missing targets", async () => {
    const root = await enterSandbox();
    const main = await loadMain();
    const parts: string[] = [];
    for (const command of ["install", "uninstall"]) {
      parts.push(await run(main, [command, "not-a-host"], root));
      parts.push(await run(main, [command], root));
    }
    // doctor treats an unknown positional as an artifact file to analyze.
    parts.push(await run(main, ["doctor", "not-a-host"], root));
    expect(parts.join("\n")).toMatchSnapshot();
  });

  it("reports hook health across hosts", async () => {
    const root = await enterSandbox();
    const main = await loadMain();
    expect(await run(main, ["doctor", "hooks"], root)).toMatchSnapshot();
  });
});
