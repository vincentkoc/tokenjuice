#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { stdin as inputStdin } from "node:process";
import packageJson from "../../package.json" with { type: "json" };

import { getArtifact, listArtifactMetadata, listArtifacts } from "../core/artifacts.js";
import { buildAnalysisEntry, discoverCandidates, doctorArtifacts, statsArtifacts } from "../core/analysis.js";
import { verifyBuiltinFixtures } from "../core/fixtures.js";
import { parseReduceJsonRequest } from "../core/json-protocol.js";
import { reduceExecution } from "../core/reduce.js";
import { verifyRules } from "../core/rules.js";
import { runWrappedCommand } from "../core/wrap.js";
import type { WrapResult } from "../types.js";
import { doctorAiderConvention, installAiderConvention, uninstallAiderConvention } from "../hosts/aider/index.js";
import { doctorAvanteInstructions, installAvanteInstructions, uninstallAvanteInstructions } from "../hosts/avante/index.js";
import { doctorClaudeCodeHook, installClaudeCodeHook, runClaudeCodePostToolUseHook } from "../hosts/claude-code/index.js";
import { doctorClineHook, installClineHook, runClinePostToolUseHook, uninstallClineHook } from "../hosts/cline/index.js";
import { doctorCodeBuddyHook, installCodeBuddyHook, runCodeBuddyPreToolUseHook } from "../hosts/codebuddy/index.js";
import { doctorContinueRule, installContinueRule, uninstallContinueRule } from "../hosts/continue/index.js";
import { doctorCodexHook, installCodexHook, runCodexPostToolUseHook, uninstallCodexHook } from "../hosts/codex/index.js";
import {
  doctorCopilotCliHook,
  getCopilotCliInstructionsSnippet,
  installCopilotCliHook,
  runCopilotCliPostToolUseHook,
  uninstallCopilotCliHook,
} from "../hosts/copilot-cli/index.js";
import { doctorCursorHook, installCursorHook, runCursorPreToolUseHook } from "../hosts/cursor/index.js";
import { doctorDroidHook, installDroidHook, runDroidPostToolUseHook, uninstallDroidHook } from "../hosts/droid/index.js";
import { doctorGeminiCliHook, installGeminiCliHook, runGeminiCliAfterToolHook, uninstallGeminiCliHook } from "../hosts/gemini-cli/index.js";
import { doctorJunieInstructions, installJunieInstructions, uninstallJunieInstructions } from "../hosts/junie/index.js";
import {
  doctorOpenCodeExtension,
  installOpenCodeExtension,
  uninstallOpenCodeExtension,
} from "../hosts/opencode/index.js";
import { doctorOpenHandsHook, installOpenHandsHook, runOpenHandsPostToolUseHook, uninstallOpenHandsHook } from "../hosts/openhands/index.js";
import { doctorPiExtension, installPiExtension } from "../hosts/pi/index.js";
import {
  doctorVscodeCopilotHook,
  getVscodeCopilotInstructionsSnippet,
  installVscodeCopilotHook,
  runVscodeCopilotPreToolUseHook,
  uninstallVscodeCopilotHook,
} from "../hosts/vscode-copilot/index.js";
import { doctorZedInstructions, installZedInstructions, uninstallZedInstructions } from "../hosts/zed/index.js";
import { doctorInstalledHooks } from "../hosts/shared/hook-doctor.js";
import { formatInstallSuccess } from "./install-output.js";

type Format = "text" | "json";

