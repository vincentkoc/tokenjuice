#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { stdin as inputStdin } from "node:process";
import { fileURLToPath } from "node:url";
import packageJson from "../../package.json" with { type: "json" };

import { getArtifact, listArtifactMetadata, listArtifactMetadataPage, listArtifacts } from "../core/artifacts.js";
import { shouldRecordStats } from "../core/artifacts.js";
import { buildAnalysisEntry, discoverCandidates, doctorArtifacts, statsArtifacts } from "../core/analysis.js";
import type { StatsSourceReport } from "../core/analysis.js";
import { verifyBuiltinFixtures } from "../core/fixtures.js";
import { readNoOmissionFromEnv } from "../core/env.js";
import { parseReduceJsonRequest } from "../core/json-protocol.js";
import { WRAP_AUTHORITATIVE_FOOTER } from "../core/compaction-metadata.js";
import { reduceExecution } from "../core/reduce.js";
import { verifyRules } from "../core/rules.js";
import { UNKNOWN_ARTIFACT_SOURCE } from "../core/source.js";
import { runWrappedCommand } from "../core/wrap.js";
import type { WrapResult } from "../types.js";
import { runClaudeCodePostToolUseHook, runClaudeCodePreToolUseHook } from "../hosts/claude-code/index.js";
import { runClinePostToolUseHook } from "../hosts/cline/index.js";
import { runCodeBuddyPreToolUseHook } from "../hosts/codebuddy/index.js";
import { runCommandCodePostToolUseHook } from "../hosts/command-code/index.js";
import { runCodexPostToolUseHook } from "../hosts/codex/index.js";
import { runCopilotAgentPostToolUseHook } from "../hosts/copilot-agent/index.js";
import { runCopilotCliPostToolUseHook } from "../hosts/copilot-cli/index.js";
import { runCursorPreToolUseHook } from "../hosts/cursor/index.js";
import { runDevinPreToolUseHook } from "../hosts/devin/index.js";
import { runDroidPostToolUseHook } from "../hosts/droid/index.js";
import { runGeminiCliAfterToolHook } from "../hosts/gemini-cli/index.js";
import { runGrokCliPostToolUseHook } from "../hosts/grok-cli/index.js";
import { runKimiPostToolUseHook } from "../hosts/kimi/index.js";
import { runMuxPostToolUseHook } from "../hosts/mux/index.js";
import { runOpenHandsPostToolUseHook } from "../hosts/openhands/index.js";
import { runQwenCodePostToolUseHook } from "../hosts/qwen-code/index.js";
import { runVscodeCopilotPreToolUseHook } from "../hosts/vscode-copilot/index.js";
import type { Format, ParsedArgs } from "./command-types.js";
import { installCommands } from "./install-commands.js";
import { uninstallCommands } from "./uninstall-commands.js";
import { doctorCommands } from "./doctor-commands.js";

