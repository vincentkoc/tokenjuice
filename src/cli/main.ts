#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
import { doctorAdalInstructions, uninstallAdalInstructions } from "../hosts/adal/index.js";
import { doctorAetherPrompt, uninstallAetherPrompt } from "../hosts/aether/index.js";
import { doctorAictlInstructions, uninstallAictlInstructions } from "../hosts/aictl/index.js";
import { doctorAiMemoryProtocolMemory, uninstallAiMemoryProtocolMemory } from "../hosts/ai-memory-protocol/index.js";
import { doctorAgentLayerInstructions, uninstallAgentLayerInstructions } from "../hosts/agent-layer/index.js";
import { doctorAgentInitInstructions, uninstallAgentInitInstructions } from "../hosts/agentinit/index.js";
import { doctorAgentlinkInstructions, uninstallAgentlinkInstructions } from "../hosts/agentlink/index.js";
import { doctorAgentloomRule, uninstallAgentloomRule } from "../hosts/agentloom/index.js";
import { doctorAgentsCliMemory, uninstallAgentsCliMemory } from "../hosts/agents-cli/index.js";
import { doctorAgentsMdInstructions, uninstallAgentsMdInstructions } from "../hosts/agents-md/index.js";
import { doctorAgentsGeRule, uninstallAgentsGeRule } from "../hosts/agentsge/index.js";
import { doctorAgentsMeshRule, uninstallAgentsMeshRule } from "../hosts/agentsmesh/index.js";
import { doctorAmazonQRule, uninstallAmazonQRule } from "../hosts/amazon-q/index.js";
import { doctorAmpInstructions, uninstallAmpInstructions } from "../hosts/amp/index.js";
import { doctorAiderConvention, uninstallAiderConvention } from "../hosts/aider/index.js";
import { doctorAntigravityRule, uninstallAntigravityRule } from "../hosts/antigravity/index.js";
import { doctorAnywhereAgentsInstructions, uninstallAnywhereAgentsInstructions } from "../hosts/anywhere-agents/index.js";
import { doctorAugmentRule, uninstallAugmentRule } from "../hosts/augment/index.js";
import { doctorAvanteInstructions, uninstallAvanteInstructions } from "../hosts/avante/index.js";
import { doctorBazSkill, uninstallBazSkill } from "../hosts/baz/index.js";
import { doctorBitoGuidelines, uninstallBitoGuidelines } from "../hosts/bito/index.js";
import { doctorBlackboxSkill, uninstallBlackboxSkill } from "../hosts/blackbox/index.js";
import { doctorBlocksSkill, uninstallBlocksSkill } from "../hosts/blocks/index.js";
import { doctorClawdbotSkill, uninstallClawdbotSkill } from "../hosts/clawdbot/index.js";
import { doctorBobInstructions, uninstallBobInstructions } from "../hosts/bob/index.js";
import { doctorBuilderRule, uninstallBuilderRule } from "../hosts/builder/index.js";
import { doctorCharlieInstructions, uninstallCharlieInstructions } from "../hosts/charlie/index.js";
import { doctorClaudeCodeHook, runClaudeCodePostToolUseHook, runClaudeCodePreToolUseHook, uninstallClaudeCodeHook } from "../hosts/claude-code/index.js";
import { doctorClineHook, runClinePostToolUseHook, uninstallClineHook } from "../hosts/cline/index.js";
import { doctorCodeAntInstructions, uninstallCodeAntInstructions } from "../hosts/codeant/index.js";
import { doctorCodebuffInstructions, uninstallCodebuffInstructions } from "../hosts/codebuff/index.js";
import { doctorCodegenInstructions, uninstallCodegenInstructions } from "../hosts/codegen/index.js";
import { doctorCoderAgentsSkill, uninstallCoderAgentsSkill } from "../hosts/coder-agents/index.js";
import { doctorCodeRabbitConfig, uninstallCodeRabbitConfig } from "../hosts/coderabbit/index.js";
import { doctorCodeBuddyHook, runCodeBuddyPreToolUseHook, uninstallCodeBuddyHook } from "../hosts/codebuddy/index.js";
import { doctorCommandCodeHook, runCommandCodePostToolUseHook, uninstallCommandCodeHook } from "../hosts/command-code/index.js";
import { doctorContinueRule, uninstallContinueRule } from "../hosts/continue/index.js";
import { doctorCodexHook, runCodexPostToolUseHook, uninstallCodexHook } from "../hosts/codex/index.js";
import { doctorCopilotAgentHook, runCopilotAgentPostToolUseHook, uninstallCopilotAgentHook } from "../hosts/copilot-agent/index.js";
import { doctorCopilotCliHook, getCopilotCliInstructionsSnippet, runCopilotCliPostToolUseHook, uninstallCopilotCliHook } from "../hosts/copilot-cli/index.js";
import { doctorCrushSkill, uninstallCrushSkill } from "../hosts/crush/index.js";
import { doctorCursorHook, runCursorPreToolUseHook, uninstallCursorHook } from "../hosts/cursor/index.js";
import { doctorDeepAgentsInstructions, uninstallDeepAgentsInstructions } from "../hosts/deepagents/index.js";
import { doctorDevinHook, runDevinPreToolUseHook, uninstallDevinHook } from "../hosts/devin/index.js";
import { doctorDotAgentsRule, uninstallDotAgentsRule } from "../hosts/dot-agents/index.js";
import { doctorDockerAgentPrompt, uninstallDockerAgentPrompt } from "../hosts/docker-agent/index.js";
import { doctorDroidHook, runDroidPostToolUseHook, uninstallDroidHook } from "../hosts/droid/index.js";
import { doctorEcaSkill, uninstallEcaSkill } from "../hosts/eca/index.js";
import { doctorElyraSkill, uninstallElyraSkill } from "../hosts/elyra/index.js";
import { doctorFirebaseStudioRule, uninstallFirebaseStudioRule } from "../hosts/firebase-studio/index.js";
import { doctorForgeCodeInstructions, uninstallForgeCodeInstructions } from "../hosts/forgecode/index.js";
import { doctorGeminiCliHook, runGeminiCliAfterToolHook, uninstallGeminiCliHook } from "../hosts/gemini-cli/index.js";
import { doctorGitLabDuoRule, uninstallGitLabDuoRule } from "../hosts/gitlab-duo/index.js";
import { doctorGooseHints, uninstallGooseHints } from "../hosts/goose/index.js";
import { doctorGreptileRule, uninstallGreptileRule } from "../hosts/greptile/index.js";
import { doctorGrokBuildInstructions, uninstallGrokBuildInstructions } from "../hosts/grok-build/index.js";
import { doctorGrokBotRule, uninstallGrokBotRule } from "../hosts/grok-bot/index.js";
import { doctorGrokCliHook, runGrokCliPostToolUseHook, uninstallGrokCliHook } from "../hosts/grok-cli/index.js";
import { doctorGptmeInstructions, uninstallGptmeInstructions } from "../hosts/gptme/index.js";
import { doctorJean2Instructions, uninstallJean2Instructions } from "../hosts/jean2/index.js";
import { doctorJetBrainsAiRule, uninstallJetBrainsAiRule } from "../hosts/jetbrains-ai/index.js";
import { doctorJunieInstructions, uninstallJunieInstructions } from "../hosts/junie/index.js";
import { doctorJulesInstructions, uninstallJulesInstructions } from "../hosts/jules/index.js";
import { doctorLeanCtlInstructions, uninstallLeanCtlInstructions } from "../hosts/leanctl/index.js";
import { doctorKimiHook, runKimiPostToolUseHook, uninstallKimiHook } from "../hosts/kimi/index.js";
import { doctorKiroSteering, uninstallKiroSteering } from "../hosts/kiro/index.js";
import { doctorKiloRule, uninstallKiloRule } from "../hosts/kilo/index.js";
import { doctorKnownsInstructions, uninstallKnownsInstructions } from "../hosts/knowns/index.js";
import { doctorLocalCodePlugin, uninstallLocalCodePlugin } from "../hosts/localcode/index.js";
import { doctorMcpAgentDefinition, uninstallMcpAgentDefinition } from "../hosts/mcp-agent/index.js";
import { doctorMiniSweAgentConfig, uninstallMiniSweAgentConfig } from "../hosts/mini-swe-agent/index.js";
import { doctorSweAgentConfig, uninstallSweAgentConfig } from "../hosts/swe-agent/index.js";
import { doctorStagewiseSkill, uninstallStagewiseSkill } from "../hosts/stagewise/index.js";
import { doctorMistralVibeInstructions, uninstallMistralVibeInstructions } from "../hosts/mistral-vibe/index.js";
import { doctorMuxHook, runMuxPostToolUseHook, uninstallMuxHook } from "../hosts/mux/index.js";
import { doctorNovaKitInstructions, uninstallNovaKitInstructions } from "../hosts/novakit/index.js";
import { doctorOnaSkill, uninstallOnaSkill } from "../hosts/ona/index.js";
import { doctorOpenCodeExtension, uninstallOpenCodeExtension } from "../hosts/opencode/index.js";
import { doctorOpenInterpreterInstructions, uninstallOpenInterpreterInstructions } from "../hosts/open-interpreter/index.js";
import { doctorOpenHandsHook, runOpenHandsPostToolUseHook, uninstallOpenHandsHook } from "../hosts/openhands/index.js";
import { doctorOpenWebUITool, uninstallOpenWebUITool } from "../hosts/openwebui/index.js";
import { doctorPiExtension, uninstallPiExtension } from "../hosts/pi/index.js";
import { doctorPiGoSkill, uninstallPiGoSkill } from "../hosts/pi-go/index.js";
import { doctorPlandexConvention, uninstallPlandexConvention } from "../hosts/plandex/index.js";
import { doctorQodoReviewConfig, uninstallQodoReviewConfig } from "../hosts/qodo/index.js";
import { doctorQoderInstructions, uninstallQoderInstructions } from "../hosts/qoder/index.js";
import { doctorQwenCodeHook, runQwenCodePostToolUseHook, uninstallQwenCodeHook } from "../hosts/qwen-code/index.js";
import { doctorReplitInstructions, uninstallReplitInstructions } from "../hosts/replit/index.js";
import { doctorRooInstructions, uninstallRooInstructions } from "../hosts/roo/index.js";
import { doctorRovoInstructions, uninstallRovoInstructions } from "../hosts/rovo/index.js";
import { doctorRulerRule, uninstallRulerRule } from "../hosts/ruler/index.js";
import { doctorTabbySystemPrompt, uninstallTabbySystemPrompt } from "../hosts/tabby/index.js";
import { doctorTabnineInstructions, uninstallTabnineInstructions } from "../hosts/tabnine/index.js";
import { doctorTraeRule, uninstallTraeRule } from "../hosts/trae/index.js";
import { doctorUiPathInstructions, uninstallUiPathInstructions } from "../hosts/uipath/index.js";
import {
  doctorVscodeCopilotHook,
  getVscodeCopilotInstructionsSnippet,
  runVscodeCopilotPreToolUseHook,
  uninstallVscodeCopilotHook,
} from "../hosts/vscode-copilot/index.js";
import { doctorWarpInstructions, uninstallWarpInstructions } from "../hosts/warp/index.js";
import { doctorWindsurfRule, uninstallWindsurfRule } from "../hosts/windsurf/index.js";
import { doctorZedInstructions, uninstallZedInstructions } from "../hosts/zed/index.js";
import { doctorZencoderRule, uninstallZencoderRule } from "../hosts/zencoder/index.js";
import { doctorInstalledHooks } from "../hosts/shared/hook-doctor.js";
import { shellQuote } from "../hosts/shared/hook-command.js";
import { formatHookDoctorReport } from "./doctor-output.js";
import type { Format, ParsedArgs } from "./command-types.js";
import { installCommands } from "./install-commands.js";

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
  emit(args.format, wrapped, inlineText, args.raw);
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

  if (target === "aictl") {
    const result = await uninstallAictlInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed aictl instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install aictl\n");
    return 0;
  }

  if (target === "ai-memory-protocol" || target === "aimemoryprotocol") {
    const result = await uninstallAiMemoryProtocolMemory();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed ai-memory-protocol memory: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`memory path: ${result.memoryPath}\n`);
    process.stdout.write(`rebuild: MEMORY_DIR=${shellQuote(dirname(dirname(result.memoryPath)))} memory rebuild\n`);
    process.stdout.write("enable: tokenjuice install ai-memory-protocol\n");
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

  if (target === "baz") {
    const result = await uninstallBazSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed baz skill: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`skill path: ${result.skillPath}\n`);
    process.stdout.write("enable: tokenjuice install baz\n");
    return 0;
  }

  if (target === "bito") {
    const result = await uninstallBitoGuidelines();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed bito custom guidelines: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`config path: ${result.configPath}\n`);
    process.stdout.write(`guidelines path: ${result.guidelinesPath}\n`);
    process.stdout.write("enable: tokenjuice install bito\n");
    return 0;
  }

  if (target === "blackbox") {
    const result = await uninstallBlackboxSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed blackbox skill: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`skill path: ${result.skillPath}\n`);
    process.stdout.write("enable: tokenjuice install blackbox\n");
    return 0;
  }

  if (target === "blocks") {
    const result = await uninstallBlocksSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed blocks skill: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`skill path: ${result.skillPath}\n`);
    process.stdout.write("enable: tokenjuice install blocks\n");
    return 0;
  }

  if (target === "clawdbot") {
    const result = await uninstallClawdbotSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed clawdbot skill: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`skill path: ${result.skillPath}\n`);
    process.stdout.write("enable: tokenjuice install clawdbot\n");
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

  if (target === "charlie") {
    const result = await uninstallCharlieInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed charlie instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install charlie\n");
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
    process.stdout.write(`writer: ${result.writer} (${result.fragmentId})\n`);
    if (result.backupPath) {
      process.stdout.write(`backup: ${result.backupPath}\n`);
    }
    process.stdout.write("enable: tokenjuice install codex\n");
    return 0;
  }

  if (target === "claude-code") {
    const result = await uninstallClaudeCodeHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed claude-code hook: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`settings path: ${result.settingsPath}\n`);
    if (result.backupPath) {
      process.stdout.write(`backup: ${result.backupPath}\n`);
    }
    process.stdout.write("enable: tokenjuice install claude-code\n");
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

  if (target === "codeant") {
    const result = await uninstallCodeAntInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed codeant instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install codeant\n");
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

  if (target === "coder-agents" || target === "coderagents") {
    const result = await uninstallCoderAgentsSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed coder-agents skill: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`skill path: ${result.skillPath}\n`);
    process.stdout.write("enable: tokenjuice install coder-agents\n");
    return 0;
  }

  if (target === "codebuddy") {
    const result = await uninstallCodeBuddyHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed codebuddy hook: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`settings path: ${result.settingsPath}\n`);
    if (result.backupPath) {
      process.stdout.write(`backup: ${result.backupPath}\n`);
    }
    process.stdout.write("enable: tokenjuice install codebuddy\n");
    return 0;
  }

  if (target === "command-code" || target === "commandcode") {
    const result = await uninstallCommandCodeHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed command-code entries: ${result.removed}\n`);
    process.stdout.write(`settings path: ${result.settingsPath}\n`);
    process.stdout.write("enable: tokenjuice install command-code\n");
    return 0;
  }

  if (target === "pi-go" || target === "pigo") {
    const result = await uninstallPiGoSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed pi-go skill: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`skill path: ${result.skillPath}\n`);
    process.stdout.write("enable: tokenjuice install pi-go\n");
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

  if (target === "cursor") {
    const result = await uninstallCursorHook();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed cursor hook: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`hooks path: ${result.hooksPath}\n`);
    if (result.backupPath) {
      process.stdout.write(`backup: ${result.backupPath}\n`);
    }
    process.stdout.write("enable: tokenjuice install cursor\n");
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

  if (target === "grok-bot" || target === "grokbot") {
    const result = await uninstallGrokBotRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed grok-bot rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write(`restored backup: ${result.restoredBackup ? "yes" : "no"}\n`);
    process.stdout.write("enable: tokenjuice install grok-bot\n");
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

  if (target === "greptile") {
    const result = await uninstallGreptileRule();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed greptile rule: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`rule path: ${result.rulePath}\n`);
    process.stdout.write("enable: tokenjuice install greptile\n");
    return 0;
  }

  if (target === "qodo") {
    const result = await uninstallQodoReviewConfig();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed qodo review config: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`config path: ${result.configPath}\n`);
    process.stdout.write("enable: tokenjuice install qodo\n");
    return 0;
  }

  if (target === "coderabbit") {
    const result = await uninstallCodeRabbitConfig();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed coderabbit review config: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`config path: ${result.configPath}\n`);
    process.stdout.write("enable: tokenjuice install coderabbit\n");
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

  if (target === "leanctl") {
    const result = await uninstallLeanCtlInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed leanctl instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install leanctl\n");
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

  if (target === "localcode" || target === "local-code") {
    const result = await uninstallLocalCodePlugin();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed localcode plugin: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`plugin dir: ${result.pluginDir}\n`);
    process.stdout.write(`manifest path: ${result.manifestPath}\n`);
    process.stdout.write(`entrypoint path: ${result.indexPath}\n`);
    process.stdout.write("enable: tokenjuice install localcode\n");
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

  if (target === "stagewise") {
    const result = await uninstallStagewiseSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed stagewise skill: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`skill path: ${result.skillPath}\n`);
    process.stdout.write("enable: tokenjuice install stagewise\n");
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

  if (target === "novakit") {
    const result = await uninstallNovaKitInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed novakit instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install novakit\n");
    return 0;
  }

  if (target === "knowns") {
    const result = await uninstallKnownsInstructions();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed knowns instructions: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
    process.stdout.write("enable: tokenjuice install knowns\n");
    return 0;
  }

  if (target === "ona") {
    const result = await uninstallOnaSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed ona skill: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`skill path: ${result.skillPath}\n`);
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

  if (target === "pi") {
    const result = await uninstallPiExtension();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed pi extension: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`extension path: ${result.extensionPath}\n`);
    if (result.backupPath) {
      process.stdout.write(`backup: ${result.backupPath}\n`);
    }
    if (result.restoredBackup) {
      process.stdout.write("restored backup: yes\n");
    }
    process.stdout.write("enable: tokenjuice install pi\n");
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

  if (target === "tabby") {
    const result = await uninstallTabbySystemPrompt();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed tabby system prompt: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`config path: ${result.configPath}\n`);
    process.stdout.write("enable: tokenjuice install tabby\n");
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

  if (target === "eca") {
    const result = await uninstallEcaSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed ECA skill: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`skill path: ${result.skillPath}\n`);
    process.stdout.write("enable: tokenjuice install eca\n");
    return 0;
  }

  if (target === "elyra") {
    const result = await uninstallElyraSkill();
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    process.stdout.write(`removed Elyra skill: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`skill path: ${result.skillPath}\n`);
    process.stdout.write("enable: tokenjuice install elyra\n");
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

  if (args.positionals[0] === "aictl") {
    const report = await doctorAictlInstructions();

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

  if (args.positionals[0] === "ai-memory-protocol" || args.positionals[0] === "aimemoryprotocol") {
    const report = await doctorAiMemoryProtocolMemory();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`memory path: ${report.memoryPath}\n`);
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

  if (args.positionals[0] === "baz") {
    const report = await doctorBazSkill();

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

  if (args.positionals[0] === "bito") {
    const report = await doctorBitoGuidelines();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`config path: ${report.configPath}\n`);
    process.stdout.write(`guidelines path: ${report.guidelinesPath}\n`);
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

  if (args.positionals[0] === "blackbox") {
    const report = await doctorBlackboxSkill();

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

  if (args.positionals[0] === "blocks") {
    const report = await doctorBlocksSkill();

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

  if (args.positionals[0] === "clawdbot") {
    const report = await doctorClawdbotSkill();

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

  if (args.positionals[0] === "charlie") {
    const report = await doctorCharlieInstructions();

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
    const report = await doctorCodexHook(undefined, {
      local: args.local,
      ...(args.noOmit ? { noOmit: true } : {}),
    });

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

  if (args.positionals[0] === "pi-go" || args.positionals[0] === "pigo") {
    const report = await doctorPiGoSkill();

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

  if (args.positionals[0] === "command-code" || args.positionals[0] === "commandcode") {
    const report = await doctorCommandCodeHook(undefined, { local: args.local });

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

  if (args.positionals[0] === "eca") {
    const report = await doctorEcaSkill();

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

  if (args.positionals[0] === "elyra") {
    const report = await doctorElyraSkill();

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

  if (args.positionals[0] === "grok-bot" || args.positionals[0] === "grokbot") {
    const report = await doctorGrokBotRule();

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

  if (args.positionals[0] === "greptile") {
    const report = await doctorGreptileRule();

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

  if (args.positionals[0] === "qodo") {
    const report = await doctorQodoReviewConfig();

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

  if (args.positionals[0] === "coderabbit") {
    const report = await doctorCodeRabbitConfig();

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

  if (args.positionals[0] === "leanctl") {
    const report = await doctorLeanCtlInstructions();

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

  if (args.positionals[0] === "localcode" || args.positionals[0] === "local-code") {
    const report = await doctorLocalCodePlugin();

    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.status === "broken" ? 1 : 0;
    }

    process.stdout.write(`plugin dir: ${report.pluginDir}\n`);
    process.stdout.write(`manifest path: ${report.manifestPath}\n`);
    process.stdout.write(`entrypoint path: ${report.indexPath}\n`);
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

  if (args.positionals[0] === "stagewise") {
    const report = await doctorStagewiseSkill();

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

  if (args.positionals[0] === "tabby") {
    const report = await doctorTabbySystemPrompt();

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

  if (args.positionals[0] === "novakit") {
    const report = await doctorNovaKitInstructions();

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

  if (args.positionals[0] === "knowns") {
    const report = await doctorKnownsInstructions();

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

  if (args.positionals[0] === "ona") {
    const report = await doctorOnaSkill();

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

  if (args.positionals[0] === "codeant") {
    const report = await doctorCodeAntInstructions();

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

  if (args.positionals[0] === "coder-agents" || args.positionals[0] === "coderagents") {
    const report = await doctorCoderAgentsSkill();

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
