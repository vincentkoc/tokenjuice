export { getArtifact, isValidArtifactId, listArtifactMetadata, listArtifacts, storeArtifact, storeArtifactMetadata } from "./core/artifacts.js";
export { buildAnalysisEntry, discoverCandidates, doctorArtifacts, statsArtifacts } from "./core/analysis.js";
export { classifyExecution } from "./core/classify.js";
export { doctorClaudeCodeHook, installClaudeCodeHook, runClaudeCodePostToolUseHook } from "./core/claude-code.js";
export { normalizeCommandSignature, normalizeExecutionInput, tokenizeCommand } from "./core/command.js";
export {
  doctorCodexHook,
  inspectCodexHooksFeatureFlag,
  installCodexHook,
  parseCodexFeatureFlag,
  runCodexPostToolUseHook,
  uninstallCodexHook,
} from "./core/codex.js";
export type { CodexFeatureFlagStatus } from "./core/codex.js";
export { doctorInstalledHooks } from "./core/hook-doctor.js";
export { doctorPiExtension, installPiExtension } from "./core/pi.js";
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
export type { InstallPiExtensionResult, PiDoctorReport, PiExtensionCommandOptions } from "./core/pi.js";
export type { StatsOptions, StatsReport } from "./core/analysis.js";