const VERSION = packageJson.version;
const DEFAULT_MAX_INPUT_BYTES = 16 * 1024 * 1024;
const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function printUsage(): void {
  process.stderr.write(
    [
      "usage:",
      "  tokenjuice --help",
      "  tokenjuice --version",
      "  tokenjuice reduce [file] [--format text|json] [--classifier <id>] [--store] [--raw|--full] [--no-omit] [--no-stats]",
      "  tokenjuice reduce-json [file]",
      "  tokenjuice wrap [--raw|--full] [--no-omit] [--no-stats] [--source <name>] -- <command> [args...] [--tee] [--store] [--max-capture-bytes <n>]",
      "  tokenjuice <command> ... [--trace]",
      "  tokenjuice install adal",
      "  tokenjuice install aether",
      "  tokenjuice install aictl",
      "  tokenjuice install ai-memory-protocol",
      "  tokenjuice install aider",
      "  tokenjuice install agent-layer",
      "  tokenjuice install agentinit",
      "  tokenjuice install agentlink",
      "  tokenjuice install agentloom",
      "  tokenjuice install agents-cli",
      "  tokenjuice install agents-md",
      "  tokenjuice install agentsge",
      "  tokenjuice install agentsmesh",
      "  tokenjuice install amazon-q",
      "  tokenjuice install amp",
      "  tokenjuice install antigravity",
      "  tokenjuice install anywhere-agents",
      "  tokenjuice install augment",
      "  tokenjuice install avante",
      "  tokenjuice install baz",
      "  tokenjuice install bito",
      "  tokenjuice install blackbox",
      "  tokenjuice install blocks",
      "  tokenjuice install clawdbot",
      "  tokenjuice install bob",
      "  tokenjuice install builder",
      "  tokenjuice install charlie",
      "  tokenjuice install codex [--local] [--no-omit]",
      "  tokenjuice install claude-code [--local]",
      "  tokenjuice install cline [--local]",
      "  tokenjuice install codeant",
      "  tokenjuice install codebuff",
      "  tokenjuice install codegen",
      "  tokenjuice install coder-agents",
      "  tokenjuice install coderabbit",
      "  tokenjuice install codebuddy [--local]",
      "  tokenjuice install command-code [--local]",
      "  tokenjuice install continue",
      "  tokenjuice install copilot-agent [--local]",
      "  tokenjuice install crush",
      "  tokenjuice install cursor [--local]",
      "  tokenjuice install deepagents",
      "  tokenjuice install devin [--local]",
      "  tokenjuice install dot-agents",
      "  tokenjuice install docker-agent",
      "  tokenjuice install droid [--local]",
      "  tokenjuice install eca",
      "  tokenjuice install elyra",
      "  tokenjuice install firebase-studio",
      "  tokenjuice install forgecode",
      "  tokenjuice install gemini-cli [--local]",
      "  tokenjuice install gitlab-duo",
      "  tokenjuice install goose",
      "  tokenjuice install greptile",
      "  tokenjuice install grok-build",
      "  tokenjuice install grok-bot",
      "  tokenjuice install grok-cli [--local]",
      "  tokenjuice install gptme",
      "  tokenjuice install jean2",
      "  tokenjuice install jetbrains-ai",
      "  tokenjuice install junie",
      "  tokenjuice install jules",
      "  tokenjuice install leanctl",
      "  tokenjuice install kimi [--local]",
      "  tokenjuice install kiro",
      "  tokenjuice install kilo",
      "  tokenjuice install localcode",
      "  tokenjuice install mcp-agent",
      "  tokenjuice install mini-swe-agent",
      "  tokenjuice install swe-agent",
      "  tokenjuice install stagewise",
      "  tokenjuice install mistral-vibe",
      "  tokenjuice install mux [--local]",
      "  tokenjuice install novakit",
      "  tokenjuice install knowns",
      "  tokenjuice install ona",
      "  tokenjuice install openhands [--local]",
      "  tokenjuice install open-interpreter",
      "  tokenjuice install openwebui",
      "  tokenjuice install pi [--local] [--skip-command <name>]",
      "  tokenjuice install pi-go",
      "  tokenjuice install plandex",
      "  tokenjuice install qodo",
      "  tokenjuice install qoder",
      "  tokenjuice install replit",
      "  tokenjuice install opencode [--local]",
      "  tokenjuice install qwen-code [--local]",
      "  tokenjuice install roo",
      "  tokenjuice install rovo",
      "  tokenjuice install ruler",
      "  tokenjuice install tabby",
      "  tokenjuice install tabnine",
      "  tokenjuice install trae",
      "  tokenjuice install uipath",
      "  tokenjuice install vscode-copilot [--local]",
      "  tokenjuice install warp",
      "  tokenjuice install copilot-cli [--local]",
      "  tokenjuice install windsurf",
      "  tokenjuice install zed",
      "  tokenjuice install zencoder",
      "  tokenjuice uninstall adal",
      "  tokenjuice uninstall aether",
      "  tokenjuice uninstall aictl",
      "  tokenjuice uninstall ai-memory-protocol",
      "  tokenjuice uninstall aider",
      "  tokenjuice uninstall agent-layer",
      "  tokenjuice uninstall agentinit",
      "  tokenjuice uninstall agentlink",
      "  tokenjuice uninstall agentloom",
      "  tokenjuice uninstall agents-cli",
      "  tokenjuice uninstall agents-md",
      "  tokenjuice uninstall agentsge",
      "  tokenjuice uninstall agentsmesh",
      "  tokenjuice uninstall amazon-q",
      "  tokenjuice uninstall amp",
      "  tokenjuice uninstall antigravity",
      "  tokenjuice uninstall anywhere-agents",
      "  tokenjuice uninstall augment",
      "  tokenjuice uninstall avante",
      "  tokenjuice uninstall baz",
      "  tokenjuice uninstall bito",
      "  tokenjuice uninstall blackbox",
      "  tokenjuice uninstall blocks",
      "  tokenjuice uninstall clawdbot",
      "  tokenjuice uninstall bob",
      "  tokenjuice uninstall builder",
      "  tokenjuice uninstall charlie",
      "  tokenjuice uninstall codex",
      "  tokenjuice uninstall claude-code",
      "  tokenjuice uninstall cline",
      "  tokenjuice uninstall codeant",
      "  tokenjuice uninstall codebuff",
      "  tokenjuice uninstall codegen",
      "  tokenjuice uninstall coder-agents",
      "  tokenjuice uninstall coderabbit",
      "  tokenjuice uninstall codebuddy",
      "  tokenjuice uninstall command-code",
      "  tokenjuice uninstall continue",
      "  tokenjuice uninstall copilot-agent",
      "  tokenjuice uninstall crush",
      "  tokenjuice uninstall cursor",
      "  tokenjuice uninstall deepagents",
      "  tokenjuice uninstall devin",
      "  tokenjuice uninstall dot-agents",
      "  tokenjuice uninstall docker-agent",
      "  tokenjuice uninstall droid",
      "  tokenjuice uninstall eca",
      "  tokenjuice uninstall elyra",
      "  tokenjuice uninstall firebase-studio",
      "  tokenjuice uninstall forgecode",
      "  tokenjuice uninstall gemini-cli",
      "  tokenjuice uninstall gitlab-duo",
      "  tokenjuice uninstall goose",
      "  tokenjuice uninstall greptile",
      "  tokenjuice uninstall grok-build",
      "  tokenjuice uninstall grok-bot",
      "  tokenjuice uninstall grok-cli",
      "  tokenjuice uninstall gptme",
      "  tokenjuice uninstall jean2",
      "  tokenjuice uninstall jetbrains-ai",
      "  tokenjuice uninstall junie",
      "  tokenjuice uninstall jules",
      "  tokenjuice uninstall leanctl",
      "  tokenjuice uninstall knowns",
      "  tokenjuice uninstall kimi",
      "  tokenjuice uninstall kiro",
      "  tokenjuice uninstall kilo",
      "  tokenjuice uninstall localcode",
      "  tokenjuice uninstall mcp-agent",
      "  tokenjuice uninstall mini-swe-agent",
      "  tokenjuice uninstall swe-agent",
      "  tokenjuice uninstall stagewise",
      "  tokenjuice uninstall mistral-vibe",
      "  tokenjuice uninstall mux",
      "  tokenjuice uninstall novakit",
      "  tokenjuice uninstall ona",
      "  tokenjuice uninstall openhands",
      "  tokenjuice uninstall open-interpreter",
      "  tokenjuice uninstall openwebui",
      "  tokenjuice uninstall pi",
      "  tokenjuice uninstall pi-go",
      "  tokenjuice uninstall opencode",
      "  tokenjuice uninstall plandex",
      "  tokenjuice uninstall qodo",
      "  tokenjuice uninstall qoder",
      "  tokenjuice uninstall replit",
      "  tokenjuice uninstall qwen-code",
      "  tokenjuice uninstall roo",
      "  tokenjuice uninstall rovo",
      "  tokenjuice uninstall ruler",
      "  tokenjuice uninstall tabby",
      "  tokenjuice uninstall tabnine",
      "  tokenjuice uninstall trae",
      "  tokenjuice uninstall uipath",
      "  tokenjuice uninstall vscode-copilot",
      "  tokenjuice uninstall warp",
      "  tokenjuice uninstall copilot-cli",
      "  tokenjuice uninstall windsurf",
      "  tokenjuice uninstall zed",
      "  tokenjuice uninstall zencoder",
      "  tokenjuice ls",
      "  tokenjuice cat <artifact-id>",
      "  tokenjuice verify [--fixtures]",
      "  tokenjuice discover [file] [--source-command <cmd>] [--tool-name <name>] [--exit-code <n>] [--source <name>] [--by-source]",
      "  tokenjuice doctor [file|hooks|adal|aether|aictl|ai-memory-protocol|aider|agent-layer|agentinit|agentlink|agentloom|agents-cli|agents-md|agentsge|agentsmesh|amazon-q|amp|antigravity|anywhere-agents|augment|avante|baz|bito|blackbox|blocks|clawdbot|bob|builder|charlie|codex|claude-code|cline|codeant|codebuff|codegen|coder-agents|coderabbit|codebuddy|command-code|continue|copilot-agent|crush|cursor|deepagents|devin|dot-agents|docker-agent|droid|eca|elyra|firebase-studio|forgecode|gemini-cli|gitlab-duo|goose|greptile|grok-build|grok-bot|grok-cli|gptme|jean2|jetbrains-ai|junie|jules|leanctl|kimi|kiro|kilo|localcode|mcp-agent|mini-swe-agent|swe-agent|stagewise|mistral-vibe|mux|novakit|knowns|ona|openhands|open-interpreter|openwebui|pi|pi-go|opencode|plandex|qodo|qoder|qwen-code|replit|roo|rovo|ruler|tabby|tabnine|trae|uipath|vscode-copilot|warp|windsurf|zed|zencoder|copilot-cli] [--local] [--print-instructions] [--source-command <cmd>] [--tool-name <name>] [--exit-code <n>]",
      "  tokenjuice doctor codex [--local] [--no-omit]",
      "  tokenjuice stats [--timezone local|utc|<iana-timezone>] [--source <name>] [--by-source] [--limit <n>] [--cursor <cursor>]",
    ].join("\n"),
  );
  process.stderr.write("\n");
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0];
  const positionals: string[] = [];
  const passthrough: string[] = [];
  let format: Format = "text";
  let local = false;
  let classifier: string | undefined;
  let fixtures = false;
  let sourceCommand: string | undefined;
  let toolName: string | undefined;
  let exitCode: number | undefined;
  let store = false;
  let noStats = false;
  let tee = false;
  let raw = false;
  let noOmit = false;
  let allowOmit = false;
  let storeDir: string | undefined;
  let maxInlineChars: number | undefined;
  let maxCaptureBytes: number | undefined;
  let maxInputBytes: number | undefined;
  let timeZone: string | undefined;
  let source: string | undefined;
  let bySource = false;
  let limit: number | undefined;
  let cursor: string | undefined;
  let wrapLauncher: string | undefined;
  let trace = false;
  let printInstructions = false;
  const skipCommandNames: string[] = [];

  let index = 1;
  while (index < argv.length) {
    const current = argv[index]!;
    if (current === "--") {
      passthrough.push(...argv.slice(index + 1));
      break;
    }

    if (!current.startsWith("--")) {
      positionals.push(current);
      index += 1;
      continue;
    }

    const next = argv[index + 1];
    switch (current) {
      case "--format":
        if (next !== "text" && next !== "json") {
          throw new Error("--format must be text or json");
        }
        format = next;
        index += 2;
        break;
      case "--classifier":
        if (!next) {
          throw new Error("--classifier requires a value");
        }
        classifier = next;
        index += 2;
        break;
      case "--local":
        local = true;
        index += 1;
        break;
      case "--fixtures":
        fixtures = true;
        index += 1;
        break;
      case "--source-command":
        if (!next) {
          throw new Error("--source-command requires a value");
        }
        sourceCommand = next;
        index += 2;
        break;
      case "--tool-name":
        if (!next) {
          throw new Error("--tool-name requires a value");
        }
        toolName = next;
        index += 2;
        break;
      case "--exit-code":
        if (!next || !Number.isInteger(Number(next))) {
          throw new Error("--exit-code requires an integer");
        }
        exitCode = Number(next);
        index += 2;
        break;
      case "--store":
        store = true;
        index += 1;
        break;
      case "--no-stats":
        noStats = true;
        index += 1;
        break;
      case "--raw":
      case "--full":
        raw = true;
        index += 1;
        break;
      case "--no-omit":
        noOmit = true;
        index += 1;
        break;
      case "--allow-omit":
        allowOmit = true;
        index += 1;
        break;
      case "--tee":
        tee = true;
        index += 1;
        break;
      case "--store-dir":
        if (!next) {
          throw new Error("--store-dir requires a value");
        }
        storeDir = next;
        index += 2;
        break;
      case "--max-inline-chars":
        if (!next || !Number.isInteger(Number(next)) || Number(next) <= 0) {
          throw new Error("--max-inline-chars requires a positive integer");
        }
        maxInlineChars = Number(next);
        index += 2;
        break;
      case "--max-capture-bytes":
        if (!next || !Number.isInteger(Number(next)) || Number(next) <= 0) {
          throw new Error("--max-capture-bytes requires a positive integer");
        }
        maxCaptureBytes = Number(next);
        index += 2;
        break;
      case "--max-input-bytes":
        if (!next || !Number.isInteger(Number(next)) || Number(next) <= 0) {
          throw new Error("--max-input-bytes requires a positive integer");
        }
        maxInputBytes = Number(next);
        index += 2;
        break;
      case "--timezone":
        if (!next) {
          throw new Error("--timezone requires a value");
        }
        timeZone = next;
        index += 2;
        break;
      case "--source":
        if (!next) {
          throw new Error("--source requires a value");
        }
        source = next;
        index += 2;
        break;
      case "--by-source":
        bySource = true;
        index += 1;
        break;
      case "--limit":
        if (!next || !Number.isInteger(Number(next)) || Number(next) <= 0) {
          throw new Error("--limit requires a positive integer");
        }
        limit = Number(next);
        index += 2;
        break;
      case "--cursor":
        if (!next) {
          throw new Error("--cursor requires a value");
        }
        cursor = next;
        index += 2;
        break;
      case "--wrap-launcher":
        if (!next) {
          throw new Error("--wrap-launcher requires a value");
        }
        wrapLauncher = next;
        index += 2;
        break;
      case "--trace":
        trace = true;
        index += 1;
        break;
      case "--print-instructions":
        printInstructions = true;
        index += 1;
        break;
      case "--skip-command":
        if (!next?.trim() || /\s/u.test(next)) {
          throw new Error("--skip-command requires one command name");
        }
        skipCommandNames.push(next);
        index += 2;
        break;
      default:
        throw new Error(`unknown flag: ${current}`);
    }
  }

  if (noOmit && allowOmit) {
    throw new Error("--no-omit and --allow-omit cannot be used together");
  }
  if (allowOmit && (command === "install" || command === "doctor")) {
    throw new Error("--allow-omit is not supported for install or doctor; Codex hooks honor the configured omission policy");
  }

  return {
    command,
    format,
    local,
    classifier,
    fixtures,
    sourceCommand,
    toolName,
    exitCode,
    store,
    noStats,
    tee,
    raw,
    noOmit,
    allowOmit,
    storeDir,
    maxInlineChars,
    maxCaptureBytes,
    maxInputBytes,
    timeZone,
    source,
    bySource,
    limit,
    cursor,
    wrapLauncher,
    trace,
    printInstructions,
    skipCommandNames,
    positionals,
    passthrough,
  };
}

