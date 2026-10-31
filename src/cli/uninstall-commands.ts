import { uninstallQoderHook } from "../hosts/qoder/hook-install.js";
import { uninstallQwenWorkSkill } from "../hosts/qwenwork/index.js";
import { uninstallQoderWorkSkill } from "../hosts/qoderwork/index.js";
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
import { uninstallAnteInstructions } from "../hosts/ante/index.js";
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
import { createHostCommand } from "./host-command.js";
import type { HostCommandHandler } from "./command-types.js";

const uninstallAdalCommand = createHostCommand(() => uninstallAdalInstructions(), (result) => {
  process.stdout.write(`removed adal instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install adal\n");
});

const uninstallAetherCommand = createHostCommand(() => uninstallAetherPrompt(), (result) => {
  process.stdout.write(`removed aether prompt: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`prompt path: ${result.promptPath}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  process.stdout.write(`prompt refs removed: ${result.promptsRemoved}\n`);
  process.stdout.write("enable: tokenjuice install aether\n");
});

const uninstallAiderCommand = createHostCommand(() => uninstallAiderConvention(), (result) => {
  process.stdout.write(`removed aider convention: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`convention path: ${result.conventionPath}\n`);
  process.stdout.write("enable: tokenjuice install aider\n");
});

const uninstallAictlCommand = createHostCommand(() => uninstallAictlInstructions(), (result) => {
  process.stdout.write(`removed aictl instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install aictl\n");
});

const uninstallAiMemoryProtocolCommand = createHostCommand(() => uninstallAiMemoryProtocolMemory(), (result) => {
  process.stdout.write(`removed ai-memory-protocol memory: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`memory path: ${result.memoryPath}\n`);
  process.stdout.write(`rebuild: MEMORY_DIR=${shellQuote(dirname(dirname(result.memoryPath)))} memory rebuild\n`);
  process.stdout.write("enable: tokenjuice install ai-memory-protocol\n");
});

