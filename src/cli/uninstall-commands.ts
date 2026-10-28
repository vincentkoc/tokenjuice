// Per-target handlers for `tokenjuice uninstall <target>`.
// Each handler is keyed by the target name and its aliases in uninstallCommands.

import { dirname } from "node:path";
import { uninstallAdalInstructions } from "../hosts/adal/index.js";
import { uninstallAetherPrompt } from "../hosts/aether/index.js";
import { uninstallAictlInstructions } from "../hosts/aictl/index.js";
import { uninstallAiMemoryProtocolMemory } from "../hosts/ai-memory-protocol/index.js";
import { uninstallAgentLayerInstructions } from "../hosts/agent-layer/index.js";
import { uninstallAgentInitInstructions } from "../hosts/agentinit/index.js";
import { uninstallAgentlinkInstructions } from "../hosts/agentlink/index.js";
import { uninstallAgentloomRule } from "../hosts/agentloom/index.js";
import { uninstallAgentsCliMemory } from "../hosts/agents-cli/index.js";
import { uninstallAgentsMdInstructions } from "../hosts/agents-md/index.js";
import { uninstallAgentsGeRule } from "../hosts/agentsge/index.js";
import { uninstallAgentsMeshRule } from "../hosts/agentsmesh/index.js";
import { uninstallAmazonQRule } from "../hosts/amazon-q/index.js";
import { uninstallAmpInstructions } from "../hosts/amp/index.js";
import { uninstallAiderConvention } from "../hosts/aider/index.js";
import { uninstallAntigravityRule } from "../hosts/antigravity/index.js";
import { uninstallAnywhereAgentsInstructions } from "../hosts/anywhere-agents/index.js";
import { uninstallAugmentRule } from "../hosts/augment/index.js";
import { uninstallAvanteInstructions } from "../hosts/avante/index.js";
import { uninstallBazSkill } from "../hosts/baz/index.js";
import { uninstallBitoGuidelines } from "../hosts/bito/index.js";
import { uninstallBlackboxSkill } from "../hosts/blackbox/index.js";
import { uninstallBlocksSkill } from "../hosts/blocks/index.js";
import { uninstallClawdbotSkill } from "../hosts/clawdbot/index.js";
import { uninstallBobInstructions } from "../hosts/bob/index.js";
import { uninstallBuilderRule } from "../hosts/builder/index.js";
import { uninstallCharlieInstructions } from "../hosts/charlie/index.js";
import { uninstallClaudeCodeHook } from "../hosts/claude-code/index.js";
import { uninstallClineHook } from "../hosts/cline/index.js";
import { uninstallCodeAntInstructions } from "../hosts/codeant/index.js";
import { uninstallCodebuffInstructions } from "../hosts/codebuff/index.js";
import { uninstallCodegenInstructions } from "../hosts/codegen/index.js";
import { uninstallCoderAgentsSkill } from "../hosts/coder-agents/index.js";
import { uninstallCodeRabbitConfig } from "../hosts/coderabbit/index.js";
import { uninstallCodeBuddyHook } from "../hosts/codebuddy/index.js";
import { uninstallCommandCodeHook } from "../hosts/command-code/index.js";
import { uninstallContinueRule } from "../hosts/continue/index.js";
import { uninstallCodexHook } from "../hosts/codex/index.js";
import { uninstallCopilotAgentHook } from "../hosts/copilot-agent/index.js";
import { uninstallCopilotCliHook } from "../hosts/copilot-cli/index.js";
import { uninstallCrushSkill } from "../hosts/crush/index.js";
import { uninstallCursorHook } from "../hosts/cursor/index.js";
import { uninstallDeepAgentsInstructions } from "../hosts/deepagents/index.js";
import { uninstallDevinHook } from "../hosts/devin/index.js";
import { uninstallDotAgentsRule } from "../hosts/dot-agents/index.js";
import { uninstallDockerAgentPrompt } from "../hosts/docker-agent/index.js";
import { uninstallDroidHook } from "../hosts/droid/index.js";
import { uninstallEcaSkill } from "../hosts/eca/index.js";
import { uninstallElyraSkill } from "../hosts/elyra/index.js";
import { uninstallFirebaseStudioRule } from "../hosts/firebase-studio/index.js";
import { uninstallForgeCodeInstructions } from "../hosts/forgecode/index.js";
import { uninstallGeminiCliHook } from "../hosts/gemini-cli/index.js";
import { uninstallGitLabDuoRule } from "../hosts/gitlab-duo/index.js";
import { uninstallGooseHints } from "../hosts/goose/index.js";
import { uninstallGreptileRule } from "../hosts/greptile/index.js";
import { uninstallGrokBuildInstructions } from "../hosts/grok-build/index.js";
import { uninstallGrokBotRule } from "../hosts/grok-bot/index.js";
import { uninstallGrokCliHook } from "../hosts/grok-cli/index.js";
import { uninstallGptmeInstructions } from "../hosts/gptme/index.js";
import { uninstallJean2Instructions } from "../hosts/jean2/index.js";
import { uninstallJetBrainsAiRule } from "../hosts/jetbrains-ai/index.js";
import { uninstallJunieInstructions } from "../hosts/junie/index.js";
import { uninstallJulesInstructions } from "../hosts/jules/index.js";
import { uninstallLeanCtlInstructions } from "../hosts/leanctl/index.js";
import { uninstallKimiHook } from "../hosts/kimi/index.js";
import { uninstallKiroSteering } from "../hosts/kiro/index.js";
import { uninstallKiloRule } from "../hosts/kilo/index.js";
import { uninstallKnownsInstructions } from "../hosts/knowns/index.js";
import { uninstallLocalCodePlugin } from "../hosts/localcode/index.js";
import { uninstallMcpAgentDefinition } from "../hosts/mcp-agent/index.js";
import { uninstallMiniSweAgentConfig } from "../hosts/mini-swe-agent/index.js";
import { uninstallSweAgentConfig } from "../hosts/swe-agent/index.js";
import { uninstallStagewiseSkill } from "../hosts/stagewise/index.js";
import { uninstallMistralVibeInstructions } from "../hosts/mistral-vibe/index.js";
import { uninstallMuxHook } from "../hosts/mux/index.js";
import { uninstallNovaKitInstructions } from "../hosts/novakit/index.js";
import { uninstallOnaSkill } from "../hosts/ona/index.js";
import { uninstallOpenCodeExtension } from "../hosts/opencode/index.js";
import { uninstallOpenInterpreterInstructions } from "../hosts/open-interpreter/index.js";
import { uninstallOpenHandsHook } from "../hosts/openhands/index.js";
import { uninstallOpenWebUITool } from "../hosts/openwebui/index.js";
import { uninstallPiExtension } from "../hosts/pi/index.js";
import { uninstallPiGoSkill } from "../hosts/pi-go/index.js";
import { uninstallPlandexConvention } from "../hosts/plandex/index.js";
import { uninstallQodoReviewConfig } from "../hosts/qodo/index.js";
import { uninstallQoderInstructions } from "../hosts/qoder/index.js";
import { uninstallQwenCodeHook } from "../hosts/qwen-code/index.js";
import { uninstallReplitInstructions } from "../hosts/replit/index.js";
import { uninstallRooInstructions } from "../hosts/roo/index.js";
import { uninstallRovoInstructions } from "../hosts/rovo/index.js";
import { uninstallRulerRule } from "../hosts/ruler/index.js";
import { uninstallTabbySystemPrompt } from "../hosts/tabby/index.js";
import { uninstallTabnineInstructions } from "../hosts/tabnine/index.js";
import { uninstallTraeRule } from "../hosts/trae/index.js";
import { uninstallUiPathInstructions } from "../hosts/uipath/index.js";
import { uninstallVscodeCopilotHook } from "../hosts/vscode-copilot/index.js";
import { uninstallWarpInstructions } from "../hosts/warp/index.js";
import { uninstallWindsurfRule } from "../hosts/windsurf/index.js";
import { uninstallZedInstructions } from "../hosts/zed/index.js";
import { uninstallZencoderRule } from "../hosts/zencoder/index.js";
import { shellQuote } from "../hosts/shared/hook-command.js";
import type { HostCommandHandler, ParsedArgs } from "./command-types.js";