async function readStdin(maxBytes = DEFAULT_MAX_INPUT_BYTES): Promise<string> {
  if (inputStdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of inputStdin) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw new Error(`stdin exceeds max input size of ${maxBytes} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readStdinForCodexHook(maxBytes = DEFAULT_MAX_INPUT_BYTES): Promise<string | undefined> {
  if (inputStdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let exceededLimit = false;
  for await (const chunk of inputStdin) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      exceededLimit = true;
      continue;
    }
    chunks.push(buffer);
  }

  // Drain stdin so Tokenjuice exits cleanly instead of failing on oversized hook input.
  return exceededLimit ? undefined : Buffer.concat(chunks).toString("utf8");
}

async function readTextInput(file: string | undefined, maxBytes = DEFAULT_MAX_INPUT_BYTES): Promise<string> {
  if (!file) {
    return await readStdin(maxBytes);
  }

  const details = await stat(file);
  if (details.size > maxBytes) {
    throw new Error(`${file} exceeds max input size of ${maxBytes} bytes`);
  }

  return await readFile(file, "utf8");
}

function emit(format: Format, value: unknown, text: string, exactText = false): void {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  process.stdout.write(exactText ? text : `${text}\n`);
}

async function runReduce(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0];
  const rawText = await readTextInput(file, args.maxInputBytes);
  const noOmit = resolveNoOmit(args.noOmit);
  const result = await reduceExecution(
    {
      toolName: "exec",
      command: file ? `reduce:${file}` : "stdin",
      combinedText: rawText,
      exitCode: 0,
      ...(args.source ? { metadata: { source: args.source } } : {}),
    },
    {
      ...(args.classifier ? { classifier: args.classifier } : {}),
      ...(args.raw ? { raw: true } : {}),
      ...(noOmit ? { noOmit: true } : {}),
      ...(args.trace ? { trace: true } : {}),
      recordStats: !args.noStats && shouldRecordStats(),
      ...(args.store ? { store: true } : {}),
      ...(args.storeDir ? { storeDir: args.storeDir } : {}),
      ...(typeof args.maxInlineChars === "number" ? { maxInlineChars: args.maxInlineChars } : {}),
    },
  );
  emit(args.format, result, result.inlineText, args.raw);
  return 0;
}

async function runReduceJson(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0];
  const rawText = await readTextInput(file, args.maxInputBytes);
  const noOmit = resolveNoOmit(args.noOmit);
  if (!rawText.trim()) {
    throw new Error("reduce-json requires JSON input from stdin or a file");
  }

  const request = parseReduceJsonRequest(JSON.parse(rawText) as unknown);
  const requestInput = args.source
    ? {
        ...request.input,
        metadata: {
          ...request.input.metadata,
          source: args.source,
        },
      }
    : request.input;
  const result = await reduceExecution(requestInput, {
    ...request.options,
    ...(args.classifier ? { classifier: args.classifier } : {}),
    ...(args.raw ? { raw: true } : {}),
    ...(noOmit ? { noOmit: true } : {}),
    ...(args.trace ? { trace: true } : {}),
    recordStats: !args.noStats && shouldRecordStats(),
    ...(args.store ? { store: true } : {}),
    ...(args.storeDir ? { storeDir: args.storeDir } : {}),
    ...(typeof args.maxInlineChars === "number" ? { maxInlineChars: args.maxInlineChars } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

async function runWrap(args: ParsedArgs): Promise<number> {
  const noOmit = resolveNoOmit(args.noOmit);
  const wrapped = await runWrappedCommand(args.passthrough, {
    tee: args.tee,
    ...(args.raw ? { raw: true } : {}),
    ...(noOmit ? { noOmit: true } : {}),
    ...(args.trace ? { trace: true } : {}),
    recordStats: !args.noStats && shouldRecordStats(),
    ...(args.store ? { store: true } : {}),
    ...(args.storeDir ? { storeDir: args.storeDir } : {}),
    ...(typeof args.maxInlineChars === "number" ? { maxInlineChars: args.maxInlineChars } : {}),
    ...(typeof args.maxCaptureBytes === "number" ? { maxCaptureBytes: args.maxCaptureBytes } : {}),
    ...(args.source ? { source: args.source } : {}),
  });
  const inlineText = decorateWrapInlineText(wrapped.result, args.raw);
  // Passthrough output already has the command's exact line endings.
  const exactText = args.raw || (wrapped.stderr.length === 0 && inlineText === wrapped.stdout);
  emit(args.format, wrapped, inlineText, exactText);
  return wrapped.exitCode;
}

export function resolveNoOmit(noOmitFlag: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  return noOmitFlag || readNoOmissionFromEnv(env);
}

export function decorateWrapInlineText(result: WrapResult["result"], raw: boolean): string {
  const { rawChars, reducedChars } = result.stats;
  if (raw || !result.compaction?.authoritative || reducedChars === 0 || reducedChars >= rawChars) {
    return result.inlineText;
  }
  const footer = [
    "",
    "---",
    WRAP_AUTHORITATIVE_FOOTER,
    ...(result.rawRef?.id ? [`Raw output is available locally: tokenjuice cat ${result.rawRef.id}`] : []),
  ].join("\n");
  return `${result.inlineText}${footer}`;
}

async function runInstall(args: ParsedArgs): Promise<number> {
  const target = args.positionals[0];
  if (target !== undefined) {
    const handler = installCommands.get(target);
    if (handler) {
      return await handler(args, target);
    }
  }

  throw new Error("install currently supports: adal, aether, aictl, ai-memory-protocol, aider, agent-layer, agentinit, agentlink, agentloom, agents-cli, agents-md, agentsge, agentsmesh, amazon-q, amp, antigravity, anywhere-agents, augment, avante, baz, bito, blackbox, blocks, clawdbot, bob, builder, charlie, codex, claude-code, cline, codeant, codebuff, codegen, coder-agents, coderabbit, codebuddy, command-code, continue, copilot-agent, crush, cursor, deepagents, devin, dot-agents, docker-agent, droid, eca, elyra, firebase-studio, forgecode, gemini-cli, gitlab-duo, goose, greptile, grok-build, grok-bot, grok-cli, gptme, jean2, jetbrains-ai, junie, jules, leanctl, kimi, kiro, kilo, knowns, localcode, mcp-agent, mini-swe-agent, swe-agent, stagewise, mistral-vibe, mux, novakit, ona, openhands, open-interpreter, openwebui, pi, pi-go, opencode, plandex, qodo, qoder, replit, qwen-code, roo, rovo, ruler, tabby, tabnine, trae, uipath, vscode-copilot, warp, windsurf, copilot-cli, zed, zencoder");
}

async function runUninstall(args: ParsedArgs): Promise<number> {
  const target = args.positionals[0];
  if (target !== undefined) {
    const handler = uninstallCommands.get(target);
    if (handler) {
      return await handler(args, target);
    }
  }

  throw new Error("uninstall currently supports: adal, aether, aictl, ai-memory-protocol, aider, agent-layer, agentinit, agentlink, agentloom, agents-cli, agents-md, agentsge, agentsmesh, amazon-q, amp, antigravity, anywhere-agents, augment, avante, baz, bito, blackbox, blocks, clawdbot, bob, builder, charlie, codex, claude-code, cline, codeant, codebuff, codegen, coder-agents, coderabbit, codebuddy, command-code, continue, copilot-agent, crush, cursor, deepagents, devin, dot-agents, docker-agent, droid, eca, elyra, firebase-studio, forgecode, gitlab-duo, gemini-cli, goose, greptile, grok-build, grok-bot, grok-cli, gptme, jean2, jetbrains-ai, junie, jules, leanctl, kimi, kiro, kilo, knowns, localcode, mcp-agent, mini-swe-agent, swe-agent, stagewise, mistral-vibe, mux, novakit, ona, openhands, open-interpreter, openwebui, pi, pi-go, opencode, plandex, qodo, qoder, replit, qwen-code, roo, rovo, ruler, tabby, tabnine, trae, uipath, vscode-copilot, warp, windsurf, copilot-cli, zed, zencoder");
}

async function runList(args: ParsedArgs): Promise<number> {
  const refs = await listArtifacts(args.storeDir);
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(refs, null, 2)}\n`);
    return 0;
  }

  for (const ref of refs) {
    process.stdout.write(`${ref.id}\t${ref.path}\n`);
  }
  return 0;
}

