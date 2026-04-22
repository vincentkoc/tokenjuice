export { getArtifact, isValidArtifactId, listArtifactMetadata, listArtifacts, storeArtifact, storeArtifactMetadata } from "./core/artifacts.js";
export { buildAnalysisEntry, discoverCandidates, doctorArtifacts, statsArtifacts } from "./core/analysis.js";
export { classifyExecution } from "./core/classify.js";
export { normalizeCommandSignature, normalizeEffectiveCommandSignature, normalizeExecutionInput, tokenizeCommand } from "./core/command.js";
export { doctorClaudeCodeHook, installClaudeCodeHook, runClaudeCodePostToolUseHook } from "./hosts/claude-code/index.js";
export { doctorCodeBuddyHook, installCodeBuddyHook, runCodeBuddyPreToolUseHook } from "./hosts/codebuddy/index.js";
export {
  doctorCodexHook,
  inspectCodexHooksFeatureFlag,
  installCodexHook,
  parseCodexFeatureFlag,
  runCodexPostToolUseHook,
  uninstallCodexHook,
} from "./hosts/codex/index.js";
export type { CodexFeatureFlagStatus } from "./hosts/codex/index.js";
export { doctorCursorHook, installCursorHook, runCursorPreToolUseHook } from "./hosts/cursor/index.js";
export { doctorInstalledHooks } from "./hosts/shared/hook-doctor.js";
export { doctorPiExtension, installPiExtension } from "./hosts/pi/index.js";
export { runReduceJsonCli } from "./core/cli-client.js";
export { clearFixtureCache, loadBuiltinFixtures, verifyBuiltinFixtures } from "./core/fixtures.js";
export { parseReduceJsonRequest } from "./core/json-protocol.js";
export { classifyOnly, findMatchingRule, reduceExecution, reduceExecutionWithRules } from "./core/reduce.js";
export { clearRuleCache, loadBuiltinRules, loadRules, verifyBuiltinRules, verifyRules } from "./core/rules.js";
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
export type { InstallPiExtensionResult, PiDoctorReport, PiExtensionCommandOptions } from "./hosts/pi/index.js";
export type { CursorDoctorReport, InstallCursorHookResult } from "./hosts/cursor/index.js";
export type { StatsOptions, StatsReport } from "./core/analysis.js";
