#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import { stdin as inputStdin } from "node:process";
import packageJson from "../../package.json" with { type: "json" };

import { getArtifact, listArtifactMetadata, listArtifacts } from "../core/artifacts.js";
import { buildAnalysisEntry, discoverCandidates, doctorArtifacts, statsArtifacts } from "../core/analysis.js";
import { verifyBuiltinFixtures } from "../core/fixtures.js";
import { parseReduceJsonRequest } from "../core/json-protocol.js";
import { WRAP_AUTHORITATIVE_FOOTER } from "../core/compaction-metadata.js";
import { reduceExecution } from "../core/reduce.js";
import { verifyRules } from "../core/rules.js";
import { runWrappedCommand } from "../core/wrap.js";
import type { WrapResult } from "../types.js";
import { doctorAdalInstructions, installAdalInstructions, uninstallAdalInstructions } from "../hosts/adal/index.js";
import { doctorAetherPrompt, installAetherPrompt, uninstallAetherPrompt } from "../hosts/aether/index.js";
import { doctorAgentLayerInstructions, installAgentLayerInstructions, uninstallAgentLayerInstructions } from "../hosts/agent-layer/index.js";
import { doctorAgentInitInstructions, installAgentInitInstructions, uninstallAgentInitInstructions } from "../hosts/agentinit/index.js";
import { doctorAgentlinkInstructions, installAgentlinkInstructions, uninstallAgentlinkInstructions } from "../hosts/agentlink/index.js";
import { doctorAgentloomRule, installAgentloomRule, uninstallAgentloomRule } from "../hosts/agentloom/index.js";
import { doctorAgentsCliMemory, installAgentsCliMemory, uninstallAgentsCliMemory } from "../hosts/agents-cli/index.js";
import { doctorAgentsMdInstructions, installAgentsMdInstructions, uninstallAgentsMdInstructions } from "../hosts/agents-md/index.js";
import { doctorAgentsGeRule, installAgentsGeRule, uninstallAgentsGeRule } from "../hosts/agentsge/index.js";
import { doctorAgentsMeshRule, installAgentsMeshRule, uninstallAgentsMeshRule } from "../hosts/agentsmesh/index.js";
import { doctorAmazonQRule, installAmazonQRule, uninstallAmazonQRule } from "../hosts/amazon-q/index.js";
import { doctorAmpInstructions, installAmpInstructions, uninstallAmpInstructions } from "../hosts/amp/index.js";
import { doctorAiderConvention, installAiderConvention, uninstallAiderConvention } from "../hosts/aider/index.js";
import { doctorAntigravityRule, installAntigravityRule, uninstallAntigravityRule } from "../hosts/antigravity/index.js";
import { doctorAnywhereAgentsInstructions, installAnywhereAgentsInstructions, uninstallAnywhereAgentsInstructions } from "../hosts/anywhere-agents/index.js";
import { doctorAugmentRule, installAugmentRule, uninstallAugmentRule } from "../hosts/augment/index.js";
import { doctorAvanteInstructions, installAvanteInstructions, uninstallAvanteInstructions } from "../hosts/avante/index.js";
import { doctorBobInstructions, installBobInstructions, uninstallBobInstructions } from "../hosts/bob/index.js";
import { doctorBuilderRule, installBuilderRule, uninstallBuilderRule } from "../hosts/builder/index.js";
import { doctorClaudeCodeHook, installClaudeCodeHook, runClaudeCodePostToolUseHook, runClaudeCodePreToolUseHook } from "../hosts/claude-code/index.js";
import { doctorClineHook, installClineHook, runClinePostToolUseHook, uninstallClineHook } from "../hosts/cline/index.js";
import { doctorCodebuffInstructions, installCodebuffInstructions, uninstallCodebuffInstructions } from "../hosts/codebuff/index.js";
import { doctorCodegenInstructions, installCodegenInstructions, uninstallCodegenInstructions } from "../hosts/codegen/index.js";
import { doctorCodeBuddyHook, installCodeBuddyHook, runCodeBuddyPreToolUseHook } from "../hosts/codebuddy/index.js";
import { doctorContinueRule, installContinueRule, uninstallContinueRule } from "../hosts/continue/index.js";
import { doctorCodexHook, installCodexHook, runCodexPostToolUseHook, uninstallCodexHook } from "../hosts/codex/index.js";
import { doctorCopilotAgentHook, installCopilotAgentHook, runCopilotAgentPostToolUseHook, uninstallCopilotAgentHook } from "../hosts/copilot-agent/index.js";
import {
  doctorCopilotCliHook,
  getCopilotCliInstructionsSnippet,
  installCopilotCliHook,
  runCopilotCliPostToolUseHook,
  uninstallCopilotCliHook,
} from "../hosts/copilot-cli/index.js";
import { doctorCrushSkill, installCrushSkill, uninstallCrushSkill } from "../hosts/crush/index.js";
import { doctorCursorHook, installCursorHook, runCursorPreToolUseHook } from "../hosts/cursor/index.js";
import { doctorDeepAgentsInstructions, installDeepAgentsInstructions, uninstallDeepAgentsInstructions } from "../hosts/deepagents/index.js";
import { doctorDevinHook, installDevinHook, runDevinPreToolUseHook, uninstallDevinHook } from "../hosts/devin/index.js";
import { doctorDotAgentsRule, installDotAgentsRule, uninstallDotAgentsRule } from "../hosts/dot-agents/index.js";
import { doctorDockerAgentPrompt, installDockerAgentPrompt, uninstallDockerAgentPrompt } from "../hosts/docker-agent/index.js";
import { doctorDroidHook, installDroidHook, runDroidPostToolUseHook, uninstallDroidHook } from "../hosts/droid/index.js";
import { doctorFirebaseStudioRule, installFirebaseStudioRule, uninstallFirebaseStudioRule } from "../hosts/firebase-studio/index.js";
import { doctorForgeCodeInstructions, installForgeCodeInstructions, uninstallForgeCodeInstructions } from "../hosts/forgecode/index.js";
import { doctorGeminiCliHook, installGeminiCliHook, runGeminiCliAfterToolHook, uninstallGeminiCliHook } from "../hosts/gemini-cli/index.js";
import { doctorGitLabDuoRule, installGitLabDuoRule, uninstallGitLabDuoRule } from "../hosts/gitlab-duo/index.js";
import { doctorGooseHints, installGooseHints, uninstallGooseHints } from "../hosts/goose/index.js";
import { doctorGrokBuildInstructions, installGrokBuildInstructions, uninstallGrokBuildInstructions } from "../hosts/grok-build/index.js";
import { doctorGrokCliHook, installGrokCliHook, runGrokCliPostToolUseHook, uninstallGrokCliHook } from "../hosts/grok-cli/index.js";
import { doctorGptmeInstructions, installGptmeInstructions, uninstallGptmeInstructions } from "../hosts/gptme/index.js";
import { doctorJean2Instructions, installJean2Instructions, uninstallJean2Instructions } from "../hosts/jean2/index.js";
import { doctorJetBrainsAiRule, installJetBrainsAiRule, uninstallJetBrainsAiRule } from "../hosts/jetbrains-ai/index.js";
import { doctorJunieInstructions, installJunieInstructions, uninstallJunieInstructions } from "../hosts/junie/index.js";
import { doctorJulesInstructions, installJulesInstructions, uninstallJulesInstructions } from "../hosts/jules/index.js";
import { doctorKimiHook, installKimiHook, runKimiPostToolUseHook, uninstallKimiHook } from "../hosts/kimi/index.js";
import { doctorKiroSteering, installKiroSteering, uninstallKiroSteering } from "../hosts/kiro/index.js";
import { doctorKiloRule, installKiloRule, uninstallKiloRule } from "../hosts/kilo/index.js";
import { doctorMcpAgentDefinition, installMcpAgentDefinition, uninstallMcpAgentDefinition } from "../hosts/mcp-agent/index.js";
import { doctorMiniSweAgentConfig, installMiniSweAgentConfig, uninstallMiniSweAgentConfig } from "../hosts/mini-swe-agent/index.js";
import { doctorSweAgentConfig, installSweAgentConfig, uninstallSweAgentConfig } from "../hosts/swe-agent/index.js";
import { doctorMistralVibeInstructions, installMistralVibeInstructions, uninstallMistralVibeInstructions } from "../hosts/mistral-vibe/index.js";
import { doctorMuxHook, installMuxHook, runMuxPostToolUseHook, uninstallMuxHook } from "../hosts/mux/index.js";
import { doctorOnaInstructions, installOnaInstructions, uninstallOnaInstructions } from "../hosts/ona/index.js";
import {
  doctorOpenCodeExtension,
  installOpenCodeExtension,
  uninstallOpenCodeExtension,
} from "../hosts/opencode/index.js";
import { doctorOpenInterpreterInstructions, installOpenInterpreterInstructions, uninstallOpenInterpreterInstructions } from "../hosts/open-interpreter/index.js";
import { doctorOpenHandsHook, installOpenHandsHook, runOpenHandsPostToolUseHook, uninstallOpenHandsHook } from "../hosts/openhands/index.js";
import { doctorOpenWebUITool, installOpenWebUITool, uninstallOpenWebUITool } from "../hosts/openwebui/index.js";
import { doctorPiExtension, installPiExtension } from "../hosts/pi/index.js";
import { doctorPlandexConvention, installPlandexConvention, uninstallPlandexConvention } from "../hosts/plandex/index.js";
import { doctorQoderInstructions, installQoderInstructions, uninstallQoderInstructions } from "../hosts/qoder/index.js";
import { doctorQwenCodeHook, installQwenCodeHook, runQwenCodePostToolUseHook, uninstallQwenCodeHook } from "../hosts/qwen-code/index.js";
import { doctorReplitInstructions, installReplitInstructions, uninstallReplitInstructions } from "../hosts/replit/index.js";
import { doctorRooInstructions, installRooInstructions, uninstallRooInstructions } from "../hosts/roo/index.js";
import { doctorRovoInstructions, installRovoInstructions, uninstallRovoInstructions } from "../hosts/rovo/index.js";
import { doctorRulerRule, installRulerRule, uninstallRulerRule } from "../hosts/ruler/index.js";
import { doctorTabnineInstructions, installTabnineInstructions, uninstallTabnineInstructions } from "../hosts/tabnine/index.js";
import { doctorTraeRule, installTraeRule, uninstallTraeRule } from "../hosts/trae/index.js";
import { doctorUiPathInstructions, installUiPathInstructions, uninstallUiPathInstructions } from "../hosts/uipath/index.js";
import {
  doctorVscodeCopilotHook,
  getVscodeCopilotInstructionsSnippet,
  installVscodeCopilotHook,
  runVscodeCopilotPreToolUseHook,
  uninstallVscodeCopilotHook,
} from "../hosts/vscode-copilot/index.js";
import { doctorWarpInstructions, installWarpInstructions, uninstallWarpInstructions } from "../hosts/warp/index.js";
import { doctorWindsurfRule, installWindsurfRule, uninstallWindsurfRule } from "../hosts/windsurf/index.js";
import { doctorZedInstructions, installZedInstructions, uninstallZedInstructions } from "../hosts/zed/index.js";
import { doctorZencoderRule, installZencoderRule, uninstallZencoderRule } from "../hosts/zencoder/index.js";
import { doctorInstalledHooks } from "../hosts/shared/hook-doctor.js";
import { formatHookDoctorReport } from "./doctor-output.js";
import { formatInstallSuccess } from "./install-output.js";
import { shellQuote } from "../hosts/shared/hook-command.js";