async function runCat(args: ParsedArgs): Promise<number> {
  const id = args.positionals[0];
  if (!id) {
    throw new Error("cat requires an artifact id");
  }
  const artifact = await getArtifact(id, args.storeDir);
  if (!artifact) {
    throw new Error(`artifact not found: ${id}`);
  }

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(artifact.rawText);
  if (!artifact.rawText.endsWith("\n")) {
    process.stdout.write("\n");
  }
  return 0;
}

async function runVerify(args: ParsedArgs): Promise<number> {
  const results = await verifyRules();
  const failed = results.filter((result) => !result.ok);
  const warned = results.filter((result) => result.warnings.length > 0);
  const fixtureResults = args.fixtures ? await verifyBuiltinFixtures() : [];
  const failedFixtures = fixtureResults.filter((result) => !result.ok);

  if (args.format === "json") {
    process.stdout.write(
      `${JSON.stringify(args.fixtures ? { rules: results, fixtures: fixtureResults } : results, null, 2)}\n`,
    );
    return failed.length === 0 && failedFixtures.length === 0 ? 0 : 1;
  }

  if (failed.length === 0 && failedFixtures.length === 0) {
    for (const result of warned) {
      process.stderr.write(`warn:${result.source}:${result.id}\n`);
      for (const warning of result.warnings) {
        process.stderr.write(`- ${warning}\n`);
      }
    }
    process.stdout.write(
      `ok: ${results.length} rules validated${warned.length > 0 ? `, ${warned.length} warnings` : ""}${args.fixtures ? `, ${fixtureResults.length} fixtures verified` : ""}\n`,
    );
    return 0;
  }

  for (const result of failed) {
    process.stderr.write(`${result.source}:${result.id}\n`);
    for (const error of result.errors) {
      process.stderr.write(`- ${error}\n`);
    }
  }
  for (const result of failedFixtures) {
    process.stderr.write(`fixture:${result.ruleId}:${result.id}\n`);
    for (const error of result.errors) {
      process.stderr.write(`- ${error}\n`);
    }
  }
  return 1;
}

