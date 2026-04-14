export { getArtifact, listArtifactMetadata, listArtifacts, storeArtifact } from "./core/artifacts.js";
export { discoverCandidates, doctorArtifacts, normalizeCommandSignature } from "./core/analysis.js";
export { classifyExecution } from "./core/classify.js";
export { classifyOnly, findMatchingRule, reduceExecution } from "./core/reduce.js";
export { clearRuleCache, loadBuiltinRules, loadRules, verifyBuiltinRules, verifyRules } from "./core/rules.js";
export { runWrappedCommand } from "./core/wrap.js";
export { assertValidRule, validateRule } from "./core/validate-rules.js";

export type {
  ArtifactMetadataRef,
  ClassificationResult,
  CompiledRule,
  CompactResult,
  JsonRule,
  ReduceOptions,
  StoredArtifact,
  StoredArtifactMetadata,
  StoredArtifactRef,
  ToolExecutionInput,
  WrapOptions,
  WrapResult,
} from "./types.js";
