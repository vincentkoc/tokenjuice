import type { ArtifactMetadataRef } from "../types.js";

export type DiscoverCandidate = {
  kind: "missing-rule" | "weak-rule";
  signature: string;
  count: number;
  totalRawChars: number;
  avgRatio: number | null;
  sampleCommand: string;
  matchedReducer?: string;
};

export type DoctorReport = {
  totals: {
    artifacts: number;
    genericArtifacts: number;
    weakArtifacts: number;
    avgRatio: number | null;
  };
  topMissingCommands: DiscoverCandidate[];
  topWeakReducers: DiscoverCandidate[];
  topReducers: Array<{
    reducer: string;
    count: number;
  }>;
};

type GroupState = {
  kind: DiscoverCandidate["kind"];
  signature: string;
  count: number;
  totalRawChars: number;
  ratioSum: number;
  ratioCount: number;
  sampleCommand: string;
  matchedReducer?: string;
};

const GENERIC_REDUCERS = new Set(["generic/fallback", undefined]);
const WRAPPER_COMMANDS = new Set(["pnpm", "npm", "yarn", "bun", "npx"]);
const SECONDARY_COMMANDS = new Set(["git", "cargo", "go", "python", "node"]);

function tokenize(command: string): string[] {
  return command.trim().split(/\s+/u).filter(Boolean);
}

export function normalizeCommandSignature(command?: string): string | null {
  if (!command || command === "stdin" || command.startsWith("reduce:")) {
    return null;
  }

  const tokens = tokenize(command);
  if (tokens.length === 0) {
    return null;
  }

  const [first, second, third] = tokens;
  if (first && WRAPPER_COMMANDS.has(first)) {
    if (second === "exec" || second === "dlx") {
      return third ? `${first} ${third}` : first;
    }
    if (second === "run") {
      return third ? `${first} run ${third}` : `${first} run`;
    }
    return second ? `${first} ${second}` : first;
  }

  if (first && SECONDARY_COMMANDS.has(first) && second) {
    return `${first} ${second}`;
  }

  return first ?? null;
}

function groupCandidates(entries: Array<ArtifactMetadataRef & { kind: DiscoverCandidate["kind"] }>): DiscoverCandidate[] {
  const groups = new Map<string, GroupState>();

  for (const entry of entries) {
    const signature = normalizeCommandSignature(entry.metadata.command);
    if (!signature) {
      continue;
    }

    const key = `${entry.kind}:${signature}:${entry.metadata.classification.matchedReducer ?? ""}`;
    const existing = groups.get(key) ?? {
      kind: entry.kind,
      signature,
      count: 0,
      totalRawChars: 0,
      ratioSum: 0,
      ratioCount: 0,
      sampleCommand: entry.metadata.command ?? signature,
      ...(entry.metadata.classification.matchedReducer
        ? { matchedReducer: entry.metadata.classification.matchedReducer }
        : {}),
    };
    existing.count += 1;
    existing.totalRawChars += entry.metadata.rawChars;
    if (typeof entry.metadata.ratio === "number") {
      existing.ratioSum += entry.metadata.ratio;
      existing.ratioCount += 1;
    }
    groups.set(key, existing);
  }

  return [...groups.values()]
    .map((group) => ({
      kind: group.kind,
      signature: group.signature,
      count: group.count,
      totalRawChars: group.totalRawChars,
      avgRatio: group.ratioCount > 0 ? group.ratioSum / group.ratioCount : null,
      sampleCommand: group.sampleCommand,
      ...(group.matchedReducer ? { matchedReducer: group.matchedReducer } : {}),
    }))
    .sort((left, right) => {
      const countDiff = right.count - left.count;
      if (countDiff !== 0) {
        return countDiff;
      }
      return right.totalRawChars - left.totalRawChars;
    });
}

export function discoverCandidates(metadata: ArtifactMetadataRef[]): DiscoverCandidate[] {
  const missing = metadata
    .filter((entry) => GENERIC_REDUCERS.has(entry.metadata.classification.matchedReducer))
    .filter((entry) => entry.metadata.rawChars >= 200)
    .map((entry) => ({
      ...entry,
      kind: "missing-rule" as const,
    }));

  const weak = metadata
    .filter((entry) => !GENERIC_REDUCERS.has(entry.metadata.classification.matchedReducer))
    .filter((entry) => typeof entry.metadata.ratio === "number" && entry.metadata.ratio >= 0.65)
    .filter((entry) => entry.metadata.rawChars >= 500)
    .map((entry) => ({
      ...entry,
      kind: "weak-rule" as const,
    }));

  return [
    ...groupCandidates(missing),
    ...groupCandidates(weak),
  ].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind.localeCompare(right.kind);
    }
    const countDiff = right.count - left.count;
    if (countDiff !== 0) {
      return countDiff;
    }
    return right.totalRawChars - left.totalRawChars;
  });
}

export function doctorArtifacts(metadata: ArtifactMetadataRef[]): DoctorReport {
  const ratios = metadata
    .map((entry) => entry.metadata.ratio)
    .filter((ratio): ratio is number => typeof ratio === "number");
  const discover = discoverCandidates(metadata);

  const reducerCounts = new Map<string, number>();
  for (const entry of metadata) {
    const reducer = entry.metadata.classification.matchedReducer ?? "generic/fallback";
    reducerCounts.set(reducer, (reducerCounts.get(reducer) ?? 0) + 1);
  }

  return {
    totals: {
      artifacts: metadata.length,
      genericArtifacts: metadata.filter((entry) => GENERIC_REDUCERS.has(entry.metadata.classification.matchedReducer)).length,
      weakArtifacts: discover.filter((candidate) => candidate.kind === "weak-rule").reduce((sum, candidate) => sum + candidate.count, 0),
      avgRatio: ratios.length > 0 ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : null,
    },
    topMissingCommands: discover.filter((candidate) => candidate.kind === "missing-rule").slice(0, 10),
    topWeakReducers: discover.filter((candidate) => candidate.kind === "weak-rule").slice(0, 10),
    topReducers: [...reducerCounts.entries()]
      .map(([reducer, count]) => ({ reducer, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
  };
}