async function loadDirectAnalysisEntry(args: ParsedArgs) {
  const file = args.positionals[0];
  const hasPipedInput = !inputStdin.isTTY;
  if (!file && !hasPipedInput) {
    return null;
  }

  const rawText = await readTextInput(file, args.maxInputBytes);
  if (!file && rawText.length === 0) {
    return null;
  }
  const input = {
    toolName: args.toolName ?? "exec",
    command: args.sourceCommand ?? (file ? `analyze:${file}` : "stdin"),
    combinedText: rawText,
    exitCode: args.exitCode ?? 0,
    ...(args.source ? { metadata: { source: args.source } } : {}),
  } as const;
  const result = await reduceExecution(input, {
    ...(args.classifier ? { classifier: args.classifier } : {}),
    ...(typeof args.maxInlineChars === "number" ? { maxInlineChars: args.maxInlineChars } : {}),
  });

  return {
    input,
    result,
    entry: buildAnalysisEntry(input, result),
  };
}

function formatRatio(ratio: number | null): string {
  if (ratio === null) {
    return "n/a";
  }
  return `${Math.round(ratio * 100)}%`;
}

function formatMetric(value: number): string {
  if (Math.abs(value) < 1000) {
    return String(value);
  }

  return compactNumberFormatter
    .format(value)
    .replace(/([KMBT])$/u, (suffix) => suffix.toLowerCase());
}