const uninstallAgentLayerCommand = createHostCommand(() => uninstallAgentLayerInstructions(), (result) => {
  process.stdout.write(`removed agent-layer instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write(`sync: ${result.syncCommand}\n`);
  process.stdout.write("enable: tokenjuice install agent-layer\n");
});

const uninstallAgentinitCommand = createHostCommand(() => uninstallAgentInitInstructions(), (result) => {
  process.stdout.write(`removed agentinit instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write(`sync: ${result.syncCommand}\n`);
  process.stdout.write("enable: tokenjuice install agentinit\n");
});

const uninstallAgentlinkCommand = createHostCommand(() => uninstallAgentlinkInstructions(), (result) => {
  process.stdout.write(`removed agentlink instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write(`sync: ${result.syncCommand}\n`);
  process.stdout.write("enable: tokenjuice install agentlink\n");
});

const uninstallAgentloomCommand = createHostCommand(() => uninstallAgentloomRule(), (result) => {
  process.stdout.write(`removed agentloom rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write(`sync: ${result.syncCommand}\n`);
  process.stdout.write("enable: tokenjuice install agentloom\n");
});

const uninstallAgentsCliCommand = createHostCommand(() => uninstallAgentsCliMemory(), (result) => {
  process.stdout.write(`removed agents-cli memory: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`memory path: ${result.instructionsPath}\n`);
  process.stdout.write(`sync: ${result.syncCommand}\n`);
  process.stdout.write("enable: tokenjuice install agents-cli\n");
});

const uninstallAgentsMdCommand = createHostCommand(() => uninstallAgentsMdInstructions(), (result) => {
  process.stdout.write(`removed agents-md instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install agents-md\n");
});

const uninstallAgentsgeCommand = createHostCommand(() => uninstallAgentsGeRule(), (result) => {
  process.stdout.write(`removed agentsge rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install agentsge\n");
});

const uninstallAgentsmeshCommand = createHostCommand(() => uninstallAgentsMeshRule(), (result) => {
  process.stdout.write(`removed agentsmesh rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write(`generate: ${result.syncCommand}\n`);
  process.stdout.write("enable: tokenjuice install agentsmesh\n");
});

const uninstallAmazonQCommand = createHostCommand(() => uninstallAmazonQRule(), (result) => {
  process.stdout.write(`removed amazon-q rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install amazon-q\n");
});

const uninstallAmpCommand = createHostCommand(() => uninstallAmpInstructions(), (result) => {
  process.stdout.write(`removed amp instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  if (result.removedPaths && result.removedPaths.length > 1) {
    process.stdout.write("removed paths:\n");
    for (const path of result.removedPaths) {
      process.stdout.write(`- ${path}\n`);
    }
  }
  process.stdout.write("enable: tokenjuice install amp\n");
});

const uninstallAntigravityCommand = createHostCommand(() => uninstallAntigravityRule(), (result) => {
  process.stdout.write(`removed antigravity rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install antigravity\n");
});

const uninstallAnywhereAgentsCommand = createHostCommand(() => uninstallAnywhereAgentsInstructions(), (result) => {
  process.stdout.write(`removed anywhere-agents instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write(`sync: ${result.syncCommand}\n`);
  process.stdout.write("enable: tokenjuice install anywhere-agents\n");
});

const uninstallAugmentCommand = createHostCommand(() => uninstallAugmentRule(), (result) => {
  process.stdout.write(`removed augment rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install augment\n");
});

const uninstallAvanteCommand = createHostCommand(() => uninstallAvanteInstructions(), (result) => {
  process.stdout.write(`removed avante instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install avante\n");
});

const uninstallBazCommand = createHostCommand(() => uninstallBazSkill(), (result) => {
  process.stdout.write(`removed baz skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
  process.stdout.write("enable: tokenjuice install baz\n");
});

const uninstallBitoCommand = createHostCommand(() => uninstallBitoGuidelines(), (result) => {
  process.stdout.write(`removed bito custom guidelines: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`config path: ${result.configPath}\n`);
  process.stdout.write(`guidelines path: ${result.guidelinesPath}\n`);
  process.stdout.write("enable: tokenjuice install bito\n");
});

const uninstallBlackboxCommand = createHostCommand(() => uninstallBlackboxSkill(), (result) => {
  process.stdout.write(`removed blackbox skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
  process.stdout.write("enable: tokenjuice install blackbox\n");
});

const uninstallBlocksCommand = createHostCommand(() => uninstallBlocksSkill(), (result) => {
  process.stdout.write(`removed blocks skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
  process.stdout.write("enable: tokenjuice install blocks\n");
});

const uninstallClawdbotCommand = createHostCommand(() => uninstallClawdbotSkill(), (result) => {
  process.stdout.write(`removed clawdbot skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
  process.stdout.write("enable: tokenjuice install clawdbot\n");
});

const uninstallBobCommand = createHostCommand(() => uninstallBobInstructions(), (result) => {
  process.stdout.write(`removed bob instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install bob\n");
});

const uninstallBuilderCommand = createHostCommand(() => uninstallBuilderRule(), (result) => {
  process.stdout.write(`removed builder rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install builder\n");
});

const uninstallCharlieCommand = createHostCommand(() => uninstallCharlieInstructions(), (result) => {
  process.stdout.write(`removed charlie instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install charlie\n");
});

const uninstallCodexCommand = createHostCommand(() => uninstallCodexHook(), (result) => {
  process.stdout.write(`removed codex hook: ${result.hooksPath}\n`);
  process.stdout.write(`removed entries: ${result.removed}\n`);
  process.stdout.write(`writer: ${result.writer} (${result.fragmentId})\n`);
  if (result.backupPath) {
    process.stdout.write(`backup: ${result.backupPath}\n`);
  }
  process.stdout.write("enable: tokenjuice install codex\n");
});

const uninstallClaudeCodeCommand = createHostCommand(() => uninstallClaudeCodeHook(), (result) => {
  process.stdout.write(`removed claude-code hook: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  if (result.backupPath) {
    process.stdout.write(`backup: ${result.backupPath}\n`);
  }
  process.stdout.write("enable: tokenjuice install claude-code\n");
});

const uninstallClineCommand = createHostCommand(() => uninstallClineHook(), (result) => {
  process.stdout.write(`removed cline hook: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`hook path: ${result.hookPath}\n`);
  process.stdout.write("enable: tokenjuice install cline\n");
});

const uninstallCodeantCommand = createHostCommand(() => uninstallCodeAntInstructions(), (result) => {
  process.stdout.write(`removed codeant instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install codeant\n");
});

const uninstallCodebuffCommand = createHostCommand(() => uninstallCodebuffInstructions(), (result) => {
  process.stdout.write(`removed codebuff instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install codebuff\n");
});

const uninstallCodegenCommand = createHostCommand(() => uninstallCodegenInstructions(), (result) => {
  process.stdout.write(`removed codegen instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install codegen\n");
});

const uninstallCoderAgentsCommand = createHostCommand(() => uninstallCoderAgentsSkill(), (result) => {
  process.stdout.write(`removed coder-agents skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
  process.stdout.write("enable: tokenjuice install coder-agents\n");
});

const uninstallCodebuddyCommand = createHostCommand(() => uninstallCodeBuddyHook(), (result) => {
  process.stdout.write(`removed codebuddy hook: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  if (result.backupPath) {
    process.stdout.write(`backup: ${result.backupPath}\n`);
  }
  process.stdout.write("enable: tokenjuice install codebuddy\n");
});

const uninstallCommandCodeCommand = createHostCommand(() => uninstallCommandCodeHook(), (result) => {
  process.stdout.write(`removed command-code entries: ${result.removed}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  process.stdout.write("enable: tokenjuice install command-code\n");
});

const uninstallPiGoCommand = createHostCommand(() => uninstallPiGoSkill(), (result) => {
  process.stdout.write(`removed pi-go skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
  process.stdout.write("enable: tokenjuice install pi-go\n");
});

const uninstallContinueCommand = createHostCommand(() => uninstallContinueRule(), (result) => {
  process.stdout.write(`removed continue rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install continue\n");
});

const uninstallCopilotAgentCommand = createHostCommand(() => uninstallCopilotAgentHook(), (result) => {
  process.stdout.write(`removed copilot-agent entries: ${result.removed}\n`);
  process.stdout.write(`hook path: ${result.hooksPath}\n`);
  if (result.deletedFile) {
    process.stdout.write("deleted empty hook file: yes\n");
  }
  process.stdout.write("enable: tokenjuice install copilot-agent\n");
});

const uninstallCrushCommand = createHostCommand(() => uninstallCrushSkill(), (result) => {
  process.stdout.write(`removed crush skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
  process.stdout.write("enable: tokenjuice install crush\n");
});

const uninstallCursorCommand = createHostCommand(() => uninstallCursorHook(), (result) => {
  process.stdout.write(`removed cursor hook: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`hooks path: ${result.hooksPath}\n`);
  if (result.backupPath) {
    process.stdout.write(`backup: ${result.backupPath}\n`);
  }
  process.stdout.write("enable: tokenjuice install cursor\n");
});

const uninstallFirebaseStudioCommand = createHostCommand(() => uninstallFirebaseStudioRule(), (result) => {
  process.stdout.write(`removed firebase-studio rules: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rules path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install firebase-studio\n");
});

const uninstallForgecodeCommand = createHostCommand(() => uninstallForgeCodeInstructions(), (result) => {
  process.stdout.write(`removed forgecode instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install forgecode\n");
});

const uninstallGeminiCliCommand = createHostCommand(() => uninstallGeminiCliHook(), (result) => {
  process.stdout.write(`removed gemini-cli entries: ${result.removed}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  process.stdout.write("enable: tokenjuice install gemini-cli\n");
});

const uninstallGitlabDuoCommand = createHostCommand(() => uninstallGitLabDuoRule(), (result) => {
  process.stdout.write(`removed gitlab-duo rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install gitlab-duo\n");
});

const uninstallGrokCliCommand = createHostCommand(() => uninstallGrokCliHook(), (result) => {
  process.stdout.write(`removed grok-cli entries: ${result.removed}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  process.stdout.write("enable: tokenjuice install grok-cli\n");
});

const uninstallGptmeCommand = createHostCommand(() => uninstallGptmeInstructions(), (result) => {
  process.stdout.write(`removed gptme instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install gptme\n");
});

const uninstallJean2Command = createHostCommand(() => uninstallJean2Instructions(), (result) => {
  process.stdout.write(`removed jean2 instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install jean2\n");
});

const uninstallGrokBuildCommand = createHostCommand(() => uninstallGrokBuildInstructions(), (result) => {
  process.stdout.write(`removed grok-build instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install grok-build\n");
});

const uninstallGrokBotCommand = createHostCommand(() => uninstallGrokBotRule(), (result) => {
  process.stdout.write(`removed grok-bot rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write(`restored backup: ${result.restoredBackup ? "yes" : "no"}\n`);
  process.stdout.write("enable: tokenjuice install grok-bot\n");
});

const uninstallGooseCommand = createHostCommand(() => uninstallGooseHints(), (result) => {
  process.stdout.write(`removed goose hints: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`hints path: ${result.hintsPath}\n`);
  process.stdout.write("enable: tokenjuice install goose\n");
});

const uninstallGreptileCommand = createHostCommand(() => uninstallGreptileRule(), (result) => {
  process.stdout.write(`removed greptile rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install greptile\n");
});

const uninstallQodoCommand = createHostCommand(() => uninstallQodoReviewConfig(), (result) => {
  process.stdout.write(`removed qodo review config: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`config path: ${result.configPath}\n`);
  process.stdout.write("enable: tokenjuice install qodo\n");
});

const uninstallCoderabbitCommand = createHostCommand(() => uninstallCodeRabbitConfig(), (result) => {
  process.stdout.write(`removed coderabbit review config: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`config path: ${result.configPath}\n`);
  process.stdout.write("enable: tokenjuice install coderabbit\n");
});

const uninstallJetbrainsAiCommand = createHostCommand(() => uninstallJetBrainsAiRule(), (result) => {
  process.stdout.write(`removed jetbrains-ai rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install jetbrains-ai\n");
});

const uninstallJunieCommand = createHostCommand(() => uninstallJunieInstructions(), (result) => {
  process.stdout.write(`removed junie instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install junie\n");
});

const uninstallJulesCommand = createHostCommand(() => uninstallJulesInstructions(), (result) => {
  process.stdout.write(`removed jules instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install jules\n");
});

const uninstallLeanctlCommand = createHostCommand(() => uninstallLeanCtlInstructions(), (result) => {
  process.stdout.write(`removed leanctl instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install leanctl\n");
});

const uninstallKimiCommand = createHostCommand(() => uninstallKimiHook(), (result) => {
  process.stdout.write(`removed kimi entries: ${result.removed}\n`);
  process.stdout.write(`config path: ${result.configPath}\n`);
  process.stdout.write("enable: tokenjuice install kimi\n");
});

const uninstallLocalcodeCommand = createHostCommand(() => uninstallLocalCodePlugin(), (result) => {
  process.stdout.write(`removed localcode plugin: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`plugin dir: ${result.pluginDir}\n`);
  process.stdout.write(`manifest path: ${result.manifestPath}\n`);
  process.stdout.write(`entrypoint path: ${result.indexPath}\n`);
  process.stdout.write("enable: tokenjuice install localcode\n");
});

const uninstallKiroCommand = createHostCommand(() => uninstallKiroSteering(), (result) => {
  process.stdout.write(`removed kiro steering: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`steering path: ${result.steeringPath}\n`);
  process.stdout.write("enable: tokenjuice install kiro\n");
});

const uninstallKiloCommand = createHostCommand(() => uninstallKiloRule(), (result) => {
  process.stdout.write(`removed kilo rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write(`config path: ${result.configPath}\n`);
  process.stdout.write(`removed kilo config entry: ${result.configUpdated ? "yes" : "no"}\n`);
  process.stdout.write("enable: tokenjuice install kilo\n");
});

const uninstallMistralVibeCommand = createHostCommand(() => uninstallMistralVibeInstructions(), (result) => {
  process.stdout.write(`removed mistral-vibe instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install mistral-vibe\n");
});

const uninstallMcpAgentCommand = createHostCommand(() => uninstallMcpAgentDefinition(), (result) => {
  process.stdout.write(`removed mcp-agent definition: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`agent path: ${result.agentPath}\n`);
  process.stdout.write("enable: tokenjuice install mcp-agent\n");
});

const uninstallMiniSweAgentCommand = createHostCommand(() => uninstallMiniSweAgentConfig(), (result) => {
  process.stdout.write(`removed mini-swe-agent config: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`config path: ${result.configPath}\n`);
  process.stdout.write("enable: tokenjuice install mini-swe-agent\n");
});

const uninstallSweAgentCommand = createHostCommand(() => uninstallSweAgentConfig(), (result) => {
  process.stdout.write(`removed swe-agent config: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`config path: ${result.configPath}\n`);
  process.stdout.write("enable: tokenjuice install swe-agent\n");
});

const uninstallStagewiseCommand = createHostCommand(() => uninstallStagewiseSkill(), (result) => {
  process.stdout.write(`removed stagewise skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
  process.stdout.write("enable: tokenjuice install stagewise\n");
});

const uninstallMuxCommand = createHostCommand(() => uninstallMuxHook(), (result) => {
  process.stdout.write(`removed mux hook: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`hook path: ${result.hookPath}\n`);
  process.stdout.write("enable: tokenjuice install mux\n");
});

const uninstallNovakitCommand = createHostCommand(() => uninstallNovaKitInstructions(), (result) => {
  process.stdout.write(`removed novakit instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install novakit\n");
});

const uninstallKnownsCommand = createHostCommand(() => uninstallKnownsInstructions(), (result) => {
  process.stdout.write(`removed knowns instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install knowns\n");
});

const uninstallOnaCommand = createHostCommand(() => uninstallOnaSkill(), (result) => {
  process.stdout.write(`removed ona skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
  process.stdout.write("enable: tokenjuice install ona\n");
});

const uninstallWarpCommand = createHostCommand(() => uninstallWarpInstructions(), (result) => {
  process.stdout.write(`removed warp instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install warp\n");
});

const uninstallOpenhandsCommand = createHostCommand(() => uninstallOpenHandsHook(), (result) => {
  process.stdout.write(`removed openhands entries: ${result.removed}\n`);
  process.stdout.write(`hooks path: ${result.hooksPath}\n`);
  process.stdout.write("enable: tokenjuice install openhands\n");
});

const uninstallOpenInterpreterCommand = createHostCommand(() => uninstallOpenInterpreterInstructions(), (result) => {
  process.stdout.write(`removed open-interpreter instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install open-interpreter\n");
});

const uninstallOpenwebuiCommand = createHostCommand(() => uninstallOpenWebUITool(), (result) => {
  process.stdout.write(`removed openwebui tool source: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`tool path: ${result.toolPath}\n`);
  process.stdout.write("enable: tokenjuice install openwebui\n");
});

const uninstallPiCommand = createHostCommand(() => uninstallPiExtension(), (result) => {
  process.stdout.write(`removed pi extension: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`extension path: ${result.extensionPath}\n`);
  if (result.backupPath) {
    process.stdout.write(`backup: ${result.backupPath}\n`);
  }
  if (result.restoredBackup) {
    process.stdout.write("restored backup: yes\n");
  }
  process.stdout.write("enable: tokenjuice install pi\n");
});

const uninstallOpencodeCommand = createHostCommand(() => uninstallOpenCodeExtension(), (result) => {
  process.stdout.write(`removed opencode extension: ${result.removed ? "yes" : "missing"}\n`);
  process.stdout.write(`extension path: ${result.extensionPath}\n`);
  process.stdout.write("enable: tokenjuice install opencode\n");
});

const uninstallPlandexCommand = createHostCommand(() => uninstallPlandexConvention(), (result) => {
  process.stdout.write(`removed plandex convention: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`convention path: ${result.conventionPath}\n`);
  process.stdout.write("enable: tokenjuice install plandex\n");
});

const uninstallAnteCommand = createHostCommand(() => uninstallAnteInstructions(), (result) => {
  process.stdout.write(`removed ante instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install ante\n");
});

const uninstallQoderCommand = createHostCommand(() => uninstallQoderInstructions(), (result) => {
  process.stdout.write(`removed qoder instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install qoder\n");
});

const uninstallReplitCommand = createHostCommand(() => uninstallReplitInstructions(), (result) => {
  process.stdout.write(`removed replit instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install replit\n");
});

const uninstallQoderCliCommand = createHostCommand(() => uninstallQoderHook(), (result) => {
  process.stdout.write(`removed qoder-cli entries: ${result.removed}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  process.stdout.write("enable: tokenjuice install qoder-cli\n");
});

const uninstallQoderWorkCommand = createHostCommand(() => uninstallQoderWorkSkill(), (result) => {
  process.stdout.write(`removed qoderwork skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
});

const uninstallQwenWorkCommand = createHostCommand(() => uninstallQwenWorkSkill(), (result) => {
  process.stdout.write(`removed qwenwork skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
});

const uninstallQwenCodeCommand = createHostCommand(() => uninstallQwenCodeHook(), (result) => {
  process.stdout.write(`removed qwen-code entries: ${result.removed}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  process.stdout.write("enable: tokenjuice install qwen-code\n");
});

const uninstallRooCommand = createHostCommand(() => uninstallRooInstructions(), (result) => {
  process.stdout.write(`removed roo rules: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rules path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install roo\n");
});

const uninstallRovoCommand = createHostCommand(() => uninstallRovoInstructions(), (result) => {
  process.stdout.write(`removed rovo instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install rovo\n");
});

const uninstallRulerCommand = createHostCommand(() => uninstallRulerRule(), (result) => {
  process.stdout.write(`removed ruler rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install ruler\n");
});

const uninstallTabnineCommand = createHostCommand(() => uninstallTabnineInstructions(), (result) => {
  process.stdout.write(`removed tabnine instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install tabnine\n");
});

const uninstallTabbyCommand = createHostCommand(() => uninstallTabbySystemPrompt(), (result) => {
  process.stdout.write(`removed tabby system prompt: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`config path: ${result.configPath}\n`);
  process.stdout.write("enable: tokenjuice install tabby\n");
});

const uninstallTraeCommand = createHostCommand(() => uninstallTraeRule(), (result) => {
  process.stdout.write(`removed trae rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install trae\n");
});

const uninstallUipathCommand = createHostCommand(() => uninstallUiPathInstructions(), (result) => {
  process.stdout.write(`removed uipath instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install uipath\n");
});

const uninstallVscodeCopilotCommand = createHostCommand(() => uninstallVscodeCopilotHook(), (result) => {
  process.stdout.write(`removed vscode-copilot entries: ${result.removed}\n`);
  process.stdout.write(`hooks path: ${result.hooksPath}${result.deletedFile ? " (file deleted)" : ""}\n`);
  process.stdout.write("enable: tokenjuice install vscode-copilot\n");
});

const uninstallWindsurfCommand = createHostCommand(() => uninstallWindsurfRule(), (result) => {
  process.stdout.write(`removed windsurf rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install windsurf\n");
});

const uninstallCopilotCliCommand = createHostCommand(() => uninstallCopilotCliHook(), (result) => {
  process.stdout.write(`removed copilot-cli entries: ${result.removed}\n`);
  process.stdout.write(`hooks path: ${result.hooksPath}${result.deletedFile ? " (file deleted)" : ""}\n`);
  process.stdout.write("enable: tokenjuice install copilot-cli\n");
});

const uninstallDeepagentsCommand = createHostCommand(() => uninstallDeepAgentsInstructions(), (result) => {
  process.stdout.write(`removed deepagents instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install deepagents\n");
});

const uninstallDevinCommand = createHostCommand(() => uninstallDevinHook(), (result) => {
  process.stdout.write(`removed devin entries: ${result.removed}\n`);
  process.stdout.write(`hooks path: ${result.hooksPath}${result.deletedFile ? " (file deleted)" : ""}\n`);
  process.stdout.write("enable: tokenjuice install devin\n");
});

const uninstallDotAgentsCommand = createHostCommand(() => uninstallDotAgentsRule(), (result) => {
  process.stdout.write(`removed dot-agents rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write(`sync: ${result.syncCommand}\n`);
  process.stdout.write("enable: tokenjuice install dot-agents\n");
});

const uninstallDockerAgentCommand = createHostCommand(() => uninstallDockerAgentPrompt(), (result) => {
  process.stdout.write(`removed docker-agent prompt: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`prompt path: ${result.promptPath}\n`);
  process.stdout.write("enable: tokenjuice install docker-agent\n");
});

const uninstallEcaCommand = createHostCommand(() => uninstallEcaSkill(), (result) => {
  process.stdout.write(`removed ECA skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
  process.stdout.write("enable: tokenjuice install eca\n");
});

const uninstallElyraCommand = createHostCommand(() => uninstallElyraSkill(), (result) => {
  process.stdout.write(`removed Elyra skill: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`skill path: ${result.skillPath}\n`);
  process.stdout.write("enable: tokenjuice install elyra\n");
});

const uninstallDroidCommand = createHostCommand(() => uninstallDroidHook(), (result) => {
  process.stdout.write(`removed droid entries: ${result.removed}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  process.stdout.write("enable: tokenjuice install droid\n");
});

const uninstallZedCommand = createHostCommand(() => uninstallZedInstructions(), (result) => {
  process.stdout.write(`removed zed rules: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rules path: ${result.instructionsPath}\n`);
  process.stdout.write("enable: tokenjuice install zed\n");
});

const uninstallZencoderCommand = createHostCommand(() => uninstallZencoderRule(), (result) => {
  process.stdout.write(`removed zencoder rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write("enable: tokenjuice install zencoder\n");
});

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
  ["ante", uninstallAnteCommand],
  ["qoder", uninstallQoderCommand],
  ["qoder-cli", uninstallQoderCliCommand],
  ["replit", uninstallReplitCommand],
  ["replit-agent", uninstallReplitCommand],
  ["qwen-code", uninstallQwenCodeCommand],
  ["qwenwork", uninstallQwenWorkCommand],
  ["qoderwork", uninstallQoderWorkCommand],
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
