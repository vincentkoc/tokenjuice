export { ARTIFACT_DIR_ENV, getArtifact, isValidArtifactId, listArtifactMetadata, listArtifacts, resolveArtifactBaseDir, storeArtifact, storeArtifactMetadata } from "./core/artifacts.js";
export { buildAnalysisEntry, discoverCandidates, doctorArtifacts, statsArtifacts } from "./core/analysis.js";
export { classifyExecution } from "./core/classify.js";
export { normalizeCommandSignature, normalizeEffectiveCommandSignature, normalizeExecutionInput, tokenizeCommand } from "./core/command.js";
export { doctorAmpInstructions, installAmpInstructions, uninstallAmpInstructions } from "./hosts/amp/index.js";
export { doctorAvanteInstructions, installAvanteInstructions, uninstallAvanteInstructions } from "./hosts/avante/index.js";
export { doctorAiderConvention, installAiderConvention, uninstallAiderConvention } from "./hosts/aider/index.js";
export { doctorClaudeCodeHook, installClaudeCodeHook, runClaudeCodePostToolUseHook, runClaudeCodePreToolUseHook } from "./hosts/claude-code/index.js";
export { doctorClineHook, installClineHook, runClinePostToolUseHook, uninstallClineHook } from "./hosts/cline/index.js";
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
export { doctorDroidHook, installDroidHook, runDroidPostToolUseHook, uninstallDroidHook } from "./hosts/droid/index.js";
export { doctorGeminiCliHook, installGeminiCliHook, runGeminiCliAfterToolHook, uninstallGeminiCliHook } from "./hosts/gemini-cli/index.js";
export { doctorGooseHints, installGooseHints, uninstallGooseHints } from "./hosts/goose/index.js";
export { doctorGrokCliHook, installGrokCliHook, runGrokCliPostToolUseHook, uninstallGrokCliHook } from "./hosts/grok-cli/index.js";
export { doctorJunieInstructions, installJunieInstructions, uninstallJunieInstructions } from "./hosts/junie/index.js";
export { doctorKiroSteering, installKiroSteering, uninstallKiroSteering } from "./hosts/kiro/index.js";
export { doctorKiloRule, installKiloRule, uninstallKiloRule } from "./hosts/kilo/index.js";
export { doctorOpenHandsHook, installOpenHandsHook, runOpenHandsPostToolUseHook, uninstallOpenHandsHook } from "./hosts/openhands/index.js";
export { doctorOpenInterpreterInstructions, installOpenInterpreterInstructions, uninstallOpenInterpreterInstructions } from "./hosts/open-interpreter/index.js";
export { doctorOpenWebUITool, installOpenWebUITool, uninstallOpenWebUITool } from "./hosts/openwebui/index.js";
export { doctorPlandexConvention, installPlandexConvention, uninstallPlandexConvention } from "./hosts/plandex/index.js";
export { doctorRooInstructions, installRooInstructions, uninstallRooInstructions } from "./hosts/roo/index.js";
export {
  doctorVscodeCopilotHook,
  getVscodeCopilotInstructionsSnippet,
  installVscodeCopilotHook,
  runVscodeCopilotPreToolUseHook,
  uninstallVscodeCopilotHook,
} from "./hosts/vscode-copilot/index.js";
export { doctorWindsurfRule, installWindsurfRule, uninstallWindsurfRule } from "./hosts/windsurf/index.js";
export { doctorZedInstructions, installZedInstructions, uninstallZedInstructions } from "./hosts/zed/index.js";
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
  AmpDoctorReport,
  AmpInstructionsOptions,
  InstallAmpInstructionsResult,
  UninstallAmpInstructionsResult,
} from "./hosts/amp/index.js";
export type {
  AiderConventionOptions,
  AiderDoctorReport,
  InstallAiderConventionResult,
  UninstallAiderConventionResult,
} from "./hosts/aider/index.js";
export type {
  AvanteDoctorReport,
  AvanteInstructionsOptions,
  InstallAvanteInstructionsResult,
  UninstallAvanteInstructionsResult,
} from "./hosts/avante/index.js";
export type { InstallPiExtensionResult, PiDoctorReport, PiExtensionCommandOptions } from "./hosts/pi/index.js";
export type {
  ClineDoctorReport,
  ClineHookCommandOptions,
  InstallClineHookResult,
  UninstallClineHookResult,
} from "./hosts/cline/index.js";
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
  DroidDoctorReport,
  DroidHookCommandOptions,
  InstallDroidHookResult,
  UninstallDroidHookResult,
} from "./hosts/droid/index.js";
export type {
  GeminiCliDoctorReport,
  GeminiCliHookCommandOptions,
  InstallGeminiCliHookResult,
  UninstallGeminiCliHookResult,
} from "./hosts/gemini-cli/index.js";
export type {
  GooseDoctorReport,
  GooseHintsOptions,
  InstallGooseHintsResult,
  UninstallGooseHintsResult,
} from "./hosts/goose/index.js";
export type {
  GrokCliDoctorReport,
  GrokCliHookCommandOptions,
  InstallGrokCliHookResult,
  UninstallGrokCliHookResult,
} from "./hosts/grok-cli/index.js";
export type {
  InstallJunieInstructionsResult,
  JunieDoctorReport,
  JunieInstructionsOptions,
  UninstallJunieInstructionsResult,
} from "./hosts/junie/index.js";
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
  InstallQwenCodeHookResult,
  QwenCodeDoctorReport,
  QwenCodeHookCommandOptions,
  UninstallQwenCodeHookResult,
} from "./hosts/qwen-code/index.js";
export type {
  InstallRooInstructionsResult,
  RooDoctorReport,
  RooInstructionsOptions,
  UninstallRooInstructionsResult,
} from "./hosts/roo/index.js";
export type {
  InstallRulerRuleResult,
  RulerDoctorReport,
  RulerRuleOptions,
  UninstallRulerRuleResult,
} from "./hosts/ruler/index.js";
export type {
  InstallVscodeCopilotHookResult,
  UninstallVscodeCopilotHookResult,
  VscodeCopilotDoctorReport,
  VscodeCopilotHookCommandOptions,
} from "./hosts/vscode-copilot/index.js";
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
export type { DiscoverOptions, StatsOptions, StatsReport, StatsSourceReport } from "./core/analysis.js";
