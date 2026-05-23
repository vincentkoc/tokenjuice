export { ARTIFACT_DIR_ENV, getArtifact, isValidArtifactId, listArtifactMetadata, listArtifacts, resolveArtifactBaseDir, storeArtifact, storeArtifactMetadata } from "./core/artifacts.js";
export { buildAnalysisEntry, discoverCandidates, doctorArtifacts, statsArtifacts } from "./core/analysis.js";
export { classifyExecution } from "./core/classify.js";
export { normalizeCommandSignature, normalizeEffectiveCommandSignature, normalizeExecutionInput, tokenizeCommand } from "./core/command.js";
export { doctorAdalInstructions, installAdalInstructions, uninstallAdalInstructions } from "./hosts/adal/index.js";
export { doctorAetherPrompt, installAetherPrompt, uninstallAetherPrompt } from "./hosts/aether/index.js";
export { doctorAictlInstructions, installAictlInstructions, uninstallAictlInstructions } from "./hosts/aictl/index.js";
export { doctorAgentLayerInstructions, installAgentLayerInstructions, uninstallAgentLayerInstructions } from "./hosts/agent-layer/index.js";
export { doctorAgentInitInstructions, installAgentInitInstructions, uninstallAgentInitInstructions } from "./hosts/agentinit/index.js";
export { doctorAgentlinkInstructions, installAgentlinkInstructions, uninstallAgentlinkInstructions } from "./hosts/agentlink/index.js";
export { doctorAgentloomRule, installAgentloomRule, uninstallAgentloomRule } from "./hosts/agentloom/index.js";
export { doctorAgentsCliMemory, installAgentsCliMemory, uninstallAgentsCliMemory } from "./hosts/agents-cli/index.js";
export { doctorAgentsMdInstructions, installAgentsMdInstructions, uninstallAgentsMdInstructions } from "./hosts/agents-md/index.js";
export { doctorAgentsGeRule, installAgentsGeRule, uninstallAgentsGeRule } from "./hosts/agentsge/index.js";
export { doctorAgentsMeshRule, installAgentsMeshRule, uninstallAgentsMeshRule } from "./hosts/agentsmesh/index.js";
export { doctorAmazonQRule, installAmazonQRule, uninstallAmazonQRule } from "./hosts/amazon-q/index.js";
export { doctorAmpInstructions, installAmpInstructions, uninstallAmpInstructions } from "./hosts/amp/index.js";
export { doctorAntigravityRule, installAntigravityRule, uninstallAntigravityRule } from "./hosts/antigravity/index.js";
export { doctorAnywhereAgentsInstructions, installAnywhereAgentsInstructions, uninstallAnywhereAgentsInstructions } from "./hosts/anywhere-agents/index.js";
export { doctorAugmentRule, installAugmentRule, uninstallAugmentRule } from "./hosts/augment/index.js";
export { doctorAvanteInstructions, installAvanteInstructions, uninstallAvanteInstructions } from "./hosts/avante/index.js";
export { doctorAiderConvention, installAiderConvention, uninstallAiderConvention } from "./hosts/aider/index.js";
export { doctorBobInstructions, installBobInstructions, uninstallBobInstructions } from "./hosts/bob/index.js";
export { doctorBuilderRule, installBuilderRule, uninstallBuilderRule } from "./hosts/builder/index.js";
export { doctorClaudeCodeHook, installClaudeCodeHook, runClaudeCodePostToolUseHook, runClaudeCodePreToolUseHook } from "./hosts/claude-code/index.js";
export { doctorClineHook, installClineHook, runClinePostToolUseHook, uninstallClineHook } from "./hosts/cline/index.js";
export { doctorCodebuffInstructions, installCodebuffInstructions, uninstallCodebuffInstructions } from "./hosts/codebuff/index.js";
export { doctorCodegenInstructions, installCodegenInstructions, uninstallCodegenInstructions } from "./hosts/codegen/index.js";
export { doctorCoderAgentsSkill, installCoderAgentsSkill, uninstallCoderAgentsSkill } from "./hosts/coder-agents/index.js";
export { doctorCodeBuddyHook, installCodeBuddyHook, runCodeBuddyPreToolUseHook } from "./hosts/codebuddy/index.js";
export { doctorContinueRule, installContinueRule, uninstallContinueRule } from "./hosts/continue/index.js";
export {
  doctorCodexHook,
  inspectCodexHooksFeatureFlag,
  installCodexHook,
  parseCodexFeatureFlag,
  runCodexPostToolUseHook,
  uninstallCodexHook,
} from "./hosts/codex/index.js";
export type { CodexFeatureFlagStatus } from "./hosts/codex/index.js";
export {
  doctorCopilotAgentHook,
  installCopilotAgentHook,
  runCopilotAgentPostToolUseHook,
  uninstallCopilotAgentHook,
} from "./hosts/copilot-agent/index.js";
export {
  doctorCopilotCliHook,
  getCopilotCliInstructionsSnippet,
  installCopilotCliHook,
  runCopilotCliPostToolUseHook,
  uninstallCopilotCliHook,
} from "./hosts/copilot-cli/index.js";
export { doctorCrushSkill, installCrushSkill, uninstallCrushSkill } from "./hosts/crush/index.js";
export { doctorCursorHook, installCursorHook, runCursorPreToolUseHook } from "./hosts/cursor/index.js";
export { doctorDeepAgentsInstructions, installDeepAgentsInstructions, uninstallDeepAgentsInstructions } from "./hosts/deepagents/index.js";
export { doctorDevinHook, installDevinHook, runDevinPreToolUseHook, uninstallDevinHook } from "./hosts/devin/index.js";
export { doctorDotAgentsRule, installDotAgentsRule, uninstallDotAgentsRule } from "./hosts/dot-agents/index.js";
export { doctorDockerAgentPrompt, installDockerAgentPrompt, uninstallDockerAgentPrompt } from "./hosts/docker-agent/index.js";
export { doctorDroidHook, installDroidHook, runDroidPostToolUseHook, uninstallDroidHook } from "./hosts/droid/index.js";
export { doctorEcaSkill, installEcaSkill, uninstallEcaSkill } from "./hosts/eca/index.js";
export { doctorElyraSkill, installElyraSkill, uninstallElyraSkill } from "./hosts/elyra/index.js";
export { doctorFirebaseStudioRule, installFirebaseStudioRule, uninstallFirebaseStudioRule } from "./hosts/firebase-studio/index.js";
export { doctorForgeCodeInstructions, installForgeCodeInstructions, uninstallForgeCodeInstructions } from "./hosts/forgecode/index.js";
export { doctorGeminiCliHook, installGeminiCliHook, runGeminiCliAfterToolHook, uninstallGeminiCliHook } from "./hosts/gemini-cli/index.js";
export { doctorGitLabDuoRule, installGitLabDuoRule, uninstallGitLabDuoRule } from "./hosts/gitlab-duo/index.js";
export { doctorGooseHints, installGooseHints, uninstallGooseHints } from "./hosts/goose/index.js";
export { doctorGrokBuildInstructions, installGrokBuildInstructions, uninstallGrokBuildInstructions } from "./hosts/grok-build/index.js";
export { doctorGrokCliHook, installGrokCliHook, runGrokCliPostToolUseHook, uninstallGrokCliHook } from "./hosts/grok-cli/index.js";
export { doctorGptmeInstructions, installGptmeInstructions, uninstallGptmeInstructions } from "./hosts/gptme/index.js";
export { doctorJean2Instructions, installJean2Instructions, uninstallJean2Instructions } from "./hosts/jean2/index.js";
export { doctorJetBrainsAiRule, installJetBrainsAiRule, uninstallJetBrainsAiRule } from "./hosts/jetbrains-ai/index.js";
export { doctorJunieInstructions, installJunieInstructions, uninstallJunieInstructions } from "./hosts/junie/index.js";
export { doctorJulesInstructions, installJulesInstructions, uninstallJulesInstructions } from "./hosts/jules/index.js";
export { doctorLeanCtlInstructions, installLeanCtlInstructions, uninstallLeanCtlInstructions } from "./hosts/leanctl/index.js";
export { doctorKimiHook, installKimiHook, runKimiPostToolUseHook, uninstallKimiHook } from "./hosts/kimi/index.js";
export { doctorKiroSteering, installKiroSteering, uninstallKiroSteering } from "./hosts/kiro/index.js";
export { doctorKiloRule, installKiloRule, uninstallKiloRule } from "./hosts/kilo/index.js";
export { doctorKnownsInstructions, installKnownsInstructions, uninstallKnownsInstructions } from "./hosts/knowns/index.js";
export { doctorMcpAgentDefinition, installMcpAgentDefinition, uninstallMcpAgentDefinition } from "./hosts/mcp-agent/index.js";
export { doctorMiniSweAgentConfig, installMiniSweAgentConfig, uninstallMiniSweAgentConfig } from "./hosts/mini-swe-agent/index.js";
export { doctorSweAgentConfig, installSweAgentConfig, uninstallSweAgentConfig } from "./hosts/swe-agent/index.js";
export { doctorMistralVibeInstructions, installMistralVibeInstructions, uninstallMistralVibeInstructions } from "./hosts/mistral-vibe/index.js";
export { doctorMuxHook, installMuxHook, runMuxPostToolUseHook, uninstallMuxHook } from "./hosts/mux/index.js";
export { doctorNovaKitInstructions, installNovaKitInstructions, uninstallNovaKitInstructions } from "./hosts/novakit/index.js";
export { doctorOnaInstructions, installOnaInstructions, uninstallOnaInstructions } from "./hosts/ona/index.js";
export { doctorOpenHandsHook, installOpenHandsHook, runOpenHandsPostToolUseHook, uninstallOpenHandsHook } from "./hosts/openhands/index.js";
export { doctorOpenInterpreterInstructions, installOpenInterpreterInstructions, uninstallOpenInterpreterInstructions } from "./hosts/open-interpreter/index.js";
export { doctorOpenWebUITool, installOpenWebUITool, uninstallOpenWebUITool } from "./hosts/openwebui/index.js";
export { doctorPiGoSkill, installPiGoSkill, uninstallPiGoSkill } from "./hosts/pi-go/index.js";
export { doctorPlandexConvention, installPlandexConvention, uninstallPlandexConvention } from "./hosts/plandex/index.js";
export { doctorQoderInstructions, installQoderInstructions, uninstallQoderInstructions } from "./hosts/qoder/index.js";
export { doctorReplitInstructions, installReplitInstructions, uninstallReplitInstructions } from "./hosts/replit/index.js";
export { doctorRooInstructions, installRooInstructions, uninstallRooInstructions } from "./hosts/roo/index.js";
export { doctorRovoInstructions, installRovoInstructions, uninstallRovoInstructions } from "./hosts/rovo/index.js";
export { doctorTraeRule, installTraeRule, uninstallTraeRule } from "./hosts/trae/index.js";
export { doctorTabnineInstructions, installTabnineInstructions, uninstallTabnineInstructions } from "./hosts/tabnine/index.js";
export { doctorUiPathInstructions, installUiPathInstructions, uninstallUiPathInstructions } from "./hosts/uipath/index.js";
export {
  doctorVscodeCopilotHook,
  getVscodeCopilotInstructionsSnippet,
  installVscodeCopilotHook,
  runVscodeCopilotPreToolUseHook,
  uninstallVscodeCopilotHook,
} from "./hosts/vscode-copilot/index.js";
export { doctorWarpInstructions, installWarpInstructions, uninstallWarpInstructions } from "./hosts/warp/index.js";
export { doctorWindsurfRule, installWindsurfRule, uninstallWindsurfRule } from "./hosts/windsurf/index.js";
export { doctorZedInstructions, installZedInstructions, uninstallZedInstructions } from "./hosts/zed/index.js";
export { doctorZencoderRule, installZencoderRule, uninstallZencoderRule } from "./hosts/zencoder/index.js";
export { doctorInstalledHooks } from "./hosts/shared/hook-doctor.js";
export { doctorPiExtension, installPiExtension } from "./hosts/pi/index.js";
export {
  doctorOpenCodeExtension,
  installOpenCodeExtension,
  uninstallOpenCodeExtension,
} from "./hosts/opencode/index.js";
export { doctorQwenCodeHook, installQwenCodeHook, runQwenCodePostToolUseHook, uninstallQwenCodeHook } from "./hosts/qwen-code/index.js";
export { doctorRulerRule, installRulerRule, uninstallRulerRule } from "./hosts/ruler/index.js";
export { runReduceJsonCli } from "./core/cli-client.js";
export { clearFixtureCache, loadBuiltinFixtures, verifyBuiltinFixtures } from "./core/fixtures.js";
export { parseReduceJsonRequest } from "./core/json-protocol.js";
export { classifyOnly, findMatchingRule, reduceExecution, reduceExecutionWithRules } from "./core/reduce.js";
export { clearRuleCache, loadBuiltinRules, loadRules, verifyBuiltinRules, verifyRules } from "./core/rules.js";
export { normalizeArtifactSource, readStoredArtifactSource, resolveArtifactSource } from "./core/source.js";
export { clampText, countTerminalCells, countTextChars, stripAnsi } from "./core/text.js";
export { runWrappedCommand } from "./core/wrap.js";
export { assertValidRule, validateRule } from "./core/validate-rules.js";

