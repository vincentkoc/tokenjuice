export { getArtifact, listArtifactMetadata, listArtifacts, storeArtifact } from "./core/artifacts.js";
export { buildAnalysisEntry, discoverCandidates, doctorArtifacts, normalizeCommandSignature, statsArtifacts } from "./core/analysis.js";
export { classifyExecution } from "./core/classify.js";
export { clearFixtureCache, loadBuiltinFixtures, verifyBuiltinFixtures } from "./core/fixtures.js";
export { parseReduceJsonRequest } from "./core/json-protocol.js";
export { classifyOnly, findMatchingRule, reduceExecution, reduceExecutionWithRules } from "./core/reduce.js";
export { clearRuleCache, loadBuiltinRules, loadRules, verifyBuiltinRules, verifyRules } from "./core/rules.js";
export { runWrappedCommand } from "./core/wrap.js";
export { assertValidRule, validateRule } from "./core/validate-rules.js";

export type {
  ArtifactMetadataRef,
  ClassificationResult,
  CompiledRule,
  CompactResult,
  JsonRule,
  RuleFixture,
  ReduceOptions,
  ReduceJsonRequest,
  StoredArtifact,
  StoredArtifactMetadata,
  StoredArtifactRef,
  ToolExecutionInput,
  WrapOptions,
  WrapResult,
} from "./types.js";
