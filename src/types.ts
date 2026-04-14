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

export type RuleMatch = {
  toolNames?: string[];
  argv0?: string[];
  argvIncludes?: string[][];
  commandIncludes?: string[];
};

export type RuleFilters = {
  skipPatterns?: string[];
  keepPatterns?: string[];
};

export type RuleTransforms = {
  stripAnsi?: boolean;
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
  match: RuleMatch;
  filters?: RuleFilters;
  transforms?: RuleTransforms;
  summarize?: RuleSummarize;
  counters?: RuleCounter[];
  failure?: RuleFailure;
};

export type ClassificationResult = {
  family: string;
  confidence: number;
  matchedReducer?: string;
};

export type StoredArtifactRef = {
  id: string;
  storage: "file";
  path: string;
  metadataPath: string;
};

export type CompactResult = {
  inlineText: string;
  previewText?: string;
  facts?: Record<string, number>;
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
};

export type StoredArtifact = {
  id: string;
  rawText: string;
  metadata: {
    createdAt: string;
    command?: string;
    exitCode?: number;
    classification: ClassificationResult;
    rawChars: number;
  };
};

export type ReduceOptions = {
  classifier?: string;
  maxInlineChars?: number;
  store?: boolean;
  storeDir?: string;
};

export type ReduceExecutionResult = CompactResult;

export type WrapOptions = {
  cwd?: string;
  store?: boolean;
  storeDir?: string;
  tee?: boolean;
  maxInlineChars?: number;
};

export type WrapResult = {
  result: CompactResult;
  exitCode: number;
  stdout: string;
  stderr: string;
};