async function uninstallAdalCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAetherCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAiderCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAictlCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAiMemoryProtocolCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAgentLayerCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAgentinitCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAgentlinkCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAgentloomCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAgentsCliCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAgentsMdCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAgentsgeCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAgentsmeshCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAmazonQCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAmpCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAntigravityCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAnywhereAgentsCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAugmentCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallAvanteCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallBazCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallBitoCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallBlackboxCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallBlocksCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallClawdbotCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallBobCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallBuilderCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCharlieCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCodexCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallClaudeCodeCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallClineCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCodeantCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCodebuffCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCodegenCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCoderAgentsCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCodebuddyCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCommandCodeCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallPiGoCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallContinueCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCopilotAgentCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCrushCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCursorCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallFirebaseStudioCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallForgecodeCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallGeminiCliCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallGitlabDuoCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallGrokCliCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallGptmeCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallJean2Command(args: ParsedArgs): Promise<number> {
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

async function uninstallGrokBuildCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallGrokBotCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallGooseCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallGreptileCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallQodoCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCoderabbitCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallJetbrainsAiCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallJunieCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallJulesCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallLeanctlCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallKimiCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallLocalcodeCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallKiroCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallKiloCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallMistralVibeCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallMcpAgentCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallMiniSweAgentCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallSweAgentCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallStagewiseCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallMuxCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallNovakitCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallKnownsCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallOnaCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallWarpCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallOpenhandsCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallOpenInterpreterCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallOpenwebuiCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallPiCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallOpencodeCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallPlandexCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallQoderCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallReplitCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallQwenCodeCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallRooCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallRovoCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallRulerCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallTabnineCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallTabbyCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallTraeCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallUipathCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallVscodeCopilotCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallWindsurfCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallCopilotCliCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallDeepagentsCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallDevinCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallDotAgentsCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallDockerAgentCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallEcaCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallElyraCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallDroidCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallZedCommand(args: ParsedArgs): Promise<number> {
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

async function uninstallZencoderCommand(args: ParsedArgs): Promise<number> {
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

export const uninstallCommands: ReadonlyMap<string, HostCommandHandler> = new Map<string, HostCommandHandler>([
  ["adal", uninstallAdalCommand],
  ["aether", uninstallAetherCommand],
  ["aider", uninstallAiderCommand],
  ["aictl", uninstallAictlCommand],
  ["ai-memory-protocol", uninstallAiMemoryProtocolCommand],
  ["aimemoryprotocol", uninstallAiMemoryProtocolCommand],
  ["agent-layer", uninstallAgentLayerCommand],
  ["agentinit", uninstallAgentinitCommand],
  ["agent-init", uninstallAgentinitCommand],
  ["agentlink", uninstallAgentlinkCommand],
  ["agentloom", uninstallAgentloomCommand],
  ["agents-cli", uninstallAgentsCliCommand],
  ["agents-md", uninstallAgentsMdCommand],
  ["agentsmd", uninstallAgentsMdCommand],
  ["agentsge", uninstallAgentsgeCommand],
  ["agentsmesh", uninstallAgentsmeshCommand],
  ["amazon-q", uninstallAmazonQCommand],
  ["amp", uninstallAmpCommand],
  ["antigravity", uninstallAntigravityCommand],
  ["anywhere-agents", uninstallAnywhereAgentsCommand],
  ["augment", uninstallAugmentCommand],
  ["avante", uninstallAvanteCommand],
  ["baz", uninstallBazCommand],
  ["bito", uninstallBitoCommand],
  ["blackbox", uninstallBlackboxCommand],
  ["blocks", uninstallBlocksCommand],
  ["clawdbot", uninstallClawdbotCommand],
  ["bob", uninstallBobCommand],
  ["builder", uninstallBuilderCommand],
  ["charlie", uninstallCharlieCommand],
  ["codex", uninstallCodexCommand],
  ["claude-code", uninstallClaudeCodeCommand],
  ["cline", uninstallClineCommand],
  ["codeant", uninstallCodeantCommand],
  ["codebuff", uninstallCodebuffCommand],
  ["codegen", uninstallCodegenCommand],
  ["coder-agents", uninstallCoderAgentsCommand],
  ["coderagents", uninstallCoderAgentsCommand],
  ["codebuddy", uninstallCodebuddyCommand],
  ["command-code", uninstallCommandCodeCommand],
  ["commandcode", uninstallCommandCodeCommand],
  ["pi-go", uninstallPiGoCommand],
  ["pigo", uninstallPiGoCommand],
  ["continue", uninstallContinueCommand],
  ["copilot-agent", uninstallCopilotAgentCommand],
  ["crush", uninstallCrushCommand],
  ["cursor", uninstallCursorCommand],
  ["firebase-studio", uninstallFirebaseStudioCommand],
  ["forgecode", uninstallForgecodeCommand],
  ["forge-code", uninstallForgecodeCommand],
  ["gemini-cli", uninstallGeminiCliCommand],
  ["gitlab-duo", uninstallGitlabDuoCommand],
  ["grok-cli", uninstallGrokCliCommand],
  ["gptme", uninstallGptmeCommand],
  ["jean2", uninstallJean2Command],
  ["grok-build", uninstallGrokBuildCommand],
  ["grok-bot", uninstallGrokBotCommand],
  ["grokbot", uninstallGrokBotCommand],
  ["goose", uninstallGooseCommand],
  ["greptile", uninstallGreptileCommand],
  ["qodo", uninstallQodoCommand],
  ["coderabbit", uninstallCoderabbitCommand],
  ["jetbrains-ai", uninstallJetbrainsAiCommand],
  ["junie", uninstallJunieCommand],
  ["jules", uninstallJulesCommand],
  ["leanctl", uninstallLeanctlCommand],
  ["kimi", uninstallKimiCommand],
  ["localcode", uninstallLocalcodeCommand],
  ["local-code", uninstallLocalcodeCommand],
  ["kiro", uninstallKiroCommand],
  ["kilo", uninstallKiloCommand],
  ["mistral-vibe", uninstallMistralVibeCommand],
  ["mistralvibe", uninstallMistralVibeCommand],
  ["mcp-agent", uninstallMcpAgentCommand],
  ["mcpagent", uninstallMcpAgentCommand],
  ["mini-swe-agent", uninstallMiniSweAgentCommand],
  ["mini-sweagent", uninstallMiniSweAgentCommand],
  ["swe-agent", uninstallSweAgentCommand],
  ["sweagent", uninstallSweAgentCommand],
  ["stagewise", uninstallStagewiseCommand],
  ["mux", uninstallMuxCommand],
  ["novakit", uninstallNovakitCommand],
  ["knowns", uninstallKnownsCommand],
  ["ona", uninstallOnaCommand],
  ["warp", uninstallWarpCommand],
  ["openhands", uninstallOpenhandsCommand],
  ["open-interpreter", uninstallOpenInterpreterCommand],
  ["openinterpreter", uninstallOpenInterpreterCommand],
  ["openwebui", uninstallOpenwebuiCommand],
  ["pi", uninstallPiCommand],
  ["opencode", uninstallOpencodeCommand],
  ["plandex", uninstallPlandexCommand],
  ["qoder", uninstallQoderCommand],
  ["replit", uninstallReplitCommand],
  ["replit-agent", uninstallReplitCommand],
  ["qwen-code", uninstallQwenCodeCommand],
  ["roo", uninstallRooCommand],
  ["rovo", uninstallRovoCommand],
  ["rovo-dev", uninstallRovoCommand],
  ["ruler", uninstallRulerCommand],
  ["tabnine", uninstallTabnineCommand],
  ["tabby", uninstallTabbyCommand],
  ["trae", uninstallTraeCommand],
  ["uipath", uninstallUipathCommand],
  ["vscode-copilot", uninstallVscodeCopilotCommand],
  ["windsurf", uninstallWindsurfCommand],
  ["copilot-cli", uninstallCopilotCliCommand],
  ["deepagents", uninstallDeepagentsCommand],
  ["devin", uninstallDevinCommand],
  ["dot-agents", uninstallDotAgentsCommand],
  ["docker-agent", uninstallDockerAgentCommand],
  ["dockeragent", uninstallDockerAgentCommand],
  ["cagent", uninstallDockerAgentCommand],
  ["eca", uninstallEcaCommand],
  ["elyra", uninstallElyraCommand],
  ["droid", uninstallDroidCommand],
  ["zed", uninstallZedCommand],
  ["zencoder", uninstallZencoderCommand],
]);