type Format = "text" | "json";

function formatPlandexLoadCommand(conventionPath: string): string {
  const loadPath = relative(process.cwd(), conventionPath) || "PLANDEX.tokenjuice.md";
  return `plandex load ${shellQuote(loadPath)}`;
}

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
      "  tokenjuice install adal",
      "  tokenjuice install aether",
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
      "  tokenjuice install bob",
      "  tokenjuice install builder",
      "  tokenjuice install codex [--local]",
      "  tokenjuice install claude-code [--local]",
      "  tokenjuice install cline [--local]",
      "  tokenjuice install codebuff",
      "  tokenjuice install codegen",
      "  tokenjuice install codebuddy [--local]",
      "  tokenjuice install continue",
      "  tokenjuice install copilot-agent [--local]",
      "  tokenjuice install crush",
      "  tokenjuice install cursor [--local]",
      "  tokenjuice install deepagents",
      "  tokenjuice install devin [--local]",
      "  tokenjuice install dot-agents",
      "  tokenjuice install docker-agent",
      "  tokenjuice install droid [--local]",
      "  tokenjuice install firebase-studio",
      "  tokenjuice install forgecode",
      "  tokenjuice install gemini-cli [--local]",
      "  tokenjuice install gitlab-duo",
      "  tokenjuice install goose",
      "  tokenjuice install grok-build",
      "  tokenjuice install grok-cli [--local]",
      "  tokenjuice install gptme",
      "  tokenjuice install jean2",
      "  tokenjuice install jetbrains-ai",
      "  tokenjuice install junie",
      "  tokenjuice install jules",
      "  tokenjuice install kimi [--local]",
      "  tokenjuice install kiro",
      "  tokenjuice install kilo",
      "  tokenjuice install mcp-agent",
      "  tokenjuice install mini-swe-agent",
      "  tokenjuice install swe-agent",
      "  tokenjuice install mistral-vibe",
      "  tokenjuice install mux [--local]",
      "  tokenjuice install ona",
      "  tokenjuice install openhands [--local]",
      "  tokenjuice install open-interpreter",
      "  tokenjuice install openwebui",
      "  tokenjuice install pi [--local]",
      "  tokenjuice install plandex",
      "  tokenjuice install qoder",
      "  tokenjuice install replit",
      "  tokenjuice install opencode [--local]",
      "  tokenjuice install qwen-code [--local]",
      "  tokenjuice install roo",
      "  tokenjuice install rovo",
      "  tokenjuice install ruler",
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
      "  tokenjuice uninstall bob",
      "  tokenjuice uninstall builder",
      "  tokenjuice uninstall codex",
      "  tokenjuice uninstall cline",
      "  tokenjuice uninstall codebuff",
      "  tokenjuice uninstall codegen",
      "  tokenjuice uninstall continue",
      "  tokenjuice uninstall copilot-agent",
      "  tokenjuice uninstall crush",
      "  tokenjuice uninstall deepagents",
      "  tokenjuice uninstall devin",
      "  tokenjuice uninstall dot-agents",
      "  tokenjuice uninstall docker-agent",
      "  tokenjuice uninstall droid",
      "  tokenjuice uninstall firebase-studio",
      "  tokenjuice uninstall forgecode",
      "  tokenjuice uninstall gemini-cli",
      "  tokenjuice uninstall gitlab-duo",
      "  tokenjuice uninstall goose",
      "  tokenjuice uninstall grok-build",
      "  tokenjuice uninstall grok-cli",
      "  tokenjuice uninstall gptme",
      "  tokenjuice uninstall jean2",
      "  tokenjuice uninstall jetbrains-ai",
      "  tokenjuice uninstall junie",
      "  tokenjuice uninstall jules",
      "  tokenjuice uninstall kimi",
      "  tokenjuice uninstall kiro",
      "  tokenjuice uninstall kilo",
      "  tokenjuice uninstall mcp-agent",
      "  tokenjuice uninstall mini-swe-agent",
      "  tokenjuice uninstall swe-agent",
      "  tokenjuice uninstall mistral-vibe",
      "  tokenjuice uninstall mux",
      "  tokenjuice uninstall ona",
      "  tokenjuice uninstall openhands",
      "  tokenjuice uninstall open-interpreter",
      "  tokenjuice uninstall openwebui",
      "  tokenjuice uninstall opencode",
      "  tokenjuice uninstall plandex",
      "  tokenjuice uninstall qoder",
      "  tokenjuice uninstall replit",
      "  tokenjuice uninstall qwen-code",
      "  tokenjuice uninstall roo",
      "  tokenjuice uninstall rovo",
      "  tokenjuice uninstall ruler",
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
      "  tokenjuice doctor [file|hooks|adal|aether|aider|agent-layer|agentinit|agentlink|agentloom|agents-cli|agents-md|agentsge|agentsmesh|amazon-q|amp|antigravity|anywhere-agents|augment|avante|bob|builder|codex|claude-code|cline|codebuff|codegen|codebuddy|continue|copilot-agent|crush|cursor|deepagents|devin|dot-agents|docker-agent|droid|firebase-studio|forgecode|gemini-cli|gitlab-duo|goose|grok-build|grok-cli|gptme|jean2|jetbrains-ai|junie|jules|kimi|kiro|kilo|mcp-agent|mini-swe-agent|swe-agent|mistral-vibe|mux|ona|openhands|open-interpreter|openwebui|pi|opencode|plandex|qoder|qwen-code|replit|roo|rovo|ruler|tabnine|trae|uipath|vscode-copilot|warp|windsurf|zed|zencoder|copilot-cli] [--local] [--print-instructions] [--source-command <cmd>] [--tool-name <name>] [--exit-code <n>]",
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
  const { rawChars, reducedChars } = result.stats;
  if (raw || !result.compaction?.authoritative || reducedChars === 0 || reducedChars >= rawChars) {
    return result.inlineText;
  }
  const footer = [
    "",
    "---",
    WRAP_AUTHORITATIVE_FOOTER,
  ].join("\n");
  return `${result.inlineText}${footer}`;
}

