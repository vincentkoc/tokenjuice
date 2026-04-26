export type ToolExecutionInput = {
  toolName: string;
  toolCallId?: string;
  runId?: string;
  command?: string;
  argv?: string[];
  args?: Record<string, unknown>;
  cwd?: string;
  partial?: boolean;
  stdout?: string;
  stderr?: string;
  combinedText?: string;
  exitCode?: number;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

export type RuleCounter = {
  name: string;
  pattern: string;
  flags?: string;
};

export type RuleOutputMatch = {
  pattern: string;
  message: string;
  flags?: string;
};

export type RuleMatch = {
  toolNames?: string[];
  argv0?: string[];
  gitSubcommands?: string[];
  argvIncludes?: string[][];
  argvIncludesAny?: string[][];
  commandIncludes?: string[];
  commandIncludesAny?: string[];
};

export type RuleFilters = {
  skipPatterns?: string[];
  keepPatterns?: string[];
};

export type RuleTransforms = {
  stripAnsi?: boolean;
  prettyPrintJson?: boolean;
  dedupeAdjacent?: boolean;
  trimEmptyEdges?: boolean;
};

export type RuleSummarize = {
  head?: number;
  tail?: number;
};

export type RuleFailure = {
  preserveOnFailure?: boolean;
  head?: number;
  tail?: number;
};

export type JsonRule = {
  id: string;
  family: string;
  description?: string;
  priority?: number;
  onEmpty?: string;
  matchOutput?: RuleOutputMatch[];
  counterSource?: "postKeep" | "preKeep";
  match: RuleMatch;
  filters?: RuleFilters;
  transforms?: RuleTransforms;
  summarize?: RuleSummarize;
  counters?: RuleCounter[];
  failure?: RuleFailure;
};

export type RuleOrigin = "builtin" | "user" | "project";

export type CompiledRule = {
  rule: JsonRule;
  source: RuleOrigin;
  path: string;
  compiled: {
    skipPatterns: RegExp[];
    keepPatterns: RegExp[];
    counters: Array<{
      name: string;
      pattern: RegExp;
    }>;
    outputMatches: Array<{
      pattern: RegExp;
      message: string;
    }>;
  };
};

export type CommandMatchSource = "original" | "shell-body" | "effective";

export type ClassificationResult = {
  family: string;
  confidence: number;
  matchedReducer?: string;
  matchedVia?: CommandMatchSource;
  matchedCommand?: string;
};

export type StoredArtifactRef = {
  id: string;
  storage: "file";
  path: string;
  metadataPath: string;
};

export type StoredArtifactMetadata = {
  createdAt: string;
  source?: string;
  toolName?: string;
  command?: string;
  exitCode?: number;
  captureTruncated?: boolean;
  classification: ClassificationResult;
  rawChars: number;
  reducedChars?: number;
  ratio?: number;
};

export type ArtifactMetadataRef = {
  id: string;
  storage: "file";
  path?: string;
  metadataPath: string;
  metadata: StoredArtifactMetadata;
};

export type CompactResult = {
  inlineText: string;
  previewText?: string;
  facts?: Record<string, number>;
  compaction?: import("./core/compaction-metadata.js").CompactionMetadata;
  trace?: {
    normalizedCommand?: string;
    normalizedArgv?: string[];
    matchedReducer?: string;
    family: string;
  };
  rawRef?: StoredArtifactRef;
  stats: {
    rawChars: number;
    reducedChars: number;
    ratio: number;
  };
  classification: ClassificationResult;
};

export type StoredArtifactInput = {
  input: ToolExecutionInput;
  rawText: string;
  classification: ClassificationResult;
  stats?: {
    rawChars?: number;
    reducedChars: number;
    ratio: number;
  };
};

export type StoredArtifact = {
  id: string;
  rawText: string;
  metadata: StoredArtifactMetadata;
};

export type ReduceOptions = {
  classifier?: string;
  maxInlineChars?: number;
  trace?: boolean;
  raw?: boolean;
  recordStats?: boolean;
  store?: boolean;
  storeDir?: string;
  cwd?: string;
};

export type ReduceExecutionResult = CompactResult;

export type ReduceJsonRequest = {
  input: ToolExecutionInput;
  options?: ReduceOptions;
};

export type ReduceJsonCliOptions = {
  command?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  maxOutputBytes?: number;
};

export type RuleFixture = {
  id: string;
  ruleId: string;
  input: ToolExecutionInput;
  expect: {
    matchedReducer?: string;
    family?: string;
    inlineText?: string;
    previewText?: string;
    facts?: Record<string, number>;
    contains?: string[];
    excludes?: string[];
  };
};

export type WrapOptions = {
  cwd?: string;
  source?: string;
  recordStats?: boolean;
  store?: boolean;
  storeDir?: string;
  tee?: boolean;
  raw?: boolean;
  trace?: boolean;
  maxInlineChars?: number;
  maxCaptureBytes?: number;
};

export type WrapResult = {
  result: CompactResult;
  exitCode: number;
  stdout: string;
  stderr: string;
};