export function formatStatsSources(sources: StatsSourceReport[]): string {
  if (sources.length === 0) {
    return "";
  }

  const orderedSources = [...sources].sort((left, right) =>
    right.totals.observedRawChars - left.totals.observedRawChars
    || left.source.localeCompare(right.source)
  );
  const lines = ["sources:"];

  for (const source of orderedSources) {
    const observedRaw = source.totals.captureTruncatedEntries > 0
      ? ` observedRaw=${formatMetric(source.totals.observedRawChars)}`
      : "";
    lines.push(
      `source ${source.source}: entries=${formatMetric(source.totals.entries)} raw=${formatMetric(source.totals.rawChars)}${observedRaw} reduced=${formatMetric(source.totals.reducedChars)} saved=${formatMetric(source.totals.savedChars)} avgRatio=${formatRatio(source.totals.avgRatio)}`,
    );
    if (source.reducers.length > 0) {
      lines.push(
        `  reducers: ${source.reducers.slice(0, 3).map((reducer) => `${reducer.reducer}(${formatMetric(reducer.count)})`).join(", ")}`,
      );
    }
    if (source.commands.length > 0) {
      lines.push(
        `  commands: ${source.commands.slice(0, 3).map((command) => `${command.signature}(${formatMetric(command.count)})`).join(", ")}`,
      );
    }
  }

  if (orderedSources.some((source) => source.source === UNKNOWN_ARTIFACT_SOURCE)) {
    lines.push("note: source unknown means stored artifacts have missing or invalid source metadata.");
  }

  return `${lines.join("\n")}\n`;
}

