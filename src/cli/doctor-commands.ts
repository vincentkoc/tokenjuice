import { doctorQoderHook } from "../hosts/qoder/hook-install.js";
import { doctorQwenWorkSkill } from "../hosts/qwenwork/index.js";
import { doctorQoderWorkSkill } from "../hosts/qoderwork/index.js";
// Per-target handlers for `tokenjuice doctor <target>` (hosts plus `doctor hooks`).
// Each handler is keyed by the target name and its aliases in doctorCommands.

import { doctorAdalInstructions } from "../hosts/adal/index.js";
import { doctorAetherPrompt } from "../hosts/aether/index.js";
import { doctorAictlInstructions } from "../hosts/aictl/index.js";
import { doctorAiMemoryProtocolMemory } from "../hosts/ai-memory-protocol/index.js";
import { doctorAgentLayerInstructions } from "../hosts/agent-layer/index.js";
import { doctorAgentInitInstructions } from "../hosts/agentinit/index.js";
import { doctorAgentlinkInstructions } from "../hosts/agentlink/index.js";
import { doctorAgentloomRule } from "../hosts/agentloom/index.js";
import { doctorAgentsCliMemory } from "../hosts/agents-cli/index.js";
import { doctorAgentsMdInstructions } from "../hosts/agents-md/index.js";
import { doctorAgentsGeRule } from "../hosts/agentsge/index.js";
import { doctorAgentsMeshRule } from "../hosts/agentsmesh/index.js";
import { doctorAmazonQRule } from "../hosts/amazon-q/index.js";
import { doctorAmpInstructions } from "../hosts/amp/index.js";
import { doctorAiderConvention } from "../hosts/aider/index.js";
import { doctorAntigravityRule } from "../hosts/antigravity/index.js";
import { doctorAnywhereAgentsInstructions } from "../hosts/anywhere-agents/index.js";
import { doctorAugmentRule } from "../hosts/augment/index.js";
import { doctorAvanteInstructions } from "../hosts/avante/index.js";
import { doctorBazSkill } from "../hosts/baz/index.js";
import { doctorBitoGuidelines } from "../hosts/bito/index.js";
import { doctorBlackboxSkill } from "../hosts/blackbox/index.js";
import { doctorBlocksSkill } from "../hosts/blocks/index.js";
import { doctorClawdbotSkill } from "../hosts/clawdbot/index.js";
import { doctorBobInstructions } from "../hosts/bob/index.js";
import { doctorBuilderRule } from "../hosts/builder/index.js";
import { doctorCharlieInstructions } from "../hosts/charlie/index.js";
import { doctorClaudeCodeHook } from "../hosts/claude-code/index.js";
import { doctorClineHook } from "../hosts/cline/index.js";
import { doctorCodeAntInstructions } from "../hosts/codeant/index.js";
import { doctorCodebuffInstructions } from "../hosts/codebuff/index.js";
import { doctorCodegenInstructions } from "../hosts/codegen/index.js";
import { doctorCoderAgentsSkill } from "../hosts/coder-agents/index.js";
import { doctorCodeRabbitConfig } from "../hosts/coderabbit/index.js";
import { doctorCodeBuddyHook } from "../hosts/codebuddy/index.js";
import { doctorCommandCodeHook } from "../hosts/command-code/index.js";
import { doctorContinueRule } from "../hosts/continue/index.js";
import { doctorCodexHook } from "../hosts/codex/index.js";
import { doctorCopilotAgentHook } from "../hosts/copilot-agent/index.js";
import { doctorCopilotCliHook, getCopilotCliInstructionsSnippet } from "../hosts/copilot-cli/index.js";
import { doctorCrushSkill } from "../hosts/crush/index.js";
import { doctorCursorHook } from "../hosts/cursor/index.js";
import { doctorDeepAgentsInstructions } from "../hosts/deepagents/index.js";
import { doctorDevinHook } from "../hosts/devin/index.js";
import { doctorDotAgentsRule } from "../hosts/dot-agents/index.js";
import { doctorDockerAgentPrompt } from "../hosts/docker-agent/index.js";
import { doctorDroidHook } from "../hosts/droid/index.js";
import { doctorEcaSkill } from "../hosts/eca/index.js";
import { doctorElyraSkill } from "../hosts/elyra/index.js";
import { doctorFirebaseStudioRule } from "../hosts/firebase-studio/index.js";
import { doctorForgeCodeInstructions } from "../hosts/forgecode/index.js";
import { doctorGeminiCliHook } from "../hosts/gemini-cli/index.js";
import { doctorGitLabDuoRule } from "../hosts/gitlab-duo/index.js";
import { doctorGooseHints } from "../hosts/goose/index.js";
import { doctorGreptileRule } from "../hosts/greptile/index.js";
import { doctorGrokBuildInstructions } from "../hosts/grok-build/index.js";
import { doctorGrokBotRule } from "../hosts/grok-bot/index.js";
import { doctorGrokCliHook } from "../hosts/grok-cli/index.js";
import { doctorGptmeInstructions } from "../hosts/gptme/index.js";
import { doctorJean2Instructions } from "../hosts/jean2/index.js";
import { doctorJetBrainsAiRule } from "../hosts/jetbrains-ai/index.js";
import { doctorJunieInstructions } from "../hosts/junie/index.js";
import { doctorJulesInstructions } from "../hosts/jules/index.js";
import { doctorLeanCtlInstructions } from "../hosts/leanctl/index.js";
import { doctorKimiHook } from "../hosts/kimi/index.js";
import { doctorKiroSteering } from "../hosts/kiro/index.js";
import { doctorKiloRule } from "../hosts/kilo/index.js";
import { doctorKnownsInstructions } from "../hosts/knowns/index.js";
import { doctorLocalCodePlugin } from "../hosts/localcode/index.js";
import { doctorMcpAgentDefinition } from "../hosts/mcp-agent/index.js";
import { doctorMiniSweAgentConfig } from "../hosts/mini-swe-agent/index.js";
import { doctorSweAgentConfig } from "../hosts/swe-agent/index.js";
import { doctorStagewiseSkill } from "../hosts/stagewise/index.js";
import { doctorMistralVibeInstructions } from "../hosts/mistral-vibe/index.js";
import { doctorMuxHook } from "../hosts/mux/index.js";
import { doctorNovaKitInstructions } from "../hosts/novakit/index.js";
import { doctorOnaSkill } from "../hosts/ona/index.js";
import { doctorOpenCodeExtension } from "../hosts/opencode/index.js";
import { doctorOpenInterpreterInstructions } from "../hosts/open-interpreter/index.js";
import { doctorOpenHandsHook } from "../hosts/openhands/index.js";
import { doctorOpenWebUITool } from "../hosts/openwebui/index.js";
import { doctorPiExtension } from "../hosts/pi/index.js";
import { doctorPiGoSkill } from "../hosts/pi-go/index.js";
import { doctorPlandexConvention } from "../hosts/plandex/index.js";
import { doctorQodoReviewConfig } from "../hosts/qodo/index.js";
import { doctorQoderInstructions } from "../hosts/qoder/index.js";
import { doctorAnteInstructions } from "../hosts/ante/index.js";
import { doctorQwenCodeHook } from "../hosts/qwen-code/index.js";
import { doctorReplitInstructions } from "../hosts/replit/index.js";
import { doctorRooInstructions } from "../hosts/roo/index.js";
import { doctorRovoInstructions } from "../hosts/rovo/index.js";
import { doctorRulerRule } from "../hosts/ruler/index.js";
import { doctorTabbySystemPrompt } from "../hosts/tabby/index.js";
import { doctorTabnineInstructions } from "../hosts/tabnine/index.js";
import { doctorTraeRule } from "../hosts/trae/index.js";
import { doctorUiPathInstructions } from "../hosts/uipath/index.js";
import { doctorVscodeCopilotHook, getVscodeCopilotInstructionsSnippet } from "../hosts/vscode-copilot/index.js";
import { doctorWarpInstructions } from "../hosts/warp/index.js";
import { doctorWindsurfRule } from "../hosts/windsurf/index.js";
import { doctorZedInstructions } from "../hosts/zed/index.js";
import { doctorZencoderRule } from "../hosts/zencoder/index.js";
import { doctorInstalledHooks } from "../hosts/shared/hook-doctor.js";
import { formatHookDoctorReport, writeDoctorList } from "./doctor-output.js";
import { createHostCommand } from "./host-command.js";
import type { HostCommandHandler, ParsedArgs } from "./command-types.js";