async function runInstall(args: ParsedArgs): Promise<number> {
  const target = args.positionals[0];
  if (target === "adal") {
    const result = await installAdalInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; AdaL CLI still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor adal" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("adal", "instructions", details));
    return 0;
  }

  if (target === "aether") {
    const result = await installAetherPrompt();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Prompt", value: result.promptPath },
      { label: "Settings", value: result.settingsPath },
      { label: "Beta", value: "Aether prompt source; adds .aether/tokenjuice.md to configured agent prompts" },
      { label: "Verify", value: "tokenjuice doctor aether" },
      { label: "Prompt check", value: "aether show-prompt -a <agent>" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    if (result.settingsBackupPath) {
      details.push({ label: "Settings backup", value: result.settingsBackupPath });
    }
    details.push({ label: "Agents updated", value: String(result.agentsUpdated) });
    process.stdout.write(formatInstallSuccess("aether", "prompt", details));
    return 0;
  }

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

  if (target === "agent-layer") {
    const result = await installAgentLayerInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "Agent Layer source instructions; requires an initialized al project" },
      { label: "Init", value: "al init" },
      { label: "Sync", value: "al sync" },
      { label: "Verify", value: "tokenjuice doctor agent-layer" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("agent-layer", "instructions", details));
    return 0;
  }

  if (target === "agentinit" || target === "agent-init") {
    const result = await installAgentInitInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "AgentInit source AGENTS.md guidance; run agentinit sync to propagate it" },
      { label: "Sync", value: result.syncCommand },
      { label: "Verify", value: "tokenjuice doctor agentinit" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("agentinit", "instructions", details));
    return 0;
  }

  if (target === "agentlink") {
    const result = await installAgentlinkInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "source AGENTS.md guidance; run agentlink sync to repair downstream symlinks" },
      { label: "Sync", value: result.syncCommand },
      { label: "Verify", value: "tokenjuice doctor agentlink" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("agentlink", "instructions", details));
    return 0;
  }

  if (target === "agentloom") {
    const result = await installAgentloomRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "Agentloom source rule; run agentloom sync to propagate it" },
      { label: "Sync", value: "agentloom sync" },
      { label: "Verify", value: "tokenjuice doctor agentloom" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("agentloom", "rule", details));
    return 0;
  }

  if (target === "agents-cli") {
    const result = await installAgentsCliMemory();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Memory", value: result.instructionsPath },
      { label: "Beta", value: "agents-cli memory source; run agents sync to propagate it" },
      { label: "Sync", value: result.syncCommand },
      { label: "Verify", value: "tokenjuice doctor agents-cli" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("agents-cli", "memory", details));
    return 0;
  }

  if (target === "agents-md" || target === "agentsmd") {
    const result = await installAgentsMdInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "generic AGENTS.md guidance; the active agent still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor agents-md" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("agents-md", "instructions", details));
    return 0;
  }

  if (target === "agentsge") {
    const result = await installAgentsGeRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "agents.ge source rule; run agents sync to propagate it" },
      { label: "Sync", value: "agents sync" },
      { label: "Verify", value: "tokenjuice doctor agentsge" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("agentsge", "rule", details));
    return 0;
  }

  if (target === "agentsmesh") {
    const result = await installAgentsMeshRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "AgentsMesh source rule; requires an initialized agentsmesh project" },
      { label: "Init", value: "agentsmesh init" },
      { label: "Generate", value: result.syncCommand },
      { label: "Verify", value: "tokenjuice doctor agentsmesh" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("agentsmesh", "rule", details));
    return 0;
  }

  if (target === "amazon-q") {
    const result = await installAmazonQRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "rule-based Amazon Q/Kiro compatibility guidance" },
      { label: "Load", value: "add file://.amazonq/rules/**/*.md to the active agent resources" },
      { label: "Verify", value: "tokenjuice doctor amazon-q" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("amazon-q", "rule", details));
    return 0;
  }

  if (target === "amp") {
    const result = await installAmpInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Amp still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor amp" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    if (result.instructionsPaths && result.instructionsPaths.length > 1) {
      details.push({ label: "Updated paths", value: result.instructionsPaths.join(", ") });
    }
    process.stdout.write(formatInstallSuccess("amp", "instructions", details));
    return 0;
  }

  if (target === "antigravity") {
    const result = await installAntigravityRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "rule-based guidance; Antigravity still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor antigravity" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("antigravity", "rule", details));
    return 0;
  }

  if (target === "anywhere-agents") {
    const result = await installAnywhereAgentsInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "AGENTS.local.md guidance; run anywhere-agents to regenerate downstream files" },
      { label: "Sync", value: result.syncCommand },
      { label: "Verify", value: "tokenjuice doctor anywhere-agents" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("anywhere-agents", "instructions", details));
    return 0;
  }

  if (target === "augment") {
    const result = await installAugmentRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "rule-based guidance; Augment still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor augment" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("augment", "rule", details));
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

  if (target === "bob") {
    const result = await installBobInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; IBM Bob still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor bob" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("bob", "instructions", details));
    return 0;
  }

  if (target === "builder") {
    const result = await installBuilderRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "rule-based guidance; Builder still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor builder" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("builder", "rule", details));
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
      const source = result.featureFlag.key ? `[features].${result.featureFlag.key}` : "default-on";
      details.push({ label: "Feature flag", value: `hooks enabled via ${source} (${result.featureFlag.configPath})` });
    } else {
      const where = result.featureFlag.configExists
        ? `${result.featureFlag.configPath} (missing or disabled)`
        : `no ${result.featureFlag.configPath}`;
      details.push({ label: "Feature flag", value: `hooks disabled - ${where}` });
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

  if (target === "codebuff") {
    const result = await installCodebuffInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Codebuff still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor codebuff" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("codebuff", "instructions", details));
    return 0;
  }

  if (target === "codegen") {
    const result = await installCodegenInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "rule-file guidance; Codegen still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor codegen" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("codegen", "instructions", details));
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

  if (target === "copilot-agent") {
    const result = await installCopilotAgentHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.hooksPath },
      { label: "Command", value: result.command },
      { label: "Beta", value: "repo-level PostToolUse hook for Copilot coding agent bash output" },
      { label: "Verify", value: `tokenjuice doctor copilot-agent${args.local ? " --local" : ""}` },
      { label: "Cloud agent", value: "ensure tokenjuice is available in PATH before Copilot cloud agent hooks run" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("copilot-agent", "hook", details));
    return 0;
  }

  if (target === "crush") {
    const result = await installCrushSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Skill", value: result.skillPath },
      { label: "Beta", value: "project-local Agent Skill; Crush still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor crush" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("crush", "skill", details));
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

  if (target === "deepagents") {
    const result = await installDeepAgentsInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Deep Agents Code still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor deepagents" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("deepagents", "instructions", details));
    return 0;
  }

  if (target === "devin") {
    const result = await installDevinHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.hooksPath },
      { label: "Command", value: result.command },
      { label: "Beta", value: "project-local PreToolUse hook rewrites exec commands before Devin runs them" },
      { label: "Verify", value: `tokenjuice doctor devin${args.local ? " --local" : ""}` },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("devin", "hook", details));
    return 0;
  }

  if (target === "dot-agents") {
    const result = await installDotAgentsRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "dot-agents global rule; run dot-agents sync to propagate it" },
      { label: "Sync", value: result.syncCommand },
      { label: "Verify", value: "tokenjuice doctor dot-agents" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("dot-agents", "rule", details));
    return 0;
  }

  if (target === "docker-agent" || target === "dockeragent" || target === "cagent") {
    const result = await installDockerAgentPrompt();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Prompt", value: result.promptPath },
      { label: "Beta", value: "prompt-file guidance; Docker Agent still owns command execution" },
      { label: "Load", value: "add .docker-agent/tokenjuice.md to agents.<name>.add_prompt_files" },
      { label: "Verify", value: "tokenjuice doctor docker-agent" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("docker-agent", "prompt", details));
    return 0;
  }

  if (target === "firebase-studio") {
    const result = await installFirebaseStudioRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rules", value: result.rulePath },
      { label: "Beta", value: "rule-based guidance; Gemini in Firebase still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor firebase-studio" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("firebase-studio", "rules", details));
    return 0;
  }

  if (target === "forgecode" || target === "forge-code") {
    const result = await installForgeCodeInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "ForgeCode AGENTS.md guidance; ForgeCode still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor forgecode" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("forgecode", "instructions", details));
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

  if (target === "gitlab-duo") {
    const result = await installGitLabDuoRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "custom-rules guidance; GitLab Duo still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor gitlab-duo" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("gitlab-duo", "rule", details));
    return 0;
  }

  if (target === "grok-cli") {
    const result = await installGrokCliHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.settingsPath },
      { label: "Command", value: result.command },
      { label: "Beta", value: "user-level PostToolUse hook; compacted context is injected alongside original output" },
      { label: "Verify", value: `tokenjuice doctor grok-cli${args.local ? " --local" : ""}` },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("grok-cli", "hook", details));
    return 0;
  }

  if (target === "gptme") {
    const result = await installGptmeInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; gptme still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor gptme" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("gptme", "instructions", details));
    return 0;
  }

  if (target === "jean2") {
    const result = await installJean2Instructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-file guidance; Jean2 still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor jean2" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("jean2", "instructions", details));
    return 0;
  }

  if (target === "grok-build") {
    const result = await installGrokBuildInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Grok Build still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor grok-build" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("grok-build", "instructions", details));
    return 0;
  }

  if (target === "goose") {
    const result = await installGooseHints();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hints", value: result.hintsPath },
      { label: "Beta", value: "hints-based guidance; Goose still owns command execution" },
      { label: "Reload", value: "restart Goose so the updated .goosehints file is loaded" },
      { label: "Verify", value: "tokenjuice doctor goose" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("goose", "hints", details));
    return 0;
  }

  if (target === "jetbrains-ai") {
    const result = await installJetBrainsAiRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "rule-based guidance; JetBrains AI Assistant still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor jetbrains-ai" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("jetbrains-ai", "rule", details));
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

  if (target === "jules") {
    const result = await installJulesInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Jules still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor jules" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("jules", "instructions", details));
    return 0;
  }

  if (target === "kimi") {
    const result = await installKimiHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Config", value: result.configPath },
      { label: "Command", value: result.command },
      { label: "Beta", value: "PostToolUse Shell hook; compacted context is injected alongside original output" },
      { label: "Verify", value: `tokenjuice doctor kimi${args.local ? " --local" : ""}` },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("kimi", "hook", details));
    return 0;
  }

  if (target === "kiro") {
    const result = await installKiroSteering();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Steering", value: result.steeringPath },
      { label: "Beta", value: "steering-based guidance; Kiro still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor kiro" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("kiro", "steering", details));
    return 0;
  }

  if (target === "kilo") {
    const result = await installKiloRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Config", value: result.configPath },
      { label: "Beta", value: "rule-based guidance; Kilo Code still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor kilo" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    if (result.configBackupPath) {
      details.push({ label: "Config backup", value: result.configBackupPath });
    }
    process.stdout.write(formatInstallSuccess("kilo", "rule", details));
    return 0;
  }

  if (target === "mcp-agent" || target === "mcpagent") {
    const result = await installMcpAgentDefinition();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Agent", value: result.agentPath },
      { label: "Beta", value: "agent-file guidance; mcp-agent still owns command execution" },
      { label: "Load", value: "enable .mcp-agent/agents in mcp_agent.config.yaml agents.search_paths" },
      { label: "Verify", value: "tokenjuice doctor mcp-agent" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("mcp-agent", "agent", details));
    return 0;
  }

  if (target === "mistral-vibe" || target === "mistralvibe") {
    const result = await installMistralVibeInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Mistral Vibe still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor mistral-vibe" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("mistral-vibe", "instructions", details));
    return 0;
  }

  if (target === "mini-swe-agent" || target === "mini-sweagent") {
    const result = await installMiniSweAgentConfig();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Config", value: result.configPath },
      { label: "Beta", value: "config-fragment guidance; mini-SWE-agent still owns command execution" },
      { label: "Load", value: "mini -c mini.yaml -c .mini-swe-agent/tokenjuice.yaml" },
      { label: "Verify", value: "tokenjuice doctor mini-swe-agent" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("mini-swe-agent", "config", details));
    return 0;
  }

  if (target === "swe-agent" || target === "sweagent") {
    const result = await installSweAgentConfig();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Config", value: result.configPath },
      { label: "Beta", value: "config-fragment guidance; SWE-agent still owns command execution" },
      { label: "Load", value: "sweagent run --config config/default.yaml --config .swe-agent/tokenjuice.yaml" },
      { label: "Verify", value: "tokenjuice doctor swe-agent" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("swe-agent", "config", details));
    return 0;
  }

  if (target === "mux") {
    const result = await installMuxHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.hookPath },
      { label: "Command", value: result.command },
      { label: "Beta", value: "project-local tool_post hook; compacted context is injected alongside original output" },
      { label: "Verify", value: `tokenjuice doctor mux${args.local ? " --local" : ""}` },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("mux", "hook", details));
    return 0;
  }

  if (target === "ona") {
    const result = await installOnaInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-file guidance; Ona still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor ona" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("ona", "instructions", details));
    return 0;
  }

  if (target === "warp") {
    const result = await installWarpInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Warp still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor warp" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("warp", "instructions", details));
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

  if (target === "open-interpreter" || target === "openinterpreter") {
    const result = await installOpenInterpreterInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Open Interpreter still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor open-interpreter" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("open-interpreter", "instructions", details));
    return 0;
  }

  if (target === "openwebui") {
    const result = await installOpenWebUITool();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Tool source", value: result.toolPath },
      { label: "Beta", value: "Workspace Tool export; review and import manually in Open WebUI" },
      { label: "Safety", value: "compacts provided output only; does not execute user commands" },
      { label: "Verify", value: "tokenjuice doctor openwebui" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("openwebui", "tool source", details));
    return 0;
  }

  if (target === "plandex") {
    const result = await installPlandexConvention();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Convention", value: result.conventionPath },
      { label: "Beta", value: "context-based guidance; Plandex still owns command execution" },
      { label: "Load", value: formatPlandexLoadCommand(result.conventionPath) },
      { label: "Verify", value: "tokenjuice doctor plandex" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("plandex", "convention", details));
    return 0;
  }

  if (target === "qoder") {
    const result = await installQoderInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Qoder still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor qoder" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("qoder", "instructions", details));
    return 0;
  }

  if (target === "replit" || target === "replit-agent") {
    const result = await installReplitInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Replit Agent still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor replit" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("replit", "instructions", details));
    return 0;
  }

  if (target === "qwen-code") {
    const result = await installQwenCodeHook(undefined, { local: args.local });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Hook", value: result.settingsPath },
      { label: "Command", value: result.command },
      { label: "Beta", value: "project-local PostToolUse hook; compacted context is injected alongside original output" },
      { label: "Verify", value: `tokenjuice doctor qwen-code${args.local ? " --local" : ""}` },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("qwen-code", "hook", details));
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

  if (target === "roo") {
    const result = await installRooInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rules", value: result.instructionsPath },
      { label: "Beta", value: "rule-based guidance; Roo Code still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor roo" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("roo", "rules", details));
    return 0;
  }

  if (target === "rovo" || target === "rovo-dev") {
    const result = await installRovoInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Rovo Dev CLI still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor rovo" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("rovo", "instructions", details));
    return 0;
  }

  if (target === "ruler") {
    const result = await installRulerRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "rule-based guidance; run ruler apply to propagate it" },
      { label: "Apply", value: "ruler apply" },
      { label: "Verify", value: "tokenjuice doctor ruler" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("ruler", "rule", details));
    return 0;
  }

  if (target === "tabnine") {
    const result = await installTabnineInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-based guidance; Tabnine CLI still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor tabnine" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("tabnine", "instructions", details));
    return 0;
  }

  if (target === "trae") {
    const result = await installTraeRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "rule-based guidance; Trae still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor trae" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("trae", "rule", details));
    return 0;
  }

  if (target === "uipath") {
    const result = await installUiPathInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Instructions", value: result.instructionsPath },
      { label: "Beta", value: "instruction-file guidance; the active coding agent still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor uipath" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("uipath", "instructions", details));
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

  if (target === "windsurf") {
    const result = await installWindsurfRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "rule-based guidance; Windsurf still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor windsurf" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("windsurf", "rule", details));
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

  if (target === "zencoder") {
    const result = await installZencoderRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    const details = [
      { label: "Rule", value: result.rulePath },
      { label: "Beta", value: "rule-based guidance; Zencoder still owns command execution" },
      { label: "Verify", value: "tokenjuice doctor zencoder" },
      { label: "Escape hatch", value: "tokenjuice wrap --raw -- <command>" },
    ];
    if (result.backupPath) {
      details.push({ label: "Backup", value: result.backupPath });
    }
    process.stdout.write(formatInstallSuccess("zencoder", "rule", details));
    return 0;
  }

  throw new Error("install currently supports: adal, aether, aider, agent-layer, agentinit, agentlink, agentloom, agents-cli, agents-md, agentsge, agentsmesh, amazon-q, amp, antigravity, anywhere-agents, augment, avante, bob, builder, codex, claude-code, cline, codebuff, codegen, codebuddy, continue, copilot-agent, crush, cursor, deepagents, devin, dot-agents, docker-agent, droid, firebase-studio, forgecode, gemini-cli, gitlab-duo, goose, grok-build, grok-cli, gptme, jean2, jetbrains-ai, junie, jules, kimi, kiro, kilo, mcp-agent, mini-swe-agent, swe-agent, mistral-vibe, mux, ona, openhands, open-interpreter, openwebui, pi, opencode, plandex, qoder, replit, qwen-code, roo, rovo, ruler, tabnine, trae, uipath, vscode-copilot, warp, windsurf, copilot-cli, zed, zencoder");
}