async function runDiscover(args: ParsedArgs): Promise<number> {
  const direct = await loadDirectAnalysisEntry(args);
  const entries = direct ? [direct.entry] : await listArtifactMetadata(args.storeDir);
  const candidates = discoverCandidates(entries, {
    ...(args.source ? { source: args.source } : {}),
    ...(args.bySource ? { bySource: true } : {}),
  });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(direct ? { result: direct.result, candidates } : candidates, null, 2)}\n`);
    return 0;
  }

  if (direct) {
    process.stdout.write(`classification: ${direct.result.classification.matchedReducer ?? "generic/fallback"}\n`);
    process.stdout.write(`ratio: ${formatRatio(direct.result.stats.ratio)}\n`);
  }

  if (candidates.length === 0) {
    process.stdout.write("no discover candidates found\n");
    return 0;
  }

  for (const candidate of candidates) {
    process.stdout.write(
      [
        candidate.kind,
        candidate.source ? `source=${candidate.source}` : null,
        candidate.signature,
        `count=${formatMetric(candidate.count)}`,
        `raw=${formatMetric(candidate.totalRawChars)}`,
        `avgRatio=${formatRatio(candidate.avgRatio)}`,
        `sample="${candidate.sampleCommand}"`,
        candidate.matchedReducer ? `reducer=${candidate.matchedReducer}` : null,
      ].filter(Boolean).join(" "),
    );
    process.stdout.write("\n");
  }
  return 0;
}

async function runDoctor(args: ParsedArgs): Promise<number> {
  const target = args.positionals[0];
  if (target !== undefined) {
    const handler = doctorCommands.get(target);
    if (handler) {
      return await handler(args, target);
    }
  }

  const direct = await loadDirectAnalysisEntry(args);
  const entries = direct ? [direct.entry] : await listArtifactMetadata(args.storeDir);
  const report = doctorArtifacts(entries);

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(direct ? { result: direct.result, report } : report, null, 2)}\n`);
    return 0;
  }

  if (direct) {
    process.stdout.write(`classification: ${direct.result.classification.matchedReducer ?? "generic/fallback"}\n`);
  }
  process.stdout.write(`entries: ${formatMetric(report.totals.entries)}\n`);
  process.stdout.write(`generic artifacts: ${formatMetric(report.totals.genericArtifacts)}\n`);
  process.stdout.write(`weak artifacts: ${formatMetric(report.totals.weakArtifacts)}\n`);
  process.stdout.write(`avg ratio: ${formatRatio(report.totals.avgRatio)}\n`);
  process.stdout.write(`health: ${report.health}\n`);
  if (report.alerts.length > 0) {
    process.stdout.write("alerts:\n");
    for (const alert of report.alerts) {
      process.stdout.write(`- ${alert}\n`);
    }
  }

  if (report.topMissingCommands.length > 0) {
    process.stdout.write("missing-rule candidates:\n");
    for (const candidate of report.topMissingCommands.slice(0, 5)) {
      process.stdout.write(`- ${candidate.signature} count=${formatMetric(candidate.count)} raw=${formatMetric(candidate.totalRawChars)}\n`);
    }
  }

  if (report.topWeakReducers.length > 0) {
    process.stdout.write("weak-rule candidates:\n");
    for (const candidate of report.topWeakReducers.slice(0, 5)) {
      process.stdout.write(
        `- ${candidate.signature} reducer=${candidate.matchedReducer ?? "n/a"} count=${formatMetric(candidate.count)} avgRatio=${formatRatio(candidate.avgRatio)}\n`,
      );
    }
  }

  if (report.topReducers.length > 0) {
    process.stdout.write("top reducers:\n");
    for (const reducer of report.topReducers.slice(0, 5)) {
      process.stdout.write(`- ${reducer.reducer} count=${formatMetric(reducer.count)}\n`);
    }
  }

  return 0;
}