type ParsedArgs = {
  command: string | undefined;
  format: Format;
  local: boolean;
  classifier: string | undefined;
  fixtures: boolean;
  sourceCommand: string | undefined;
  toolName: string | undefined;
  exitCode: number | undefined;
  store: boolean;
  tee: boolean;
  raw: boolean;
  storeDir: string | undefined;
  maxInlineChars: number | undefined;
  maxCaptureBytes: number | undefined;
  maxInputBytes: number | undefined;
  timeZone: string | undefined;
  source: string | undefined;
  bySource: boolean;
  wrapLauncher: string | undefined;
  trace: boolean;
  printInstructions: boolean;
  positionals: string[];
  passthrough: string[];
};

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
      "  tokenjuice reduce [file] [--format text|json] [--classifier <id>] [--store] [--raw|--full]",
      "  tokenjuice reduce-json [file]",
      "  tokenjuice wrap [--raw|--full] [--source <name>] -- <command> [args...] [--tee] [--store] [--max-capture-bytes <n>]",
      "  tokenjuice <command> ... [--trace]",
      "  tokenjuice install aider",
      "  tokenjuice install avante",
      "  tokenjuice install codex [--local]",
      "  tokenjuice install claude-code [--local]",
      "  tokenjuice install cline [--local]",
      "  tokenjuice install codebuddy [--local]",
      "  tokenjuice install continue",
      "  tokenjuice install cursor [--local]",
      "  tokenjuice install droid [--local]",
      "  tokenjuice install gemini-cli [--local]",
      "  tokenjuice install junie",
      "  tokenjuice install openhands [--local]",
      "  tokenjuice install pi [--local]",
      "  tokenjuice install opencode [--local]",
      "  tokenjuice install vscode-copilot [--local]",
      "  tokenjuice install copilot-cli [--local]",
      "  tokenjuice install zed",
      "  tokenjuice uninstall aider",
      "  tokenjuice uninstall avante",
      "  tokenjuice uninstall codex",
      "  tokenjuice uninstall cline",
      "  tokenjuice uninstall continue",
      "  tokenjuice uninstall droid",
      "  tokenjuice uninstall gemini-cli",
      "  tokenjuice uninstall junie",
      "  tokenjuice uninstall openhands",
      "  tokenjuice uninstall opencode",
      "  tokenjuice uninstall vscode-copilot",
      "  tokenjuice uninstall copilot-cli",
      "  tokenjuice uninstall zed",
      "  tokenjuice ls",
      "  tokenjuice cat <artifact-id>",
      "  tokenjuice verify [--fixtures]",
      "  tokenjuice discover [file] [--source-command <cmd>] [--tool-name <name>] [--exit-code <n>] [--source <name>] [--by-source]",
      "  tokenjuice doctor [file|hooks|aider|avante|codex|claude-code|cline|codebuddy|continue|cursor|droid|gemini-cli|junie|openhands|pi|opencode|vscode-copilot|zed|copilot-cli] [--local] [--print-instructions] [--source-command <cmd>] [--tool-name <name>] [--exit-code <n>]",
      "  tokenjuice stats [--timezone local|utc|<iana-timezone>] [--source <name>] [--by-source]",
    ].join("\n"),
  );
  process.stderr.write("\n");
}

