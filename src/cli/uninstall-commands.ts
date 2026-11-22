import { uninstallOpenCodeV2Extension } from "../hosts/opencode/v2/index.js";
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
import { createFileUninstallCommand, createHostCommand } from "./host-command.js";
import type { HostCommandHandler } from "./command-types.js";

const uninstallAdalCommand = createFileUninstallCommand("adal", "instructions", "instructionsPath", () => uninstallAdalInstructions());

const uninstallAetherCommand = createHostCommand(() => uninstallAetherPrompt(), (result) => {
  process.stdout.write(`removed aether prompt: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`prompt path: ${result.promptPath}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  process.stdout.write(`prompt refs removed: ${result.promptsRemoved}\n`);
  process.stdout.write("enable: tokenjuice install aether\n");
});

const uninstallAiderCommand = createFileUninstallCommand("aider", "convention", "conventionPath", () => uninstallAiderConvention());

const uninstallAictlCommand = createFileUninstallCommand("aictl", "instructions", "instructionsPath", () => uninstallAictlInstructions());

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

const uninstallAgentsMdCommand = createFileUninstallCommand("agents-md", "instructions", "instructionsPath", () => uninstallAgentsMdInstructions());

const uninstallAgentsgeCommand = createFileUninstallCommand("agentsge", "rule", "rulePath", () => uninstallAgentsGeRule());

const uninstallAgentsmeshCommand = createHostCommand(() => uninstallAgentsMeshRule(), (result) => {
  process.stdout.write(`removed agentsmesh rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write(`generate: ${result.syncCommand}\n`);
  process.stdout.write("enable: tokenjuice install agentsmesh\n");
});

const uninstallAmazonQCommand = createFileUninstallCommand("amazon-q", "rule", "rulePath", () => uninstallAmazonQRule());

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

const uninstallAntigravityCommand = createFileUninstallCommand("antigravity", "rule", "rulePath", () => uninstallAntigravityRule());

const uninstallAnywhereAgentsCommand = createHostCommand(() => uninstallAnywhereAgentsInstructions(), (result) => {
  process.stdout.write(`removed anywhere-agents instructions: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`instructions path: ${result.instructionsPath}\n`);
  process.stdout.write(`sync: ${result.syncCommand}\n`);
  process.stdout.write("enable: tokenjuice install anywhere-agents\n");
});

const uninstallAugmentCommand = createFileUninstallCommand("augment", "rule", "rulePath", () => uninstallAugmentRule());

const uninstallAvanteCommand = createFileUninstallCommand("avante", "instructions", "instructionsPath", () => uninstallAvanteInstructions());

const uninstallBazCommand = createFileUninstallCommand("baz", "skill", "skillPath", () => uninstallBazSkill());

const uninstallBitoCommand = createHostCommand(() => uninstallBitoGuidelines(), (result) => {
  process.stdout.write(`removed bito custom guidelines: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`config path: ${result.configPath}\n`);
  process.stdout.write(`guidelines path: ${result.guidelinesPath}\n`);
  process.stdout.write("enable: tokenjuice install bito\n");
});

const uninstallBlackboxCommand = createFileUninstallCommand("blackbox", "skill", "skillPath", () => uninstallBlackboxSkill());

const uninstallBlocksCommand = createFileUninstallCommand("blocks", "skill", "skillPath", () => uninstallBlocksSkill());

const uninstallClawdbotCommand = createFileUninstallCommand("clawdbot", "skill", "skillPath", () => uninstallClawdbotSkill());

const uninstallBobCommand = createFileUninstallCommand("bob", "instructions", "instructionsPath", () => uninstallBobInstructions());

const uninstallBuilderCommand = createFileUninstallCommand("builder", "rule", "rulePath", () => uninstallBuilderRule());

const uninstallCharlieCommand = createFileUninstallCommand("charlie", "instructions", "instructionsPath", () => uninstallCharlieInstructions());

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

const uninstallClineCommand = createFileUninstallCommand("cline", "hook", "hookPath", () => uninstallClineHook());

const uninstallCodeantCommand = createFileUninstallCommand("codeant", "instructions", "instructionsPath", () => uninstallCodeAntInstructions());

const uninstallCodebuffCommand = createFileUninstallCommand("codebuff", "instructions", "instructionsPath", () => uninstallCodebuffInstructions());

const uninstallCodegenCommand = createFileUninstallCommand("codegen", "instructions", "instructionsPath", () => uninstallCodegenInstructions());

const uninstallCoderAgentsCommand = createFileUninstallCommand("coder-agents", "skill", "skillPath", () => uninstallCoderAgentsSkill());

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
  process.stdout.write("use: tokenjuice wrap -- <command>\n");
});

const uninstallPiGoCommand = createFileUninstallCommand("pi-go", "skill", "skillPath", () => uninstallPiGoSkill());

const uninstallContinueCommand = createFileUninstallCommand("continue", "rule", "rulePath", () => uninstallContinueRule());

const uninstallCopilotAgentCommand = createHostCommand(() => uninstallCopilotAgentHook(), (result) => {
  process.stdout.write(`removed copilot-agent entries: ${result.removed}\n`);
  process.stdout.write(`hook path: ${result.hooksPath}\n`);
  if (result.deletedFile) {
    process.stdout.write("deleted empty hook file: yes\n");
  }
  process.stdout.write("enable: tokenjuice install copilot-agent\n");
});

const uninstallCrushCommand = createFileUninstallCommand("crush", "skill", "skillPath", () => uninstallCrushSkill());

const uninstallCursorCommand = createHostCommand(() => uninstallCursorHook(), (result) => {
  process.stdout.write(`removed cursor hook: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`hooks path: ${result.hooksPath}\n`);
  if (result.backupPath) {
    process.stdout.write(`backup: ${result.backupPath}\n`);
  }
  process.stdout.write("enable: tokenjuice install cursor\n");
});

const uninstallFirebaseStudioCommand = createFileUninstallCommand("firebase-studio", "rules", "rulePath", () => uninstallFirebaseStudioRule());

const uninstallForgecodeCommand = createFileUninstallCommand("forgecode", "instructions", "instructionsPath", () => uninstallForgeCodeInstructions());

const uninstallGeminiCliCommand = createHostCommand(() => uninstallGeminiCliHook(), (result) => {
  process.stdout.write(`removed gemini-cli entries: ${result.removed}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  process.stdout.write("enable: tokenjuice install gemini-cli\n");
});

const uninstallGitlabDuoCommand = createFileUninstallCommand("gitlab-duo", "rule", "rulePath", () => uninstallGitLabDuoRule());

const uninstallGrokCliCommand = createHostCommand(() => uninstallGrokCliHook(), (result) => {
  process.stdout.write(`removed grok-cli entries: ${result.removed}\n`);
  process.stdout.write(`settings path: ${result.settingsPath}\n`);
  process.stdout.write("enable: tokenjuice install grok-cli\n");
});

const uninstallGptmeCommand = createFileUninstallCommand("gptme", "instructions", "instructionsPath", () => uninstallGptmeInstructions());

const uninstallJean2Command = createFileUninstallCommand("jean2", "instructions", "instructionsPath", () => uninstallJean2Instructions());

const uninstallGrokBuildCommand = createFileUninstallCommand("grok-build", "instructions", "instructionsPath", () => uninstallGrokBuildInstructions());

const uninstallGrokBotCommand = createHostCommand(() => uninstallGrokBotRule(), (result) => {
  process.stdout.write(`removed grok-bot rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write(`restored backup: ${result.restoredBackup ? "yes" : "no"}\n`);
  process.stdout.write("enable: tokenjuice install grok-bot\n");
});

const uninstallGooseCommand = createFileUninstallCommand("goose", "hints", "hintsPath", () => uninstallGooseHints());

const uninstallGreptileCommand = createFileUninstallCommand("greptile", "rule", "rulePath", () => uninstallGreptileRule());

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

const uninstallJetbrainsAiCommand = createFileUninstallCommand("jetbrains-ai", "rule", "rulePath", () => uninstallJetBrainsAiRule());

const uninstallJunieCommand = createFileUninstallCommand("junie", "instructions", "instructionsPath", () => uninstallJunieInstructions());

const uninstallJulesCommand = createFileUninstallCommand("jules", "instructions", "instructionsPath", () => uninstallJulesInstructions());

const uninstallLeanctlCommand = createFileUninstallCommand("leanctl", "instructions", "instructionsPath", () => uninstallLeanCtlInstructions());

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

const uninstallKiroCommand = createFileUninstallCommand("kiro", "steering", "steeringPath", () => uninstallKiroSteering());

const uninstallKiloCommand = createHostCommand(() => uninstallKiloRule(), (result) => {
  process.stdout.write(`removed kilo rule: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`rule path: ${result.rulePath}\n`);
  process.stdout.write(`config path: ${result.configPath}\n`);
  process.stdout.write(`removed kilo config entry: ${result.configUpdated ? "yes" : "no"}\n`);
  process.stdout.write("enable: tokenjuice install kilo\n");
});

const uninstallMistralVibeCommand = createFileUninstallCommand("mistral-vibe", "instructions", "instructionsPath", () => uninstallMistralVibeInstructions());

const uninstallMcpAgentCommand = createHostCommand(() => uninstallMcpAgentDefinition(), (result) => {
  process.stdout.write(`removed mcp-agent definition: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`agent path: ${result.agentPath}\n`);
  process.stdout.write("enable: tokenjuice install mcp-agent\n");
});

const uninstallMiniSweAgentCommand = createFileUninstallCommand("mini-swe-agent", "config", "configPath", () => uninstallMiniSweAgentConfig());

const uninstallSweAgentCommand = createFileUninstallCommand("swe-agent", "config", "configPath", () => uninstallSweAgentConfig());

const uninstallStagewiseCommand = createFileUninstallCommand("stagewise", "skill", "skillPath", () => uninstallStagewiseSkill());

const uninstallMuxCommand = createFileUninstallCommand("mux", "hook", "hookPath", () => uninstallMuxHook());

const uninstallNovakitCommand = createFileUninstallCommand("novakit", "instructions", "instructionsPath", () => uninstallNovaKitInstructions());

const uninstallKnownsCommand = createFileUninstallCommand("knowns", "instructions", "instructionsPath", () => uninstallKnownsInstructions());

const uninstallOnaCommand = createFileUninstallCommand("ona", "skill", "skillPath", () => uninstallOnaSkill());

const uninstallWarpCommand = createFileUninstallCommand("warp", "instructions", "instructionsPath", () => uninstallWarpInstructions());

const uninstallOpenhandsCommand = createHostCommand(() => uninstallOpenHandsHook(), (result) => {
  process.stdout.write(`removed openhands entries: ${result.removed}\n`);
  process.stdout.write(`hooks path: ${result.hooksPath}\n`);
  process.stdout.write("use: tokenjuice wrap -- <command>\n");
});

const uninstallOpenInterpreterCommand = createFileUninstallCommand("open-interpreter", "instructions", "instructionsPath", () => uninstallOpenInterpreterInstructions());

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

const uninstallOpencodeV2Command = createHostCommand(() => uninstallOpenCodeV2Extension(), (result) => {
  process.stdout.write(`removed opencode-v2 extension: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`extension path: ${result.extensionPath}\n`);
});

const uninstallOpencodeCommand = createHostCommand(() => uninstallOpenCodeExtension(), (result) => {
  process.stdout.write(`removed opencode extension: ${result.removed ? "yes" : "missing"}\n`);
  process.stdout.write(`extension path: ${result.extensionPath}\n`);
  process.stdout.write("enable: tokenjuice install opencode\n");
});

const uninstallPlandexCommand = createFileUninstallCommand("plandex", "convention", "conventionPath", () => uninstallPlandexConvention());

const uninstallAnteCommand = createFileUninstallCommand("ante", "instructions", "instructionsPath", () => uninstallAnteInstructions());

const uninstallQoderCommand = createFileUninstallCommand("qoder", "instructions", "instructionsPath", () => uninstallQoderInstructions());

const uninstallReplitCommand = createFileUninstallCommand("replit", "instructions", "instructionsPath", () => uninstallReplitInstructions());

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

const uninstallRooCommand = createFileUninstallCommand("roo", "rules", "instructionsPath", () => uninstallRooInstructions());

const uninstallRovoCommand = createFileUninstallCommand("rovo", "instructions", "instructionsPath", () => uninstallRovoInstructions());

const uninstallRulerCommand = createFileUninstallCommand("ruler", "rule", "rulePath", () => uninstallRulerRule());

const uninstallTabnineCommand = createFileUninstallCommand("tabnine", "instructions", "instructionsPath", () => uninstallTabnineInstructions());

const uninstallTabbyCommand = createHostCommand(() => uninstallTabbySystemPrompt(), (result) => {
  process.stdout.write(`removed tabby system prompt: ${result.removed ? "yes" : "no"}\n`);
  process.stdout.write(`config path: ${result.configPath}\n`);
  process.stdout.write("enable: tokenjuice install tabby\n");
});

const uninstallTraeCommand = createFileUninstallCommand("trae", "rule", "rulePath", () => uninstallTraeRule());

const uninstallUipathCommand = createFileUninstallCommand("uipath", "instructions", "instructionsPath", () => uninstallUiPathInstructions());

const uninstallVscodeCopilotCommand = createHostCommand(() => uninstallVscodeCopilotHook(), (result) => {
  process.stdout.write(`removed vscode-copilot entries: ${result.removed}\n`);
  process.stdout.write(`hooks path: ${result.hooksPath}${result.deletedFile ? " (file deleted)" : ""}\n`);
  process.stdout.write("enable: tokenjuice install vscode-copilot\n");
});

const uninstallWindsurfCommand = createFileUninstallCommand("windsurf", "rule", "rulePath", () => uninstallWindsurfRule());

const uninstallCopilotCliCommand = createHostCommand(() => uninstallCopilotCliHook(), (result) => {
  process.stdout.write(`removed copilot-cli entries: ${result.removed}\n`);
  process.stdout.write(`hooks path: ${result.hooksPath}${result.deletedFile ? " (file deleted)" : ""}\n`);
  process.stdout.write("enable: tokenjuice install copilot-cli\n");
});

const uninstallDeepagentsCommand = createFileUninstallCommand("deepagents", "instructions", "instructionsPath", () => uninstallDeepAgentsInstructions());

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

const uninstallDockerAgentCommand = createFileUninstallCommand("docker-agent", "prompt", "promptPath", () => uninstallDockerAgentPrompt());

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

const uninstallZedCommand = createFileUninstallCommand("zed", "rules", "instructionsPath", () => uninstallZedInstructions());

const uninstallZencoderCommand = createFileUninstallCommand("zencoder", "rule", "rulePath", () => uninstallZencoderRule());

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
  ["opencode-v2", uninstallOpencodeV2Command],
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