async function runStats(args: ParsedArgs): Promise<number> {
  const page = await listArtifactMetadataPage(args.storeDir, {
    ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
    ...(args.cursor ? { cursor: args.cursor } : {}),
  });
  const report = statsArtifacts(page.entries, {
    timeZone: args.timeZone ?? "local",
    ...(args.source ? { source: args.source } : {}),
    ...(args.bySource ? { bySource: true } : {}),
  });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify({
      ...report,
      coverage: {
        source: "bounded-metadata-segments",
        legacySidecarsIncluded: page.legacySidecarsIncluded,
        partial: page.partial,
        nextCursor: page.nextCursor ?? null,
      },
    }, null, 2)}\n`);
    return 0;
  }

  process.stdout.write("coverage: bounded metadata segments; legacy sidecars excluded\n");
  if (page.partial) {
    process.stdout.write("partial: yes\n");
    if (page.nextCursor) {
      process.stdout.write(`next cursor: ${page.nextCursor}\n`);
    }
  } else {
    process.stdout.write("partial: no\n");
  }
  process.stdout.write(`entries: ${formatMetric(report.totals.entries)}\n`);
  process.stdout.write(`capture-truncated entries: ${formatMetric(report.totals.captureTruncatedEntries)}\n`);
  process.stdout.write(`observed entries: ${formatMetric(report.totals.observedEntries)}\n`);
  process.stdout.write(`raw chars: ${formatMetric(report.totals.rawChars)}\n`);
  process.stdout.write(`reduced chars: ${formatMetric(report.totals.reducedChars)}\n`);
  process.stdout.write(`saved chars: ${formatMetric(report.totals.savedChars)}\n`);
  process.stdout.write(`avg ratio: ${formatRatio(report.totals.avgRatio)}\n`);
  process.stdout.write(`savings: ${formatRatio(report.totals.savingsPercent)}\n`);

  if (report.reducers.length > 0) {
    process.stdout.write("top reducers:\n");
    for (const reducer of report.reducers.slice(0, 5)) {
      process.stdout.write(
        `- ${reducer.reducer} count=${formatMetric(reducer.count)} saved=${formatMetric(reducer.savedChars)} avgRatio=${formatRatio(reducer.avgRatio)}\n`,
      );
    }
  }

  if (report.commands.length > 0) {
    process.stdout.write("top commands:\n");
    for (const command of report.commands.slice(0, 5)) {
      process.stdout.write(
        `- ${command.signature} count=${formatMetric(command.count)} saved=${formatMetric(command.savedChars)} avgRatio=${formatRatio(command.avgRatio)}\n`,
      );
    }
  }

  if (report.daily.length > 0) {
    process.stdout.write("daily:\n");
    for (const day of report.daily.slice(-5)) {
      process.stdout.write(`- ${day.day} count=${formatMetric(day.count)} saved=${formatMetric(day.savedChars)}\n`);
    }
  }

  if (report.sources && report.sources.length > 0) {
    process.stdout.write(formatStatsSources(report.sources));
  }

  return 0;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  switch (args.command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printUsage();
      return 0;
    case "version":
    case "--version":
    case "-v":
      process.stdout.write(`${VERSION}\n`);
      return 0;
    case "reduce":
      return await runReduce(args);
    case "reduce-json":
      return await runReduceJson(args);
    case "wrap":
      return await runWrap(args);
    case "install":
      return await runInstall(args);
    case "uninstall":
      return await runUninstall(args);
    case "ls":
      return await runList(args);
    case "cat":
      return await runCat(args);
    case "verify":
      return await runVerify(args);
    case "discover":
      return await runDiscover(args);
    case "doctor":
      return await runDoctor(args);
    case "stats":
      return await runStats(args);
    case "codex-post-tool-use":
      {
        const hookInput = await readStdinForCodexHook(args.maxInputBytes);
        if (hookInput === undefined) {
          return 0;
        }
        return await runCodexPostToolUseHook(
          hookInput,
          { noOmit: args.noOmit, allowOmit: args.allowOmit },
        );
      }
    case "claude-code-pre-tool-use":
      return await runClaudeCodePreToolUseHook(await readStdin(args.maxInputBytes), args.wrapLauncher);
    case "claude-code-post-tool-use":
      return await runClaudeCodePostToolUseHook(await readStdin(args.maxInputBytes));
    case "cline-post-tool-use":
      return await runClinePostToolUseHook(await readStdin(args.maxInputBytes));
    case "codebuddy-pre-tool-use":
      return await runCodeBuddyPreToolUseHook(await readStdin(args.maxInputBytes), args.wrapLauncher);
    case "command-code-post-tool-use":
      return await runCommandCodePostToolUseHook(await readStdin(args.maxInputBytes));
    case "cursor-pre-tool-use":
      return await runCursorPreToolUseHook(await readStdin(args.maxInputBytes), args.wrapLauncher);
    case "devin-pre-tool-use":
      return await runDevinPreToolUseHook(await readStdin(args.maxInputBytes), args.wrapLauncher);
    case "gemini-cli-after-tool":
      return await runGeminiCliAfterToolHook(await readStdin(args.maxInputBytes));
    case "grok-cli-post-tool-use":
      return await runGrokCliPostToolUseHook(await readStdin(args.maxInputBytes));
    case "kimi-post-tool-use":
      return await runKimiPostToolUseHook(await readStdin(args.maxInputBytes));
    case "mux-post-tool-use":
      return await runMuxPostToolUseHook();
    case "openhands-post-tool-use":
      return await runOpenHandsPostToolUseHook(await readStdin(args.maxInputBytes));
    case "qwen-code-post-tool-use":
      return await runQwenCodePostToolUseHook(await readStdin(args.maxInputBytes));
    case "vscode-copilot-pre-tool-use":
      return await runVscodeCopilotPreToolUseHook(await readStdin(args.maxInputBytes), args.wrapLauncher);
    case "copilot-agent-post-tool-use":
      return await runCopilotAgentPostToolUseHook(await readStdin(args.maxInputBytes));
    case "copilot-cli-post-tool-use":
      return await runCopilotCliPostToolUseHook(await readStdin(args.maxInputBytes));
    case "droid-post-tool-use":
      return await runDroidPostToolUseHook(await readStdin(args.maxInputBytes));
    default:
      printUsage();
      return 1;
  }
}

export async function isDirectModuleEntrypoint(moduleUrl: string | URL, argv = process.argv): Promise<boolean> {
  const entrypoint = argv[1];
  if (!entrypoint) {
    return false;
  }

  const [moduleStat, entrypointStat] = await Promise.allSettled([
    stat(fileURLToPath(moduleUrl)),
    stat(resolve(entrypoint)),
  ]);
  if (moduleStat.status !== "fulfilled" || entrypointStat.status !== "fulfilled") {
    return false;
  }

  return moduleStat.value.dev === entrypointStat.value.dev && moduleStat.value.ino === entrypointStat.value.ino;
}

async function runCliIfEntrypoint(): Promise<void> {
  if (!(await isDirectModuleEntrypoint(import.meta.url))) {
    return;
  }

  try {
    process.exitCode = await main();
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

void runCliIfEntrypoint();