function parseArgs(argv: string[]): ParsedArgs {
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
  let tee = false;
  let raw = false;
  let storeDir: string | undefined;
  let maxInlineChars: number | undefined;
  let maxCaptureBytes: number | undefined;
  let maxInputBytes: number | undefined;
  let timeZone: string | undefined;
  let source: string | undefined;
  let bySource = false;
  let wrapLauncher: string | undefined;
  let trace = false;
  let printInstructions = false;

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
      case "--raw":
      case "--full":
        raw = true;
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
      default:
        throw new Error(`unknown flag: ${current}`);
    }
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
    tee,
    raw,
    storeDir,
    maxInlineChars,
    maxCaptureBytes,
    maxInputBytes,
    timeZone,
    source,
    bySource,
    wrapLauncher,
    trace,
    printInstructions,
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
      ...(args.trace ? { trace: true } : {}),
      recordStats: true,
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
    ...(args.trace ? { trace: true } : {}),
    recordStats: true,
    ...(args.store ? { store: true } : {}),
    ...(args.storeDir ? { storeDir: args.storeDir } : {}),
    ...(typeof args.maxInlineChars === "number" ? { maxInlineChars: args.maxInlineChars } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

async function runWrap(args: ParsedArgs): Promise<number> {
  const wrapped = await runWrappedCommand(args.passthrough, {
    tee: args.tee,
    ...(args.raw ? { raw: true } : {}),
    ...(args.trace ? { trace: true } : {}),
    recordStats: true,
    ...(args.store ? { store: true } : {}),
    ...(args.storeDir ? { storeDir: args.storeDir } : {}),
    ...(typeof args.maxInlineChars === "number" ? { maxInlineChars: args.maxInlineChars } : {}),
    ...(typeof args.maxCaptureBytes === "number" ? { maxCaptureBytes: args.maxCaptureBytes } : {}),
    ...(args.source ? { source: args.source } : {}),
  });
  const inlineText = decorateWrapInlineText(wrapped.result, args.raw);
  emit(args.format, wrapped, inlineText, args.raw);
  return wrapped.exitCode;
}

function decorateWrapInlineText(result: WrapResult["result"], raw: boolean): string {
  if (raw) {
    return result.inlineText;
  }
  const { rawChars, reducedChars } = result.stats;
  if (rawChars <= reducedChars || reducedChars === 0) {
    return result.inlineText;
  }
  const footer = [
    "",
    "---",
    "[tokenjuice] This is the complete, authoritative output for this command. It was deterministically compacted to remove low-signal noise; the omitted content is not retrievable. Do not re-run the command, vary flags, or switch tools to try to recover it. Proceed with the task using this output.",
  ].join("\n");
  return `${result.inlineText}${footer}`;
}

async function runInstall(args: ParsedArgs): Promise<number> {
  const target = args.positionals[0];
  if (target === "aider") {
    const result = await installAiderConvention();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Convention", value: result.conventionPath },
      { label: "Beta", value: "convention-based guidance; load it with aider --read CONVENTIONS.tokenjuice.md" },
      { label: "Verify", value: "tokenjuice doctor aider" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("aider", "convention", details));
    return 0;
  }

  if (target === "avante") {
    const result = await installAvanteInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Avante still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor avante" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("avante", "instructions", details));
    return 0;
  }

  if (target === "codex") {
    const result = await installCodexHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.hooksPath },
      { label: "Command", value: result.command },
    ];
    if (result.featureFlag.enabled) {
      details.push({ label: "Feature flag", value: `codex_hooks is enabled (${result.featureFlag.configPath})` });
    } else {
      const where = result.featureFlag.configExists
        ? `${result.featureFlag.configPath} (missing or disabled)`
        : `no ${result.featureFlag.configPath}`;
      details.push({ label: "Feature flag", value: `codex_hooks not enabled - ${where}` });
      details.push({ label: "Enable", value: result.featureFlag.fixHint });
    }
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    details.push({ label: "Verify", value: `tokenjuice doctor hooks${args.local ? " --local" : ""}` });
    details.push({ label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" });
    process.stdout.write(formatInstallSuccess("codex", "hook", details));
    return 0;
  }

  if (target === "claude-code") {
    const result = await installClaudeCodeHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.settingsPath },
      { label: "Command", value: result.command },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    details.push({ label: "Verify", value: `tokenjuice doctor hooks${args.local ? " --local" : ""}` });
    process.stdout.write(formatInstallSuccess("claude-code", "hook", details));
    return 0;
  }

  if (target === "cline") {
    const result = await installClineHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.hookPath },
      { label: "Command", value: result.command },
      { label: "Beta", value: "enable this PostToolUse hook in Cline's Hooks tab after install" },
      { label: "Verify", value: `tokenjuice doctor cline${args.local ? " --local" : ""}` },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    process.stdout.write(formatInstallSuccess("cline", "hook", details));
    return 0;
  }

  if (target === "codebuddy") {
    const result = await installCodeBuddyHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`installed codebuddy hook: ${result.settingsPath}\n`);
    process.stdout.write(`command: ${result.command}\n`);
    if (result.backupPath) {
      process.stdout.write(`backup: ${result.backupPath}\n`);
    }
    process.stdout.write(`doctor: tokenjuice doctor hooks${args.local ? " --local" : ""}\n`);
    return 0;
  }

  if (target === "continue") {
    const result = await installContinueRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "rule-based guidance; Continue still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor continue" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("continue", "rule", details));
    return 0;
  }

  if (target === "cursor") {
    const result = await installCursorHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.hooksPath },
      { label: "Command", value: result.command },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    details.push({ label: "Verify", value: `tokenjuice doctor hooks${args.local ? " --local" : ""}` });
    details.push({ label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" });
    process.stdout.write(formatInstallSuccess("cursor", "hook", details));
    return 0;
  }

  if (target === "gemini-cli") {
    const result = await installGeminiCliHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.settingsPath },
      { label: "Command", value: result.command },
      { label: "Beta", value: "AfterTool output replacement is new; verify with a noisy shell command" },
      { label: "Verify", value: `tokenjuice doctor gemini-cli${args.local ? " --local" : ""}` },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("gemini-cli", "hook", details));
    return 0;
  }

  if (target === "junie") {
    const result = await installJunieInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Junie still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor junie" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("junie", "instructions", details));
    return 0;
  }

  if (target === "openhands") {
    const result = await installOpenHandsHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.hooksPath },
      { label: "Command", value: result.command },
      { label: "Beta", value: "project-local PostToolUse hook; compacted context is injected alongside original output" },
      { label: "Verify", value: `tokenjuice doctor openhands${args.local ? " --local" : ""}` },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("openhands", "hook", details));
    return 0;
  }

  if (target === "pi") {
    const result = await installPiExtension(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Extension", value: result.extensionPath },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    details.push({ label: "Reload", value: "/reload" });
    details.push({ label: "Usage in pi", value: "/tj status | /tj on | /tj off | /tj raw-next" });
    process.stdout.write(formatInstallSuccess("pi", "extension", details));
    return 0;
  }

  if (target === "opencode") {
    const result = await installOpenCodeExtension(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Extension", value: result.extensionPath },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    details.push({ label: "Reload", value: "restart opencode (the plugin is auto-loaded on session start)" });
    details.push({ label: "Verify", value: "tokenjuice doctor opencode" });
    process.stdout.write(formatInstallSuccess("opencode", "extension", details));
    return 0;
  }

  if (target === "vscode-copilot") {
    const result = await installVscodeCopilotHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.hooksPath },
      { label: "Command", value: result.command },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    if (result.migratedFromPath) {
      details.push({ label: "Migrated", value: result.migratedFromPath });
    }
    details.push({ label: "Enable", value: "turn on chat.useHooks in VS Code settings and trust the workspace" });
    details.push({ label: "Guidance", value: "tokenjuice doctor vscode-copilot --print-instructions" });
    details.push({ label: "Verify", value: `tokenjuice doctor vscode-copilot${args.local ? " --local" : ""}` });
    details.push({ label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" });
    process.stdout.write(formatInstallSuccess("vscode-copilot", "hook", details));
    return 0;
  }

  if (target === "copilot-cli") {
    const result = await installCopilotCliHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.hooksPath },
      { label: "Command", value: result.command },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    details.push({ label: "Guidance", value: "tokenjuice doctor copilot-cli --print-instructions" });
    details.push({ label: "Verify", value: `tokenjuice doctor copilot-cli${args.local ? " --local" : ""}` });
    details.push({ label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" });
    process.stdout.write(formatInstallSuccess("copilot-cli", "hook", details));
    return 0;
  }

  if (target === "droid") {
    const result = await installDroidHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.settingsPath },
      { label: "Command", value: result.command },
      { label: "Beta", value: "Droid PostToolUse hook compacts Execute tool output" },
      { label: "Verify", value: `tokenjuice doctor droid${args.local ? " --local" : ""}` },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("droid", "hook", details));
    return 0;
  }

  if (target === "zed") {
    const result = await installZedInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rules", value: result.instructionsPath },
      { label: "Beta", value: "rule-based guidance; Zed still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor zed" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("zed", "rules", details));
    return 0;
  }

  throw new Error("install currently supports: aider, avante, codex, claude-code, cline, codebuddy, continue, cursor, droid, gemini-cli, junie, openhands, pi, opencode, vscode-copilot, copilot-cli, zed");
}

async function runUninstall(args: ParsedArgs): Promise<number> {
  const target = args.positionals[0];
  if (target === "aider") {
    const result = await uninstallAiderConvention();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed aider convention: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`convention path: ${result.conventionPath}\n`);
    process.stdout.write("enable: tokenjuice install aider\n");
    return 0;
  }

  if (target === "avante") {
    const result = await uninstallAvanteInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed avante instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install avante\n");
    return 0;
  }

  if (target === "codex") {
    const result = await uninstallCodexHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed codex hook: ${result.hooksPath}\n`);
    process.stdout.write(`removed entries: ${result.removed}\n`);
    if (result.backupPath) {
      process.stdout.write(`backup: ${result.backupPath}\n`);
    }
    process.stdout.write("enable: tokenjuice install codex\n");
    return 0;
  }

  if (target === "cline") {
    const result = await uninstallClineHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed cline hook: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`hook path: ${result.hookPath}\n`);
    process.stdout.write("enable: tokenjuice install cline\n");
    return 0;
  }

  if (target === "continue") {
    const result = await uninstallContinueRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed continue rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install continue\n");
    return 0;
  }

  if (target === "gemini-cli") {
    const result = await uninstallGeminiCliHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed gemini-cli entries: ${result.removed}\n`);
    process.stdout.write(`settings path: ${result.settingsPath}\n`);
    process.stdout.write("enable: tokenjuice install gemini-cli\n");
    return 0;
  }

  if (target === "junie") {
    const result = await uninstallJunieInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed junie instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install junie\n");
    return 0;
  }

  if (target === "openhands") {
    const result = await uninstallOpenHandsHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed openhands entries: ${result.removed}\n`);
    process.stdout.write(`hooks path: ${result.hooksPath}\n`);
    process.stdout.write("enable: tokenjuice install openhands\n");
    return 0;
  }

  if (target === "opencode") {
    const result = await uninstallOpenCodeExtension();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed opencode extension: ${result.removed ? "yes" : "missing"}\n`);
    process.stdout.write(`extension path: ${result.extensionPath}\n`);
    process.stdout.write("enable: tokenjuice install opencode\n");
    return 0;
  }

  if (target === "vscode-copilot") {
    const result = await uninstallVscodeCopilotHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed vscode-copilot entries: ${result.removed}\n`);
    process.stdout.write(`hooks path: ${result.hooksPath}${result.deletedFile ? " (file deleted)" : ""}\n`);
    process.stdout.write("enable: tokenjuice install vscode-copilot\n");
    return 0;
  }

  if (target === "copilot-cli") {
    const result = await uninstallCopilotCliHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed copilot-cli entries: ${result.removed}\n`);
    process.stdout.write(`hooks path: ${result.hooksPath}${result.deletedFile ? " (file deleted)" : ""}\n`);
    process.stdout.write("enable: tokenjuice install copilot-cli\n");
    return 0;
  }

  if (target === "droid") {
    const result = await uninstallDroidHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed droid entries: ${result.removed}\n`);
    process.stdout.write(`settings path: ${result.settingsPath}\n`);
    process.stdout.write("enable: tokenjuice install droid\n");
    return 0;
  }

  if (target === "zed") {
    const result = await uninstallZedInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed zed rules: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rules path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install zed\n");
    return 0;
  }

  throw new Error("uninstall currently supports: aider, avante, codex, cline, continue, droid, gemini-cli, junie, openhands, opencode, vscode-copilot, copilot-cli, zed");
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
  if (args.positionals[0] === "hooks") {
    const report = await doctorInstalledHooks({ local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`hook health: ${report.status}\n`);
    for (const [name, integrationReport] of Object.entries(report.integrations)) {
      const pathLabel = "hooksPath" in integrationReport
        ? integrationReport.hooksPath
        : "settingsPath" in integrationReport
          ? integrationReport.settingsPath
          : "hookPath" in integrationReport
            ? integrationReport.hookPath
            : "rulePath" in integrationReport
              ? integrationReport.rulePath
              : "conventionPath" in integrationReport
                ? integrationReport.conventionPath
                : "instructionsPath" in integrationReport
                  ? integrationReport.instructionsPath
                  : integrationReport.extensionPath;
      process.stdout.write(`${name}:\n`);
      process.stdout.write(`- path: ${pathLabel}\n`);
      process.stdout.write(`- health: ${integrationReport.status}\n`);
      if ("expectedCommand" in integrationReport) {
        process.stdout.write(`- expected command: ${integrationReport.expectedCommand}\n`);
      }
      if ("detectedCommand" in integrationReport && integrationReport.detectedCommand) {
        process.stdout.write(`- configured command: ${integrationReport.detectedCommand}\n`);
      }
      if (integrationReport.issues.length > 0) {
        process.stdout.write("- issues:\n");
        for (const issue of integrationReport.issues) {
          process.stdout.write(`  - ${issue}\n`);
        }
      }
      if (integrationReport.missingPaths.length > 0) {
        process.stdout.write("- missing paths:\n");
        for (const path of integrationReport.missingPaths) {
          process.stdout.write(`  - ${path}\n`);
        }
      }
      if ("featureFlag" in integrationReport && integrationReport.featureFlag) {
        const flag = integrationReport.featureFlag;
        if (flag.enabled) {
          process.stdout.write(
            `- feature flag: codex_hooks is enabled (${flag.configPath})\n`,
          );
        } else {
          const where = flag.configExists
            ? `${flag.configPath} (missing or disabled)`
            : `no ${flag.configPath}`;
          process.stdout.write(`- feature flag: codex_hooks not enabled — ${where}\n`);
        }
      }
      process.stdout.write(`- repair: ${integrationReport.fixCommand}\n`);
    }
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "aider") {
    const report = await doctorAiderConvention();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`convention path: ${report.conventionPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "avante") {
    const report = await doctorAvanteInstructions();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "codex") {
    const report = await doctorCodexHook(undefined, { local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`hooks path: ${report.hooksPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    process.stdout.write(`expected command: ${report.expectedCommand}\n`);
    if (report.detectedCommand) {
      process.stdout.write(`configured command: ${report.detectedCommand}\n`);
    }
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.missingPaths.length > 0) {
      process.stdout.write("missing paths:\n");
      for (const path of report.missingPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    if (report.featureFlag.enabled) {
      process.stdout.write(
        `feature flag: codex_hooks is enabled (${report.featureFlag.configPath})\n`,
      );
    } else {
      const where = report.featureFlag.configExists
        ? `${report.featureFlag.configPath} (missing or disabled)`
        : `no ${report.featureFlag.configPath}`;
      process.stdout.write(`feature flag: codex_hooks not enabled — ${where}\n`);
      process.stdout.write(`   ${report.featureFlag.fixHint}\n`);
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "pi") {
    const report = await doctorPiExtension();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`extension path: ${report.extensionPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.missingPaths.length > 0) {
      process.stdout.write("missing paths:\n");
      for (const path of report.missingPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "opencode") {
    const report = await doctorOpenCodeExtension();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`extension path: ${report.extensionPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "cursor") {
    const report = await doctorCursorHook(undefined, { local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`hooks path: ${report.hooksPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    process.stdout.write(`expected command: ${report.expectedCommand}\n`);
    if (report.detectedCommand) {
      process.stdout.write(`configured command: ${report.detectedCommand}\n`);
    }
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.missingPaths.length > 0) {
      process.stdout.write("missing paths:\n");
      for (const path of report.missingPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "gemini-cli") {
    const report = await doctorGeminiCliHook(undefined, { local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`settings path: ${report.settingsPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    process.stdout.write(`expected command: ${report.expectedCommand}\n`);
    if (report.detectedCommand) {
      process.stdout.write(`configured command: ${report.detectedCommand}\n`);
    }
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.missingPaths.length > 0) {
      process.stdout.write("missing paths:\n");
      for (const path of report.missingPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "junie") {
    const report = await doctorJunieInstructions();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "openhands") {
    const report = await doctorOpenHandsHook(undefined, { local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`hooks path: ${report.hooksPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    process.stdout.write(`expected command: ${report.expectedCommand}\n`);
    if (report.detectedCommand) {
      process.stdout.write(`configured command: ${report.detectedCommand}\n`);
    }
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.missingPaths.length > 0) {
      process.stdout.write("missing paths:\n");
      for (const path of report.missingPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "vscode-copilot") {
    if (args.printInstructions) {
      process.stdout.write(getVscodeCopilotInstructionsSnippet());
      return 0;
    }
    const report = await doctorVscodeCopilotHook(undefined, { local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`hooks path: ${report.hooksPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    process.stdout.write(`expected command: ${report.expectedCommand}\n`);
    if (report.detectedCommand) {
      process.stdout.write(`configured command: ${report.detectedCommand}\n`);
    }
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.missingPaths.length > 0) {
      process.stdout.write("missing paths:\n");
      for (const path of report.missingPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "zed") {
    const report = await doctorZedInstructions();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`rules path: ${report.instructionsPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "copilot-cli") {
    if (args.printInstructions) {
      process.stdout.write(getCopilotCliInstructionsSnippet());
      return 0;
    }
    const report = await doctorCopilotCliHook(undefined, { local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`hooks path: ${report.hooksPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    process.stdout.write(`expected command: ${report.expectedCommand}\n`);
    if (report.detectedCommand) {
      process.stdout.write(`configured command: ${report.detectedCommand}\n`);
    }
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.missingPaths.length > 0) {
      process.stdout.write("missing paths:\n");
      for (const path of report.missingPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "claude-code") {
    const report = await doctorClaudeCodeHook(undefined, { local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`settings path: ${report.settingsPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    process.stdout.write(`expected command: ${report.expectedCommand}\n`);
    if (report.detectedCommand) {
      process.stdout.write(`configured command: ${report.detectedCommand}\n`);
    }
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.missingPaths.length > 0) {
      process.stdout.write("missing paths:\n");
      for (const path of report.missingPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "cline") {
    const report = await doctorClineHook(undefined, { local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`hook path: ${report.hookPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    process.stdout.write(`expected command: ${report.expectedCommand}\n`);
    if (report.detectedCommand) {
      process.stdout.write(`configured command: ${report.detectedCommand}\n`);
    }
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.missingPaths.length > 0) {
      process.stdout.write("missing paths:\n");
      for (const path of report.missingPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "codebuddy") {
    const report = await doctorCodeBuddyHook(undefined, { local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`settings path: ${report.settingsPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    process.stdout.write(`expected command: ${report.expectedCommand}\n`);
    if (report.detectedCommand) {
      process.stdout.write(`configured command: ${report.detectedCommand}\n`);
    }
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.missingPaths.length > 0) {
      process.stdout.write("missing paths:\n");
      for (const path of report.missingPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "continue") {
    const report = await doctorContinueRule();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`rule path: ${report.rulePath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "droid") {
    const report = await doctorDroidHook(undefined, { local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`settings path: ${report.settingsPath}\n`);
    process.stdout.write(`health: ${report.status}\n`);
    process.stdout.write(`expected command: ${report.expectedCommand}\n`);
    if (report.detectedCommand) {
      process.stdout.write(`configured command: ${report.detectedCommand}\n`);
    }
    if (report.issues.length > 0) {
      process.stdout.write("issues:\n");
      for (const issue of report.issues) {
        process.stdout.write(`- ${issue}\n`);
      }
    }
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    if (report.missingPaths.length > 0) {
      process.stdout.write("missing paths:\n");
      for (const path of report.missingPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
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
  const entries = await listArtifactMetadata(args.storeDir);
  const report = statsArtifacts(entries, {
    timeZone: args.timeZone ?? "local",
    ...(args.source ? { source: args.source } : {}),
    ...(args.bySource ? { bySource: true } : {}),
  });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
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
    process.stdout.write("sources:\n");
    for (const source of report.sources) {
      process.stdout.write(
        `source ${source.source}: entries=${formatMetric(source.totals.entries)} saved=${formatMetric(source.totals.savedChars)} avgRatio=${formatRatio(source.totals.avgRatio)}\n`,
      );
      if (source.reducers.length > 0) {
        process.stdout.write(
          `  reducers: ${source.reducers.slice(0, 3).map((reducer) => `${reducer.reducer}(${formatMetric(reducer.count)})`).join(", ")}\n`,
        );
      }
      if (source.commands.length > 0) {
        process.stdout.write(
          `  commands: ${source.commands.slice(0, 3).map((command) => `${command.signature}(${formatMetric(command.count)})`).join(", ")}\n`,
        );
      }
    }
  }

  return 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
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
      return await runCodexPostToolUseHook(await readStdin(args.maxInputBytes));
    case "claude-code-post-tool-use":
      return await runClaudeCodePostToolUseHook(await readStdin(args.maxInputBytes));
    case "cline-post-tool-use":
      return await runClinePostToolUseHook(await readStdin(args.maxInputBytes));
    case "codebuddy-pre-tool-use":
      return await runCodeBuddyPreToolUseHook(await readStdin(args.maxInputBytes), args.wrapLauncher);
    case "cursor-pre-tool-use":
      return await runCursorPreToolUseHook(await readStdin(args.maxInputBytes), args.wrapLauncher);
    case "gemini-cli-after-tool":
      return await runGeminiCliAfterToolHook(await readStdin(args.maxInputBytes));
    case "openhands-post-tool-use":
      return await runOpenHandsPostToolUseHook(await readStdin(args.maxInputBytes));
    case "vscode-copilot-pre-tool-use":
      return await runVscodeCopilotPreToolUseHook(await readStdin(args.maxInputBytes), args.wrapLauncher);
    case "copilot-cli-post-tool-use":
      return await runCopilotCliPostToolUseHook(await readStdin(args.maxInputBytes));
    case "droid-post-tool-use":
      return await runDroidPostToolUseHook(await readStdin(args.maxInputBytes));
    default:
      printUsage();
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