export type {
  ArtifactMetadataRef,
  ClassificationResult,
  CompiledRule,
  CompactResult,
  JsonRule,
  RuleFixture,
  ReduceJsonCliOptions,
  ReduceOptions,
  ReduceJsonRequest,
  StoredArtifact,
  StoredArtifactMetadata,
  StoredArtifactRef,
  ToolExecutionInput,
  WrapOptions,
  WrapResult,
} from "./types.js";
export type {
  AdalDoctorReport,
  AdalInstructionsOptions,
  InstallAdalInstructionsResult,
  UninstallAdalInstructionsResult,
} from "./hosts/adal/index.js";
export type {
  AetherDoctorReport,
  AetherPromptOptions,
  InstallAetherPromptResult,
  UninstallAetherPromptResult,
} from "./hosts/aether/index.js";
export type {
  AgentLayerDoctorReport,
  AgentLayerInstructionsOptions,
  InstallAgentLayerInstructionsResult,
  UninstallAgentLayerInstructionsResult,
} from "./hosts/agent-layer/index.js";
export type {
  AgentInitDoctorReport,
  AgentInitInstructionsOptions,
  InstallAgentInitInstructionsResult,
  UninstallAgentInitInstructionsResult,
} from "./hosts/agentinit/index.js";
export type {
  AgentlinkDoctorReport,
  AgentlinkInstructionsOptions,
  InstallAgentlinkInstructionsResult,
  UninstallAgentlinkInstructionsResult,
} from "./hosts/agentlink/index.js";
export type {
  AgentloomDoctorReport,
  AgentloomRuleOptions,
  InstallAgentloomRuleResult,
  UninstallAgentloomRuleResult,
} from "./hosts/agentloom/index.js";
export type {
  AgentsCliDoctorReport,
  AgentsCliMemoryOptions,
  InstallAgentsCliMemoryResult,
  UninstallAgentsCliMemoryResult,
} from "./hosts/agents-cli/index.js";
export type {
  AgentsMdDoctorReport,
  AgentsMdInstructionsOptions,
  InstallAgentsMdInstructionsResult,
  UninstallAgentsMdInstructionsResult,
} from "./hosts/agents-md/index.js";
export type {
  AgentsGeDoctorReport,
  AgentsGeRuleOptions,
  InstallAgentsGeRuleResult,
  UninstallAgentsGeRuleResult,
} from "./hosts/agentsge/index.js";
export type {
  AgentsMeshDoctorReport,
  AgentsMeshRuleOptions,
  InstallAgentsMeshRuleResult,
  UninstallAgentsMeshRuleResult,
} from "./hosts/agentsmesh/index.js";
export type {
  AmazonQDoctorReport,
  AmazonQRuleOptions,
  InstallAmazonQRuleResult,
  UninstallAmazonQRuleResult,
} from "./hosts/amazon-q/index.js";
export type {
  AmpDoctorReport,
  AmpInstructionsOptions,
  InstallAmpInstructionsResult,
  UninstallAmpInstructionsResult,
} from "./hosts/amp/index.js";
export type {
  AntigravityDoctorReport,
  AntigravityRuleOptions,
  InstallAntigravityRuleResult,
  UninstallAntigravityRuleResult,
} from "./hosts/antigravity/index.js";
export type {
  AnywhereAgentsDoctorReport,
  AnywhereAgentsInstructionsOptions,
  InstallAnywhereAgentsInstructionsResult,
  UninstallAnywhereAgentsInstructionsResult,
} from "./hosts/anywhere-agents/index.js";
export type {
  AugmentDoctorReport,
  AugmentRuleOptions,
  InstallAugmentRuleResult,
  UninstallAugmentRuleResult,
} from "./hosts/augment/index.js";
export type {
  AiderConventionOptions,
  AiderDoctorReport,
  InstallAiderConventionResult,
  UninstallAiderConventionResult,
} from "./hosts/aider/index.js";
export type {
  AictlDoctorReport,
  AictlInstructionsOptions,
  InstallAictlInstructionsResult,
  UninstallAictlInstructionsResult,
} from "./hosts/aictl/index.js";
export type {
  AvanteDoctorReport,
  AvanteInstructionsOptions,
  InstallAvanteInstructionsResult,
  UninstallAvanteInstructionsResult,
} from "./hosts/avante/index.js";
export type {
  BobDoctorReport,
  BobInstructionsOptions,
  InstallBobInstructionsResult,
  UninstallBobInstructionsResult,
} from "./hosts/bob/index.js";
export type {
  BuilderDoctorReport,
  BuilderRuleOptions,
  InstallBuilderRuleResult,
  UninstallBuilderRuleResult,
} from "./hosts/builder/index.js";
export type { InstallPiExtensionResult, PiDoctorReport, PiExtensionCommandOptions } from "./hosts/pi/index.js";
export type {
  InstallPiGoSkillResult,
  PiGoDoctorReport,
  PiGoSkillOptions,
  UninstallPiGoSkillResult,
} from "./hosts/pi-go/index.js";
export type {
  ClineDoctorReport,
  ClineHookCommandOptions,
  InstallClineHookResult,
  UninstallClineHookResult,
} from "./hosts/cline/index.js";
export type {
  CodebuffDoctorReport,
  CodebuffInstructionsOptions,
  InstallCodebuffInstructionsResult,
  UninstallCodebuffInstructionsResult,
} from "./hosts/codebuff/index.js";
export type {
  CodegenDoctorReport,
  CodegenInstructionsOptions,
  InstallCodegenInstructionsResult,
  UninstallCodegenInstructionsResult,
} from "./hosts/codegen/index.js";
export type {
  CoderAgentsDoctorReport,
  CoderAgentsSkillOptions,
  InstallCoderAgentsSkillResult,
  UninstallCoderAgentsSkillResult,
} from "./hosts/coder-agents/index.js";
export type {
  ContinueDoctorReport,
  ContinueRuleOptions,
  InstallContinueRuleResult,
  UninstallContinueRuleResult,
} from "./hosts/continue/index.js";
export type {
  InstallOpenCodeExtensionResult,
  OpenCodeDoctorReport,
  OpenCodeExtensionCommandOptions,
  UninstallOpenCodeExtensionResult,
} from "./hosts/opencode/index.js";
export type { CursorDoctorReport, InstallCursorHookResult } from "./hosts/cursor/index.js";
export type {
  DeepAgentsDoctorReport,
  DeepAgentsInstructionsOptions,
  InstallDeepAgentsInstructionsResult,
  UninstallDeepAgentsInstructionsResult,
} from "./hosts/deepagents/index.js";
export type {
  DotAgentsDoctorReport,
  DotAgentsRuleOptions,
  InstallDotAgentsRuleResult,
  UninstallDotAgentsRuleResult,
} from "./hosts/dot-agents/index.js";
export type {
  DockerAgentDoctorReport,
  DockerAgentPromptOptions,
  InstallDockerAgentPromptResult,
  UninstallDockerAgentPromptResult,
} from "./hosts/docker-agent/index.js";
export type {
  DroidDoctorReport,
  DroidHookCommandOptions,
  InstallDroidHookResult,
  UninstallDroidHookResult,
} from "./hosts/droid/index.js";
export type {
  EcaDoctorReport,
  EcaSkillOptions,
  InstallEcaSkillResult,
  UninstallEcaSkillResult,
} from "./hosts/eca/index.js";
export type {
  ElyraDoctorReport,
  ElyraSkillOptions,
  InstallElyraSkillResult,
  UninstallElyraSkillResult,
} from "./hosts/elyra/index.js";
export type {
  FirebaseStudioDoctorReport,
  FirebaseStudioRuleOptions,
  InstallFirebaseStudioRuleResult,
  UninstallFirebaseStudioRuleResult,
} from "./hosts/firebase-studio/index.js";
export type {
  ForgeCodeDoctorReport,
  ForgeCodeInstructionsOptions,
  InstallForgeCodeInstructionsResult,
  UninstallForgeCodeInstructionsResult,
} from "./hosts/forgecode/index.js";
export type {
  GeminiCliDoctorReport,
  GeminiCliHookCommandOptions,
  InstallGeminiCliHookResult,
  UninstallGeminiCliHookResult,
} from "./hosts/gemini-cli/index.js";
export type {
  GitLabDuoDoctorReport,
  GitLabDuoRuleOptions,
  InstallGitLabDuoRuleResult,
  UninstallGitLabDuoRuleResult,
} from "./hosts/gitlab-duo/index.js";
export type {
  GooseDoctorReport,
  GooseHintsOptions,
  InstallGooseHintsResult,
  UninstallGooseHintsResult,
} from "./hosts/goose/index.js";
export type {
  GrokBuildDoctorReport,
  GrokBuildInstructionsOptions,
  InstallGrokBuildInstructionsResult,
  UninstallGrokBuildInstructionsResult,
} from "./hosts/grok-build/index.js";
export type {
  GrokCliDoctorReport,
  GrokCliHookCommandOptions,
  InstallGrokCliHookResult,
  UninstallGrokCliHookResult,
} from "./hosts/grok-cli/index.js";
export type {
  GptmeDoctorReport,
  GptmeInstructionsOptions,
  InstallGptmeInstructionsResult,
  UninstallGptmeInstructionsResult,
} from "./hosts/gptme/index.js";
export type {
  InstallJean2InstructionsResult,
  Jean2DoctorReport,
  Jean2InstructionsOptions,
  UninstallJean2InstructionsResult,
} from "./hosts/jean2/index.js";
export type {
  InstallJetBrainsAiRuleResult,
  JetBrainsAiDoctorReport,
  JetBrainsAiRuleOptions,
  UninstallJetBrainsAiRuleResult,
} from "./hosts/jetbrains-ai/index.js";
export type {
  InstallJunieInstructionsResult,
  JunieDoctorReport,
  JunieInstructionsOptions,
  UninstallJunieInstructionsResult,
} from "./hosts/junie/index.js";
export type {
  InstallJulesInstructionsResult,
  JulesDoctorReport,
  JulesInstructionsOptions,
  UninstallJulesInstructionsResult,
} from "./hosts/jules/index.js";
export type {
  InstallLeanCtlInstructionsResult,
  LeanCtlDoctorReport,
  LeanCtlInstructionsOptions,
  UninstallLeanCtlInstructionsResult,
} from "./hosts/leanctl/index.js";
export type {
  InstallKimiHookResult,
  KimiDoctorReport,
  KimiHookCommandOptions,
  UninstallKimiHookResult,
} from "./hosts/kimi/index.js";
export type {
  InstallKiroSteeringResult,
  KiroDoctorReport,
  KiroSteeringOptions,
  UninstallKiroSteeringResult,
} from "./hosts/kiro/index.js";
export type {
  InstallKiloRuleResult,
  KiloDoctorReport,
  KiloRuleOptions,
  UninstallKiloRuleResult,
} from "./hosts/kilo/index.js";
export type {
  InstallMcpAgentDefinitionResult,
  McpAgentDefinitionOptions,
  McpAgentDoctorReport,
  UninstallMcpAgentDefinitionResult,
} from "./hosts/mcp-agent/index.js";
export type {
  InstallMiniSweAgentConfigResult,
  MiniSweAgentConfigOptions,
  MiniSweAgentDoctorReport,
  UninstallMiniSweAgentConfigResult,
} from "./hosts/mini-swe-agent/index.js";
export type {
  InstallSweAgentConfigResult,
  SweAgentConfigOptions,
  SweAgentDoctorReport,
  UninstallSweAgentConfigResult,
} from "./hosts/swe-agent/index.js";
export type {
  InstallMistralVibeInstructionsResult,
  MistralVibeDoctorReport,
  MistralVibeInstructionsOptions,
  UninstallMistralVibeInstructionsResult,
} from "./hosts/mistral-vibe/index.js";
export type {
  InstallMuxHookResult,
  MuxDoctorReport,
  MuxHookCommandOptions,
  UninstallMuxHookResult,
} from "./hosts/mux/index.js";
export type {
  InstallNovaKitInstructionsResult,
  NovaKitDoctorReport,
  NovaKitInstructionsOptions,
  UninstallNovaKitInstructionsResult,
} from "./hosts/novakit/index.js";
export type {
  InstallKnownsInstructionsResult,
  KnownsDoctorReport,
  KnownsInstructionsOptions,
  UninstallKnownsInstructionsResult,
} from "./hosts/knowns/index.js";
export type {
  InstallOpenHandsHookResult,
  OpenHandsDoctorReport,
  OpenHandsHookCommandOptions,
  UninstallOpenHandsHookResult,
} from "./hosts/openhands/index.js";
export type {
  InstallOpenInterpreterInstructionsResult,
  OpenInterpreterDoctorReport,
  OpenInterpreterInstructionsOptions,
  UninstallOpenInterpreterInstructionsResult,
} from "./hosts/open-interpreter/index.js";
export type {
  InstallOpenWebUIToolResult,
  OpenWebUIDoctorReport,
  OpenWebUIToolOptions,
  UninstallOpenWebUIToolResult,
} from "./hosts/openwebui/index.js";
export type {
  InstallPlandexConventionResult,
  PlandexConventionOptions,
  PlandexDoctorReport,
  UninstallPlandexConventionResult,
} from "./hosts/plandex/index.js";
export type {
  InstallQoderInstructionsResult,
  QoderDoctorReport,
  QoderInstructionsOptions,
  UninstallQoderInstructionsResult,
} from "./hosts/qoder/index.js";
export type {
  InstallQwenCodeHookResult,
  QwenCodeDoctorReport,
  QwenCodeHookCommandOptions,
  UninstallQwenCodeHookResult,
} from "./hosts/qwen-code/index.js";
export type {
  InstallOnaInstructionsResult,
  OnaDoctorReport,
  OnaInstructionsOptions,
  UninstallOnaInstructionsResult,
} from "./hosts/ona/index.js";
export type {
  InstallReplitInstructionsResult,
  ReplitDoctorReport,
  ReplitInstructionsOptions,
  UninstallReplitInstructionsResult,
} from "./hosts/replit/index.js";
export type {
  InstallRooInstructionsResult,
  RooDoctorReport,
  RooInstructionsOptions,
  UninstallRooInstructionsResult,
} from "./hosts/roo/index.js";
export type {
  InstallRovoInstructionsResult,
  RovoDoctorReport,
  RovoInstructionsOptions,
  UninstallRovoInstructionsResult,
} from "./hosts/rovo/index.js";
export type {
  InstallTabnineInstructionsResult,
  TabnineDoctorReport,
  TabnineInstructionsOptions,
  UninstallTabnineInstructionsResult,
} from "./hosts/tabnine/index.js";
export type {
  InstallRulerRuleResult,
  RulerDoctorReport,
  RulerRuleOptions,
  UninstallRulerRuleResult,
} from "./hosts/ruler/index.js";
export type {
  InstallTraeRuleResult,
  TraeDoctorReport,
  TraeRuleOptions,
  UninstallTraeRuleResult,
} from "./hosts/trae/index.js";
export type {
  InstallUiPathInstructionsResult,
  UiPathDoctorReport,
  UiPathInstructionsOptions,
  UninstallUiPathInstructionsResult,
} from "./hosts/uipath/index.js";
export type {
  InstallVscodeCopilotHookResult,
  UninstallVscodeCopilotHookResult,
  VscodeCopilotDoctorReport,
  VscodeCopilotHookCommandOptions,
} from "./hosts/vscode-copilot/index.js";
export type {
  InstallWarpInstructionsResult,
  UninstallWarpInstructionsResult,
  WarpDoctorReport,
  WarpInstructionsOptions,
} from "./hosts/warp/index.js";
export type {
  InstallWindsurfRuleResult,
  UninstallWindsurfRuleResult,
  WindsurfDoctorReport,
  WindsurfRuleOptions,
} from "./hosts/windsurf/index.js";
export type {
  InstallZedInstructionsResult,
  UninstallZedInstructionsResult,
  ZedDoctorReport,
  ZedInstructionsOptions,
} from "./hosts/zed/index.js";
export type {
  InstallZencoderRuleResult,
  UninstallZencoderRuleResult,
  ZencoderDoctorReport,
  ZencoderRuleOptions,
} from "./hosts/zencoder/index.js";
export type {
  CopilotAgentDoctorReport,
  CopilotAgentHookCommandOptions,
  InstallCopilotAgentHookResult,
  UninstallCopilotAgentHookResult,
} from "./hosts/copilot-agent/index.js";
export type {
  CopilotCliDoctorReport,
  CopilotCliHookCommandOptions,
  InstallCopilotCliHookResult,
  UninstallCopilotCliHookResult,
} from "./hosts/copilot-cli/index.js";
export type {
  CrushDoctorReport,
  CrushSkillOptions,
  InstallCrushSkillResult,
  UninstallCrushSkillResult,
} from "./hosts/crush/index.js";
export type {
  DevinDoctorReport,
  DevinHookCommandOptions,
  InstallDevinHookResult,
  UninstallDevinHookResult,
} from "./hosts/devin/index.js";
export type { DiscoverOptions, StatsOptions, StatsReport, StatsSourceReport } from "./core/analysis.js";