function createDoctorCommand<Report extends { status: string }>(
  run: (args: ParsedArgs) => Promise<Report>,
  writeText: (report: Report, args: ParsedArgs) => void,
): HostCommandHandler {
  return createHostCommand(run, writeText, (report) => report.status === "broken" ? 1 : 0);
}

const doctorHooksCommand = createDoctorCommand((args) => doctorInstalledHooks({ local: args.local }), (report) => {
  process.stdout.write(formatHookDoctorReport(report));
});

const doctorAdalCommand = createDoctorCommand(() => doctorAdalInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAetherCommand = createDoctorCommand(() => doctorAetherPrompt(), (report) => {
  process.stdout.write(`prompt path: ${report.promptPath}\n`);
  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAiderCommand = createDoctorCommand(() => doctorAiderConvention(), (report) => {
  process.stdout.write(`convention path: ${report.conventionPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAictlCommand = createDoctorCommand(() => doctorAictlInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAiMemoryProtocolCommand = createDoctorCommand(() => doctorAiMemoryProtocolMemory(), (report) => {
  process.stdout.write(`memory path: ${report.memoryPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAgentLayerCommand = createDoctorCommand(() => doctorAgentLayerInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAgentinitCommand = createDoctorCommand(() => doctorAgentInitInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  process.stdout.write(`sync: ${report.syncCommand}\n`);
});

const doctorAgentlinkCommand = createDoctorCommand(() => doctorAgentlinkInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  process.stdout.write(`sync: ${report.syncCommand}\n`);
});

const doctorAgentloomCommand = createDoctorCommand(() => doctorAgentloomRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAgentsCliCommand = createDoctorCommand(() => doctorAgentsCliMemory(), (report) => {
  process.stdout.write(`memory path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  process.stdout.write(`sync: ${report.syncCommand}\n`);
});

const doctorAgentsMdCommand = createDoctorCommand(() => doctorAgentsMdInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAgentsgeCommand = createDoctorCommand(() => doctorAgentsGeRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAgentsmeshCommand = createDoctorCommand(() => doctorAgentsMeshRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAmazonQCommand = createDoctorCommand(() => doctorAmazonQRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAmpCommand = createDoctorCommand(() => doctorAmpInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAntigravityCommand = createDoctorCommand(() => doctorAntigravityRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAnywhereAgentsCommand = createDoctorCommand(() => doctorAnywhereAgentsInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  process.stdout.write(`sync: ${report.syncCommand}\n`);
});

const doctorAugmentCommand = createDoctorCommand(() => doctorAugmentRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAvanteCommand = createDoctorCommand(() => doctorAvanteInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorBazCommand = createDoctorCommand(() => doctorBazSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorBitoCommand = createDoctorCommand(() => doctorBitoGuidelines(), (report) => {
  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`guidelines path: ${report.guidelinesPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorBlackboxCommand = createDoctorCommand(() => doctorBlackboxSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorBlocksCommand = createDoctorCommand(() => doctorBlocksSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorClawdbotCommand = createDoctorCommand(() => doctorClawdbotSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorBobCommand = createDoctorCommand(() => doctorBobInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorBuilderCommand = createDoctorCommand(() => doctorBuilderRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCharlieCommand = createDoctorCommand(() => doctorCharlieInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCodexCommand = createDoctorCommand((args) => doctorCodexHook(undefined, {
    local: args.local,
    ...(args.noOmit ? { noOmit: true } : {}),
  }), (report) => {
  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
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
});

const doctorPiCommand = createDoctorCommand(() => doctorPiExtension(), (report) => {
  process.stdout.write(`extension path: ${report.extensionPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorPiGoCommand = createDoctorCommand(() => doctorPiGoSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorOpencodeCommand = createDoctorCommand(() => doctorOpenCodeExtension(), (report) => {
  process.stdout.write(`extension path: ${report.extensionPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorPlandexCommand = createDoctorCommand(() => doctorPlandexConvention(), (report) => {
  process.stdout.write(`convention path: ${report.conventionPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorAnteCommand = createDoctorCommand(() => doctorAnteInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});


const doctorQoderCommand = createDoctorCommand(() => doctorQoderInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorReplitCommand = createDoctorCommand(() => doctorReplitInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorQoderCliCommand = createDoctorCommand((args) => doctorQoderHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorQoderWorkCommand = createDoctorCommand(() => doctorQoderWorkSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorQwenWorkCommand = createDoctorCommand(() => doctorQwenWorkSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorQwenCodeCommand = createDoctorCommand((args) => doctorQwenCodeHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCommandCodeCommand = createDoctorCommand((args) => doctorCommandCodeHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCrushCommand = createDoctorCommand(() => doctorCrushSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCursorCommand = createDoctorCommand((args) => doctorCursorHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorDeepagentsCommand = createDoctorCommand(() => doctorDeepAgentsInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorDevinCommand = createDoctorCommand((args) => doctorDevinHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  writeDoctorList("missing paths", report.missingPaths);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorDotAgentsCommand = createDoctorCommand(() => doctorDotAgentsRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  process.stdout.write(`sync: ${report.syncCommand}\n`);
});

const doctorDockerAgentCommand = createDoctorCommand(() => doctorDockerAgentPrompt(), (report) => {
  process.stdout.write(`prompt path: ${report.promptPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCopilotAgentCommand = createDoctorCommand((args) => doctorCopilotAgentHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorEcaCommand = createDoctorCommand(() => doctorEcaSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorElyraCommand = createDoctorCommand(() => doctorElyraSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorFirebaseStudioCommand = createDoctorCommand(() => doctorFirebaseStudioRule(), (report) => {
  process.stdout.write(`rules path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorForgecodeCommand = createDoctorCommand(() => doctorForgeCodeInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorGeminiCliCommand = createDoctorCommand((args) => doctorGeminiCliHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorGitlabDuoCommand = createDoctorCommand(() => doctorGitLabDuoRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorGrokCliCommand = createDoctorCommand((args) => doctorGrokCliHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorGptmeCommand = createDoctorCommand(() => doctorGptmeInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorJean2Command = createDoctorCommand(() => doctorJean2Instructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorGrokBuildCommand = createDoctorCommand(() => doctorGrokBuildInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorGrokBotCommand = createDoctorCommand(() => doctorGrokBotRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorGooseCommand = createDoctorCommand(() => doctorGooseHints(), (report) => {
  process.stdout.write(`hints path: ${report.hintsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorGreptileCommand = createDoctorCommand(() => doctorGreptileRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorQodoCommand = createDoctorCommand(() => doctorQodoReviewConfig(), (report) => {
  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCoderabbitCommand = createDoctorCommand(() => doctorCodeRabbitConfig(), (report) => {
  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorJetbrainsAiCommand = createDoctorCommand(() => doctorJetBrainsAiRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorJunieCommand = createDoctorCommand(() => doctorJunieInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorJulesCommand = createDoctorCommand(() => doctorJulesInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorLeanctlCommand = createDoctorCommand(() => doctorLeanCtlInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorKimiCommand = createDoctorCommand((args) => doctorKimiHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorLocalcodeCommand = createDoctorCommand(() => doctorLocalCodePlugin(), (report) => {
  process.stdout.write(`plugin dir: ${report.pluginDir}\n`);
  process.stdout.write(`manifest path: ${report.manifestPath}\n`);
  process.stdout.write(`entrypoint path: ${report.indexPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorOpenhandsCommand = createDoctorCommand((args) => doctorOpenHandsHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`hooks path: ${report.hooksPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorOpenwebuiCommand = createDoctorCommand(() => doctorOpenWebUITool(), (report) => {
  process.stdout.write(`tool path: ${report.toolPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorMcpAgentCommand = createDoctorCommand(() => doctorMcpAgentDefinition(), (report) => {
  process.stdout.write(`agent path: ${report.agentPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorMiniSweAgentCommand = createDoctorCommand(() => doctorMiniSweAgentConfig(), (report) => {
  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorSweAgentCommand = createDoctorCommand(() => doctorSweAgentConfig(), (report) => {
  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorStagewiseCommand = createDoctorCommand(() => doctorStagewiseSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorOpenInterpreterCommand = createDoctorCommand(() => doctorOpenInterpreterInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

async function doctorVscodeCopilotCommand(args: ParsedArgs): Promise<number> {
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
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

const doctorZedCommand = createDoctorCommand(() => doctorZedInstructions(), (report) => {
  process.stdout.write(`rules path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorZencoderCommand = createDoctorCommand(() => doctorZencoderRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorRooCommand = createDoctorCommand(() => doctorRooInstructions(), (report) => {
  process.stdout.write(`rules path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorRovoCommand = createDoctorCommand(() => doctorRovoInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorRulerCommand = createDoctorCommand(() => doctorRulerRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorTabnineCommand = createDoctorCommand(() => doctorTabnineInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorTabbyCommand = createDoctorCommand(() => doctorTabbySystemPrompt(), (report) => {
  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorTraeCommand = createDoctorCommand(() => doctorTraeRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorUipathCommand = createDoctorCommand(() => doctorUiPathInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorKiloCommand = createDoctorCommand(() => doctorKiloRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`config path: ${report.configPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorMistralVibeCommand = createDoctorCommand(() => doctorMistralVibeInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorMuxCommand = createDoctorCommand((args) => doctorMuxHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`hook path: ${report.hookPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorNovakitCommand = createDoctorCommand(() => doctorNovaKitInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorKnownsCommand = createDoctorCommand(() => doctorKnownsInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorOnaCommand = createDoctorCommand(() => doctorOnaSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorWarpCommand = createDoctorCommand(() => doctorWarpInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorKiroCommand = createDoctorCommand(() => doctorKiroSteering(), (report) => {
  process.stdout.write(`steering path: ${report.steeringPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorWindsurfCommand = createDoctorCommand(() => doctorWindsurfRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

async function doctorCopilotCliCommand(args: ParsedArgs): Promise<number> {
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
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
  return report.status === "broken" ? 1 : 0;
}

const doctorClaudeCodeCommand = createDoctorCommand((args) => doctorClaudeCodeHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorClineCommand = createDoctorCommand((args) => doctorClineHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`hook path: ${report.hookPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCodebuffCommand = createDoctorCommand(() => doctorCodebuffInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCodeantCommand = createDoctorCommand(() => doctorCodeAntInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCodegenCommand = createDoctorCommand(() => doctorCodegenInstructions(), (report) => {
  process.stdout.write(`instructions path: ${report.instructionsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCoderAgentsCommand = createDoctorCommand(() => doctorCoderAgentsSkill(), (report) => {
  process.stdout.write(`skill path: ${report.skillPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorCodebuddyCommand = createDoctorCommand((args) => doctorCodeBuddyHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("missing paths", report.missingPaths);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorContinueCommand = createDoctorCommand(() => doctorContinueRule(), (report) => {
  process.stdout.write(`rule path: ${report.rulePath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

const doctorDroidCommand = createDoctorCommand((args) => doctorDroidHook(undefined, { local: args.local }), (report) => {
  process.stdout.write(`settings path: ${report.settingsPath}\n`);
  process.stdout.write(`health: ${report.status}\n`);
  process.stdout.write(`expected command: ${report.expectedCommand}\n`);
  if (report.detectedCommand) {
    process.stdout.write(`configured command: ${report.detectedCommand}\n`);
  }
  writeDoctorList("issues", report.issues);
  writeDoctorList("advisories", report.advisories);
  writeDoctorList("missing paths", report.missingPaths);
  process.stdout.write(`repair: ${report.fixCommand}\n`);
});

export const doctorCommands: ReadonlyMap<string, HostCommandHandler> = new Map<string, HostCommandHandler>([
  ["hooks", doctorHooksCommand],
  ["adal", doctorAdalCommand],
  ["aether", doctorAetherCommand],
  ["aider", doctorAiderCommand],
  ["aictl", doctorAictlCommand],
  ["ai-memory-protocol", doctorAiMemoryProtocolCommand],
  ["aimemoryprotocol", doctorAiMemoryProtocolCommand],
  ["agent-layer", doctorAgentLayerCommand],
  ["agentinit", doctorAgentinitCommand],
  ["agent-init", doctorAgentinitCommand],
  ["agentlink", doctorAgentlinkCommand],
  ["agentloom", doctorAgentloomCommand],
  ["agents-cli", doctorAgentsCliCommand],
  ["agents-md", doctorAgentsMdCommand],
  ["agentsmd", doctorAgentsMdCommand],
  ["agentsge", doctorAgentsgeCommand],
  ["agentsmesh", doctorAgentsmeshCommand],
  ["amazon-q", doctorAmazonQCommand],
  ["amp", doctorAmpCommand],
  ["antigravity", doctorAntigravityCommand],
  ["anywhere-agents", doctorAnywhereAgentsCommand],
  ["augment", doctorAugmentCommand],
  ["avante", doctorAvanteCommand],
  ["baz", doctorBazCommand],
  ["bito", doctorBitoCommand],
  ["blackbox", doctorBlackboxCommand],
  ["blocks", doctorBlocksCommand],
  ["clawdbot", doctorClawdbotCommand],
  ["bob", doctorBobCommand],
  ["builder", doctorBuilderCommand],
  ["charlie", doctorCharlieCommand],
  ["codex", doctorCodexCommand],
  ["pi", doctorPiCommand],
  ["pi-go", doctorPiGoCommand],
  ["pigo", doctorPiGoCommand],
  ["opencode", doctorOpencodeCommand],
  ["plandex", doctorPlandexCommand],
  ["ante", doctorAnteCommand],
  ["qoder", doctorQoderCommand],
  ["qoder-cli", doctorQoderCliCommand],
  ["replit", doctorReplitCommand],
  ["replit-agent", doctorReplitCommand],
  ["qwen-code", doctorQwenCodeCommand],
  ["qwenwork", doctorQwenWorkCommand],
  ["qoderwork", doctorQoderWorkCommand],
  ["command-code", doctorCommandCodeCommand],
  ["commandcode", doctorCommandCodeCommand],
  ["crush", doctorCrushCommand],
  ["cursor", doctorCursorCommand],
  ["deepagents", doctorDeepagentsCommand],
  ["devin", doctorDevinCommand],
  ["dot-agents", doctorDotAgentsCommand],
  ["docker-agent", doctorDockerAgentCommand],
  ["dockeragent", doctorDockerAgentCommand],
  ["cagent", doctorDockerAgentCommand],
  ["copilot-agent", doctorCopilotAgentCommand],
  ["eca", doctorEcaCommand],
  ["elyra", doctorElyraCommand],
  ["firebase-studio", doctorFirebaseStudioCommand],
  ["forgecode", doctorForgecodeCommand],
  ["forge-code", doctorForgecodeCommand],
  ["gemini-cli", doctorGeminiCliCommand],
  ["gitlab-duo", doctorGitlabDuoCommand],
  ["grok-cli", doctorGrokCliCommand],
  ["gptme", doctorGptmeCommand],
  ["jean2", doctorJean2Command],
  ["grok-build", doctorGrokBuildCommand],
  ["grok-bot", doctorGrokBotCommand],
  ["grokbot", doctorGrokBotCommand],
  ["goose", doctorGooseCommand],
  ["greptile", doctorGreptileCommand],
  ["qodo", doctorQodoCommand],
  ["coderabbit", doctorCoderabbitCommand],
  ["jetbrains-ai", doctorJetbrainsAiCommand],
  ["junie", doctorJunieCommand],
  ["jules", doctorJulesCommand],
  ["leanctl", doctorLeanctlCommand],
  ["kimi", doctorKimiCommand],
  ["localcode", doctorLocalcodeCommand],
  ["local-code", doctorLocalcodeCommand],
  ["openhands", doctorOpenhandsCommand],
  ["openwebui", doctorOpenwebuiCommand],
  ["mcp-agent", doctorMcpAgentCommand],
  ["mcpagent", doctorMcpAgentCommand],
  ["mini-swe-agent", doctorMiniSweAgentCommand],
  ["mini-sweagent", doctorMiniSweAgentCommand],
  ["swe-agent", doctorSweAgentCommand],
  ["sweagent", doctorSweAgentCommand],
  ["stagewise", doctorStagewiseCommand],
  ["open-interpreter", doctorOpenInterpreterCommand],
  ["openinterpreter", doctorOpenInterpreterCommand],
  ["vscode-copilot", doctorVscodeCopilotCommand],
  ["zed", doctorZedCommand],
  ["zencoder", doctorZencoderCommand],
  ["roo", doctorRooCommand],
  ["rovo", doctorRovoCommand],
  ["rovo-dev", doctorRovoCommand],
  ["ruler", doctorRulerCommand],
  ["tabnine", doctorTabnineCommand],
  ["tabby", doctorTabbyCommand],
  ["trae", doctorTraeCommand],
  ["uipath", doctorUipathCommand],
  ["kilo", doctorKiloCommand],
  ["mistral-vibe", doctorMistralVibeCommand],
  ["mistralvibe", doctorMistralVibeCommand],
  ["mux", doctorMuxCommand],
  ["novakit", doctorNovakitCommand],
  ["knowns", doctorKnownsCommand],
  ["ona", doctorOnaCommand],
  ["warp", doctorWarpCommand],
  ["kiro", doctorKiroCommand],
  ["windsurf", doctorWindsurfCommand],
  ["copilot-cli", doctorCopilotCliCommand],
  ["claude-code", doctorClaudeCodeCommand],
  ["cline", doctorClineCommand],
  ["codebuff", doctorCodebuffCommand],
  ["codeant", doctorCodeantCommand],
  ["codegen", doctorCodegenCommand],
  ["coder-agents", doctorCoderAgentsCommand],
  ["coderagents", doctorCoderAgentsCommand],
  ["codebuddy", doctorCodebuddyCommand],
  ["continue", doctorContinueCommand],
  ["droid", doctorDroidCommand],
]);