async function runUninstall(args: ParsedArgs): Promise<number> {
  const target = args.positionals[0];
  if (target === "adal") {
    const result = await uninstallAdalInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed adal instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install adal\n");
    return 0;
  }

  if (target === "aether") {
    const result = await uninstallAetherPrompt();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed aether prompt: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`prompt path: ${result.promptPath}\n`);
    process.stdout.write(`settings path: ${result.settingsPath}\n`);
    process.stdout.write(`prompt refs removed: ${result.promptsRemoved}\n`);
    process.stdout.write("enable: tokenjuice install aether\n");
    return 0;
  }

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

  if (target === "agent-layer") {
    const result = await uninstallAgentLayerInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed agent-layer instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write(`sync: ${result.syncCommand}\n`);
    process.stdout.write("enable: tokenjuice install agent-layer\n");
    return 0;
  }

  if (target === "agentinit" || target === "agent-init") {
    const result = await uninstallAgentInitInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed agentinit instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write(`sync: ${result.syncCommand}\n`);
    process.stdout.write("enable: tokenjuice install agentinit\n");
    return 0;
  }

  if (target === "agentlink") {
    const result = await uninstallAgentlinkInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed agentlink instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write(`sync: ${result.syncCommand}\n`);
    process.stdout.write("enable: tokenjuice install agentlink\n");
    return 0;
  }

  if (target === "agentloom") {
    const result = await uninstallAgentloomRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed agentloom rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write(`sync: ${result.syncCommand}\n`);
    process.stdout.write("enable: tokenjuice install agentloom\n");
    return 0;
  }

  if (target === "agents-cli") {
    const result = await uninstallAgentsCliMemory();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed agents-cli memory: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`memory path: ${result.instructionsPath}\n`);
    process.stdout.write(`sync: ${result.syncCommand}\n`);
    process.stdout.write("enable: tokenjuice install agents-cli\n");
    return 0;
  }

  if (target === "agents-md" || target === "agentsmd") {
    const result = await uninstallAgentsMdInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed agents-md instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install agents-md\n");
    return 0;
  }

  if (target === "agentsge") {
    const result = await uninstallAgentsGeRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed agentsge rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install agentsge\n");
    return 0;
  }

  if (target === "agentsmesh") {
    const result = await uninstallAgentsMeshRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed agentsmesh rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write(`generate: ${result.syncCommand}\n`);
    process.stdout.write("enable: tokenjuice install agentsmesh\n");
    return 0;
  }

  if (target === "amazon-q") {
    const result = await uninstallAmazonQRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed amazon-q rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install amazon-q\n");
    return 0;
  }

  if (target === "amp") {
    const result = await uninstallAmpInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed amp instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    if (result.removedPaths && result.removedPaths.length > 1) {
      process.stdout.write("removed paths:\n");
      for (const path of result.removedPaths) {
        process.stdout.write(`- ${path}\n`);
      }
    }
    process.stdout.write("enable: tokenjuice install amp\n");
    return 0;
  }

  if (target === "antigravity") {
    const result = await uninstallAntigravityRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed antigravity rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install antigravity\n");
    return 0;
  }

  if (target === "anywhere-agents") {
    const result = await uninstallAnywhereAgentsInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed anywhere-agents instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write(`sync: ${result.syncCommand}\n`);
    process.stdout.write("enable: tokenjuice install anywhere-agents\n");
    return 0;
  }

  if (target === "augment") {
    const result = await uninstallAugmentRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed augment rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install augment\n");
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

  if (target === "bob") {
    const result = await uninstallBobInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed bob instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install bob\n");
    return 0;
  }

  if (target === "builder") {
    const result = await uninstallBuilderRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed builder rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install builder\n");
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

  if (target === "codebuff") {
    const result = await uninstallCodebuffInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed codebuff instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install codebuff\n");
    return 0;
  }

  if (target === "codegen") {
    const result = await uninstallCodegenInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed codegen instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install codegen\n");
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

  if (target === "copilot-agent") {
    const result = await uninstallCopilotAgentHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed copilot-agent entries: ${result.removed}\n`);
    process.stdout.write(`hook path: ${result.hooksPath}\n`);
    if (result.deletedFile) {
      process.stdout.write("deleted empty hook file: yes\n");
    }
    process.stdout.write("enable: tokenjuice install copilot-agent\n");
    return 0;
  }

  if (target === "crush") {
    const result = await uninstallCrushSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed crush skill: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`skill path: ${result.skillPath}\n`);
    process.stdout.write("enable: tokenjuice install crush\n");
    return 0;
  }

  if (target === "firebase-studio") {
    const result = await uninstallFirebaseStudioRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed firebase-studio rules: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rules path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install firebase-studio\n");
    return 0;
  }

  if (target === "forgecode" || target === "forge-code") {
    const result = await uninstallForgeCodeInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed forgecode instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install forgecode\n");
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

  if (target === "gitlab-duo") {
    const result = await uninstallGitLabDuoRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed gitlab-duo rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install gitlab-duo\n");
    return 0;
  }

  if (target === "grok-cli") {
    const result = await uninstallGrokCliHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed grok-cli entries: ${result.removed}\n`);
    process.stdout.write(`settings path: ${result.settingsPath}\n`);
    process.stdout.write("enable: tokenjuice install grok-cli\n");
    return 0;
  }

  if (target === "gptme") {
    const result = await uninstallGptmeInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed gptme instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install gptme\n");
    return 0;
  }

  if (target === "jean2") {
    const result = await uninstallJean2Instructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed jean2 instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install jean2\n");
    return 0;
  }

  if (target === "grok-build") {
    const result = await uninstallGrokBuildInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed grok-build instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install grok-build\n");
    return 0;
  }

  if (target === "goose") {
    const result = await uninstallGooseHints();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed goose hints: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`hints path: ${result.hintsPath}\n`);
    process.stdout.write("enable: tokenjuice install goose\n");
    return 0;
  }

  if (target === "jetbrains-ai") {
    const result = await uninstallJetBrainsAiRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed jetbrains-ai rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install jetbrains-ai\n");
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

  if (target === "jules") {
    const result = await uninstallJulesInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed jules instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install jules\n");
    return 0;
  }

  if (target === "kimi") {
    const result = await uninstallKimiHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed kimi entries: ${result.removed}\n`);
    process.stdout.write(`config path: ${result.configPath}\n`);
    process.stdout.write("enable: tokenjuice install kimi\n");
    return 0;
  }

  if (target === "kiro") {
    const result = await uninstallKiroSteering();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed kiro steering: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`steering path: ${result.steeringPath}\n`);
    process.stdout.write("enable: tokenjuice install kiro\n");
    return 0;
  }

  if (target === "kilo") {
    const result = await uninstallKiloRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed kilo rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write(`config path: ${result.configPath}\n`);
    process.stdout.write(`removed kilo config entry: ${result.configUpdated ? "yes" : "no"}\n`);
    process.stdout.write("enable: tokenjuice install kilo\n");
    return 0;
  }

  if (target === "mistral-vibe" || target === "mistralvibe") {
    const result = await uninstallMistralVibeInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed mistral-vibe instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install mistral-vibe\n");
    return 0;
  }

  if (target === "mcp-agent" || target === "mcpagent") {
    const result = await uninstallMcpAgentDefinition();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed mcp-agent definition: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`agent path: ${result.agentPath}\n`);
    process.stdout.write("enable: tokenjuice install mcp-agent\n");
    return 0;
  }

  if (target === "mini-swe-agent" || target === "mini-sweagent") {
    const result = await uninstallMiniSweAgentConfig();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed mini-swe-agent config: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`config path: ${result.configPath}\n`);
    process.stdout.write("enable: tokenjuice install mini-swe-agent\n");
    return 0;
  }

  if (target === "swe-agent" || target === "sweagent") {
    const result = await uninstallSweAgentConfig();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed swe-agent config: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`config path: ${result.configPath}\n`);
    process.stdout.write("enable: tokenjuice install swe-agent\n");
    return 0;
  }

  if (target === "mux") {
    const result = await uninstallMuxHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed mux hook: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`hook path: ${result.hookPath}\n`);
    process.stdout.write("enable: tokenjuice install mux\n");
    return 0;
  }

  if (target === "ona") {
    const result = await uninstallOnaInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed ona instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install ona\n");
    return 0;
  }

  if (target === "warp") {
    const result = await uninstallWarpInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed warp instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install warp\n");
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

  if (target === "open-interpreter" || target === "openinterpreter") {
    const result = await uninstallOpenInterpreterInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed open-interpreter instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install open-interpreter\n");
    return 0;
  }

  if (target === "openwebui") {
    const result = await uninstallOpenWebUITool();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed openwebui tool source: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`tool path: ${result.toolPath}\n`);
    process.stdout.write("enable: tokenjuice install openwebui\n");
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

  if (target === "plandex") {
    const result = await uninstallPlandexConvention();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed plandex convention: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`convention path: ${result.conventionPath}\n`);
    process.stdout.write("enable: tokenjuice install plandex\n");
    return 0;
  }

  if (target === "qoder") {
    const result = await uninstallQoderInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed qoder instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install qoder\n");
    return 0;
  }

  if (target === "replit" || target === "replit-agent") {
    const result = await uninstallReplitInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed replit instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install replit\n");
    return 0;
  }

  if (target === "qwen-code") {
    const result = await uninstallQwenCodeHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed qwen-code entries: ${result.removed}\n`);
    process.stdout.write(`settings path: ${result.settingsPath}\n`);
    process.stdout.write("enable: tokenjuice install qwen-code\n");
    return 0;
  }

  if (target === "roo") {
    const result = await uninstallRooInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed roo rules: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rules path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install roo\n");
    return 0;
  }

  if (target === "rovo" || target === "rovo-dev") {
    const result = await uninstallRovoInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed rovo instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install rovo\n");
    return 0;
  }

  if (target === "ruler") {
    const result = await uninstallRulerRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed ruler rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install ruler\n");
    return 0;
  }

  if (target === "tabnine") {
    const result = await uninstallTabnineInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed tabnine instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install tabnine\n");
    return 0;
  }

  if (target === "trae") {
    const result = await uninstallTraeRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed trae rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install trae\n");
    return 0;
  }

  if (target === "uipath") {
    const result = await uninstallUiPathInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed uipath instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install uipath\n");
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

  if (target === "windsurf") {
    const result = await uninstallWindsurfRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed windsurf rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install windsurf\n");
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

  if (target === "deepagents") {
    const result = await uninstallDeepAgentsInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed deepagents instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install deepagents\n");
    return 0;
  }

  if (target === "devin") {
    const result = await uninstallDevinHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed devin entries: ${result.removed}\n`);
    process.stdout.write(`hooks path: ${result.hooksPath}${result.deletedFile ? " (file deleted)" : ""}\n`);
    process.stdout.write("enable: tokenjuice install devin\n");
    return 0;
  }

  if (target === "dot-agents") {
    const result = await uninstallDotAgentsRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed dot-agents rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write(`sync: ${result.syncCommand}\n`);
    process.stdout.write("enable: tokenjuice install dot-agents\n");
    return 0;
  }

  if (target === "docker-agent" || target === "dockeragent" || target === "cagent") {
    const result = await uninstallDockerAgentPrompt();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed docker-agent prompt: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`prompt path: ${result.promptPath}\n`);
    process.stdout.write("enable: tokenjuice install docker-agent\n");
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

  if (target === "zencoder") {
    const result = await uninstallZencoderRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed zencoder rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install zencoder\n");
    return 0;
  }

  throw new Error("uninstall currently supports: adal, aether, aider, agent-layer, agentinit, agentlink, agentloom, agents-cli, agents-md, agentsge, agentsmesh, amazon-q, amp, antigravity, anywhere-agents, augment, avante, bob, builder, codex, cline, codebuff, codegen, continue, copilot-agent, crush, deepagents, devin, dot-agents, docker-agent, droid, firebase-studio, forgecode, gemini-cli, gitlab-duo, goose, grok-build, grok-cli, gptme, jean2, jetbrains-ai, junie, jules, kimi, kiro, kilo, mcp-agent, mini-swe-agent, swe-agent, mistral-vibe, mux, ona, openhands, open-interpreter, openwebui, opencode, plandex, qoder, replit, qwen-code, roo, rovo, ruler, tabnine, trae, uipath, vscode-copilot, warp, windsurf, copilot-cli, zed, zencoder");
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

    process.stdout.write(formatHookDoctorReport(report));
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "adal") {
    const report = await doctorAdalInstructions();

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

  if (args.positionals[0] === "aether") {
    const report = await doctorAetherPrompt();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`prompt path: ${report.promptPath}\n`);
    process.stdout.write(`settings path: ${report.settingsPath}\n`);
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
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
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

  if (args.positionals[0] === "agent-layer") {
    const report = await doctorAgentLayerInstructions();

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

  if (args.positionals[0] === "agentinit" || args.positionals[0] === "agent-init") {
    const report = await doctorAgentInitInstructions();

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
    process.stdout.write(`sync: ${report.syncCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "agentlink") {
    const report = await doctorAgentlinkInstructions();

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
    process.stdout.write(`sync: ${report.syncCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "agentloom") {
    const report = await doctorAgentloomRule();

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

  if (args.positionals[0] === "agents-cli") {
    const report = await doctorAgentsCliMemory();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`memory path: ${report.instructionsPath}\n`);
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
    process.stdout.write(`sync: ${report.syncCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "agents-md" || args.positionals[0] === "agentsmd") {
    const report = await doctorAgentsMdInstructions();

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

  if (args.positionals[0] === "agentsge") {
    const report = await doctorAgentsGeRule();

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

  if (args.positionals[0] === "agentsmesh") {
    const report = await doctorAgentsMeshRule();

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

  if (args.positionals[0] === "amazon-q") {
    const report = await doctorAmazonQRule();

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

  if (args.positionals[0] === "amp") {
    const report = await doctorAmpInstructions();

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

  if (args.positionals[0] === "antigravity") {
    const report = await doctorAntigravityRule();

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

  if (args.positionals[0] === "anywhere-agents") {
    const report = await doctorAnywhereAgentsInstructions();

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
    process.stdout.write(`sync: ${report.syncCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "augment") {
    const report = await doctorAugmentRule();

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

  if (args.positionals[0] === "bob") {
    const report = await doctorBobInstructions();

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

  if (args.positionals[0] === "builder") {
    const report = await doctorBuilderRule();

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
      const source = report.featureFlag.key ? `[features].${report.featureFlag.key}` : "default-on";
      process.stdout.write(
        `feature flag: hooks enabled via ${source} (${report.featureFlag.configPath})\n`,
      );
    } else {
      const where = report.featureFlag.configExists
        ? `${report.featureFlag.configPath} (missing or disabled)`
        : `no ${report.featureFlag.configPath}`;
      process.stdout.write(`feature flag: hooks disabled — ${where}\n`);
      process.stdout.write(`   ${report.featureFlag.fixHint}\n`);
    }
    if (report.runtimeConfig.configExists) {
      process.stdout.write(
        `codex config: approval_policy=${report.runtimeConfig.approvalPolicy ?? "(default)"}, sandbox_mode=${report.runtimeConfig.sandboxMode ?? "(default)"}, approvals_reviewer=${report.runtimeConfig.approvalsReviewer ?? "(default)"}\n`,
      );
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

  if (args.positionals[0] === "plandex") {
    const report = await doctorPlandexConvention();

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

  if (args.positionals[0] === "qoder") {
    const report = await doctorQoderInstructions();

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

  if (args.positionals[0] === "replit" || args.positionals[0] === "replit-agent") {
    const report = await doctorReplitInstructions();

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

  if (args.positionals[0] === "qwen-code") {
    const report = await doctorQwenCodeHook(undefined, { local: args.local });

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

  if (args.positionals[0] === "crush") {
    const report = await doctorCrushSkill();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`skill path: ${report.skillPath}\n`);
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
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
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

  if (args.positionals[0] === "deepagents") {
    const report = await doctorDeepAgentsInstructions();

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

  if (args.positionals[0] === "devin") {
    const report = await doctorDevinHook(undefined, { local: args.local });

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

  if (args.positionals[0] === "dot-agents") {
    const report = await doctorDotAgentsRule();

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
    process.stdout.write(`sync: ${report.syncCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "docker-agent" || args.positionals[0] === "dockeragent" || args.positionals[0] === "cagent") {
    const report = await doctorDockerAgentPrompt();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`prompt path: ${report.promptPath}\n`);
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

  if (args.positionals[0] === "copilot-agent") {
    const report = await doctorCopilotAgentHook(undefined, { local: args.local });

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

  if (args.positionals[0] === "firebase-studio") {
    const report = await doctorFirebaseStudioRule();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`rules path: ${report.rulePath}\n`);
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
    if (report.advisories.length > 0) {
      process.stdout.write("advisories:\n");
      for (const advisory of report.advisories) {
        process.stdout.write(`- ${advisory}\n`);
      }
    }
    process.stdout.write(`repair: ${report.fixCommand}\n`);
    return report.status === "broken" ? 1 : 0;
  }

  if (args.positionals[0] === "forgecode" || args.positionals[0] === "forge-code") {
    const report = await doctorForgeCodeInstructions();

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

  if (args.positionals[0] === "gitlab-duo") {
    const report = await doctorGitLabDuoRule();

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

  if (args.positionals[0] === "grok-cli") {
    const report = await doctorGrokCliHook(undefined, { local: args.local });

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

  if (args.positionals[0] === "gptme") {
    const report = await doctorGptmeInstructions();

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

  if (args.positionals[0] === "jean2") {
    const report = await doctorJean2Instructions();

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

  if (args.positionals[0] === "grok-build") {
    const report = await doctorGrokBuildInstructions();

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

  if (args.positionals[0] === "goose") {
    const report = await doctorGooseHints();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`hints path: ${report.hintsPath}\n`);
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

  if (args.positionals[0] === "jetbrains-ai") {
    const report = await doctorJetBrainsAiRule();

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

  if (args.positionals[0] === "jules") {
    const report = await doctorJulesInstructions();

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

  if (args.positionals[0] === "kimi") {
    const report = await doctorKimiHook(undefined, { local: args.local });

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`config path: ${report.configPath}\n`);
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

  if (args.positionals[0] === "openwebui") {
    const report = await doctorOpenWebUITool();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`tool path: ${report.toolPath}\n`);
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

  if (args.positionals[0] === "mcp-agent" || args.positionals[0] === "mcpagent") {
    const report = await doctorMcpAgentDefinition();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`agent path: ${report.agentPath}\n`);
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

  if (args.positionals[0] === "mini-swe-agent" || args.positionals[0] === "mini-sweagent") {
    const report = await doctorMiniSweAgentConfig();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`config path: ${report.configPath}\n`);
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

  if (args.positionals[0] === "swe-agent" || args.positionals[0] === "sweagent") {
    const report = await doctorSweAgentConfig();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`config path: ${report.configPath}\n`);
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

  if (args.positionals[0] === "open-interpreter" || args.positionals[0] === "openinterpreter") {
    const report = await doctorOpenInterpreterInstructions();

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

  if (args.positionals[0] === "zencoder") {
    const report = await doctorZencoderRule();

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

  if (args.positionals[0] === "roo") {
    const report = await doctorRooInstructions();

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

  if (args.positionals[0] === "rovo" || args.positionals[0] === "rovo-dev") {
    const report = await doctorRovoInstructions();

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

  if (args.positionals[0] === "ruler") {
    const report = await doctorRulerRule();

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

  if (args.positionals[0] === "tabnine") {
    const report = await doctorTabnineInstructions();

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

  if (args.positionals[0] === "trae") {
    const report = await doctorTraeRule();

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

  if (args.positionals[0] === "uipath") {
    const report = await doctorUiPathInstructions();

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

  if (args.positionals[0] === "kilo") {
    const report = await doctorKiloRule();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`rule path: ${report.rulePath}\n`);
    process.stdout.write(`config path: ${report.configPath}\n`);
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

  if (args.positionals[0] === "mistral-vibe" || args.positionals[0] === "mistralvibe") {
    const report = await doctorMistralVibeInstructions();

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

  if (args.positionals[0] === "mux") {
    const report = await doctorMuxHook(undefined, { local: args.local });

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

  if (args.positionals[0] === "ona") {
    const report = await doctorOnaInstructions();

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

  if (args.positionals[0] === "warp") {
    const report = await doctorWarpInstructions();

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

  if (args.positionals[0] === "kiro") {
    const report = await doctorKiroSteering();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`steering path: ${report.steeringPath}\n`);
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

  if (args.positionals[0] === "windsurf") {
    const report = await doctorWindsurfRule();

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

  if (args.positionals[0] === "codebuff") {
    const report = await doctorCodebuffInstructions();

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

  if (args.positionals[0] === "codegen") {
    const report = await doctorCodegenInstructions();

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
    case "claude-code-pre-tool-use":
      return await runClaudeCodePreToolUseHook(await readStdin(args.maxInputBytes), args.wrapLauncher);
    case "claude-code-post-tool-use":
      return await runClaudeCodePostToolUseHook(await readStdin(args.maxInputBytes));
    case "cline-post-tool-use":
      return await runClinePostToolUseHook(await readStdin(args.maxInputBytes));
    case "codebuddy-pre-tool-use":
      return await runCodeBuddyPreToolUseHook(await readStdin(args.maxInputBytes), args.wrapLauncher);
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

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
