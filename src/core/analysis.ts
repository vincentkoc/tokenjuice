import { basename } from "node:path";

import type { CompactResult, StoredArtifactMetadata, ToolExecutionInput } from "../types.js";

export type AnalysisEntry = {
  metadata: StoredArtifactMetadata;
};

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
    entries: number;
    genericArtifacts: number;
    weakArtifacts: number;
    avgRatio: number | null;
  };
  health: "good" | "warn" | "poor";
  alerts: string[];
  topMissingCommands: DiscoverCandidate[];
  topWeakReducers: DiscoverCandidate[];
  topReducers: Array<{
    reducer: string;
    count: number;
  }>;
};

export type StatsReport = {
  totals: {
    entries: number;
    rawChars: number;
    reducedChars: number;
    savedChars: number;
    avgRatio: number | null;
    savingsPercent: number | null;
  };
  reducers: Array<{
    reducer: string;
    count: number;
    rawChars: number;
    reducedChars: number;
    savedChars: number;
    avgRatio: number | null;
  }>;
  commands: Array<{
    signature: string;
    count: number;
    rawChars: number;
    reducedChars: number;
    savedChars: number;
    avgRatio: number | null;
  }>;
  daily: Array<{
    day: string;
    count: number;
    rawChars: number;
    reducedChars: number;
    savedChars: number;
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
const WEAK_RATIO_THRESHOLD = 0.65;
const MISSING_RAW_CHARS_THRESHOLD = 200;
const WEAK_RAW_CHARS_THRESHOLD = 500;

function clampRatio(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function effectiveReducedChars(metadata: StoredArtifactMetadata): number {
  const reduced = metadata.reducedChars ?? metadata.rawChars;
  return Math.min(Math.max(reduced, 0), metadata.rawChars);
}

function effectiveRatio(metadata: StoredArtifactMetadata): number | null {
  if (metadata.rawChars === 0) {
    return 1;
  }
  return clampRatio(effectiveReducedChars(metadata) / metadata.rawChars);
}

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

  const first = tokens[0];
  if (!first) {
    return null;
  }

  const normalized = basename(first.replace(/^["']|["']$/gu, ""));
  return normalized || null;
}

export function buildAnalysisEntry(input: ToolExecutionInput, result: CompactResult): AnalysisEntry {
  return {
    metadata: {
      createdAt: new Date().toISOString(),
      classification: result.classification,
      rawChars: result.stats.rawChars,
      reducedChars: result.stats.reducedChars,
      ratio: result.stats.ratio,
      ...(input.toolName ? { toolName: input.toolName } : {}),
      ...(input.command ? { command: input.command } : {}),
      ...(typeof input.exitCode === "number" ? { exitCode: input.exitCode } : {}),
    },
  };
}

function groupCandidates(entries: Array<AnalysisEntry & { kind: DiscoverCandidate["kind"] }>): DiscoverCandidate[] {
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
    const ratio = effectiveRatio(entry.metadata);
    if (ratio !== null) {
      existing.ratioSum += ratio;
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

export function discoverCandidates(entries: AnalysisEntry[]): DiscoverCandidate[] {
  const missing = entries
    .filter((entry) => GENERIC_REDUCERS.has(entry.metadata.classification.matchedReducer))
    .filter((entry) => entry.metadata.rawChars >= MISSING_RAW_CHARS_THRESHOLD)
    .map((entry) => ({
      ...entry,
      kind: "missing-rule" as const,
    }));

  const weak = entries
    .filter((entry) => !GENERIC_REDUCERS.has(entry.metadata.classification.matchedReducer))
    .filter((entry) => typeof entry.metadata.ratio === "number" && entry.metadata.ratio >= WEAK_RATIO_THRESHOLD)
    .filter((entry) => entry.metadata.rawChars >= WEAK_RAW_CHARS_THRESHOLD)
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

function buildDoctorAlerts(
  entries: AnalysisEntry[],
  avgRatio: number | null,
  genericCount: number,
  weakCount: number,
): { health: DoctorReport["health"]; alerts: string[] } {
  const alerts: string[] = [];

  if (entries.length === 0) {
    return {
      health: "warn",
      alerts: ["no entries available yet; run with --store or analyze a file/stdin log"],
    };
  }

  if (genericCount > 0) {
    alerts.push(`${genericCount} entry${genericCount === 1 ? "" : "ies"} fell back to generic/fallback`);
  }
  if (weakCount > 0) {
    alerts.push(`${weakCount} entry${weakCount === 1 ? "" : "ies"} matched a reducer but still compressed weakly`);
  }
  if (avgRatio !== null && avgRatio >= 0.85) {
    alerts.push(`average reduction ratio is weak at ${Math.round(avgRatio * 100)}%`);
  }

  if (alerts.length === 0) {
    return {
      health: "good",
      alerts: [],
    };
  }

  const health: DoctorReport["health"] = avgRatio !== null && avgRatio >= 0.85 ? "poor" : "warn";
  return { health, alerts };
}

type StatsGroup = {
  count: number;
  rawChars: number;
  reducedChars: number;
  ratioSum: number;
  ratioCount: number;
};

function addToStatsGroup(group: StatsGroup | undefined, entry: AnalysisEntry): StatsGroup {
  const ratio = effectiveRatio(entry.metadata);
  return {
    count: (group?.count ?? 0) + 1,
    rawChars: (group?.rawChars ?? 0) + entry.metadata.rawChars,
    reducedChars: (group?.reducedChars ?? 0) + effectiveReducedChars(entry.metadata),
    ratioSum: (group?.ratioSum ?? 0) + (ratio ?? 0),
    ratioCount: (group?.ratioCount ?? 0) + (ratio !== null ? 1 : 0),
  };
}

function avgRatioFromGroup(group: StatsGroup): number | null {
  return group.ratioCount > 0 ? group.ratioSum / group.ratioCount : null;
}

function isoDay(createdAt: string): string {
  return createdAt.slice(0, 10);
}

export function statsArtifacts(entries: AnalysisEntry[]): StatsReport {
  const reducers = new Map<string, StatsGroup>();
  const commands = new Map<string, StatsGroup>();
  const daily = new Map<string, StatsGroup>();

  let rawChars = 0;
  let reducedChars = 0;
  let ratioSum = 0;
  let ratioCount = 0;

  for (const entry of entries) {
    const reducer = entry.metadata.classification.matchedReducer ?? "generic/fallback";
    const signature = normalizeCommandSignature(entry.metadata.command) ?? "(unknown)";
    const day = isoDay(entry.metadata.createdAt);
    const reduced = effectiveReducedChars(entry.metadata);
    const ratio = effectiveRatio(entry.metadata);

    rawChars += entry.metadata.rawChars;
    reducedChars += reduced;
    if (ratio !== null) {
      ratioSum += ratio;
      ratioCount += 1;
    }

    reducers.set(reducer, addToStatsGroup(reducers.get(reducer), entry));
    commands.set(signature, addToStatsGroup(commands.get(signature), entry));
    daily.set(day, addToStatsGroup(daily.get(day), entry));
  }

  const totalSavedChars = Math.max(rawChars - reducedChars, 0);
  const avgRatio = ratioCount > 0 ? ratioSum / ratioCount : null;
  const savingsPercent = rawChars > 0 ? totalSavedChars / rawChars : null;

  return {
    totals: {
      entries: entries.length,
      rawChars,
      reducedChars,
      savedChars: totalSavedChars,
      avgRatio,
      savingsPercent,
    },
    reducers: [...reducers.entries()]
      .map(([reducer, group]) => ({
        reducer,
        count: group.count,
        rawChars: group.rawChars,
        reducedChars: group.reducedChars,
        savedChars: Math.max(group.rawChars - group.reducedChars, 0),
        avgRatio: avgRatioFromGroup(group),
      }))
      .sort((left, right) => right.savedChars - left.savedChars || right.count - left.count)
      .slice(0, 10),
    commands: [...commands.entries()]
      .map(([signature, group]) => ({
        signature,
        count: group.count,
        rawChars: group.rawChars,
        reducedChars: group.reducedChars,
        savedChars: Math.max(group.rawChars - group.reducedChars, 0),
        avgRatio: avgRatioFromGroup(group),
      }))
      .sort((left, right) => right.savedChars - left.savedChars || right.count - left.count)
      .slice(0, 10),
    daily: [...daily.entries()]
      .map(([day, group]) => ({
        day,
        count: group.count,
        rawChars: group.rawChars,
        reducedChars: group.reducedChars,
        savedChars: Math.max(group.rawChars - group.reducedChars, 0),
      }))
      .sort((left, right) => left.day.localeCompare(right.day)),
  };
}

export function doctorArtifacts(entries: AnalysisEntry[]): DoctorReport {
  const ratios = entries
    .map((entry) => effectiveRatio(entry.metadata))
    .filter((ratio): ratio is number => ratio !== null);
  const discover = discoverCandidates(entries);

  const reducerCounts = new Map<string, number>();
  for (const entry of entries) {
    const reducer = entry.metadata.classification.matchedReducer ?? "generic/fallback";
    reducerCounts.set(reducer, (reducerCounts.get(reducer) ?? 0) + 1);
  }

  const genericCount = entries.filter((entry) => GENERIC_REDUCERS.has(entry.metadata.classification.matchedReducer)).length;
  const weakCount = discover.filter((candidate) => candidate.kind === "weak-rule").reduce((sum, candidate) => sum + candidate.count, 0);
  const avgRatio = ratios.length > 0 ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : null;
  const alerts = buildDoctorAlerts(entries, avgRatio, genericCount, weakCount);

  return {
    totals: {
      entries: entries.length,
      genericArtifacts: genericCount,
      weakArtifacts: weakCount,
      avgRatio,
    },
    health: alerts.health,
    alerts: alerts.alerts,
    topMissingCommands: discover.filter((candidate) => candidate.kind === "missing-rule").slice(0, 10),
    topWeakReducers: discover.filter((candidate) => candidate.kind === "weak-rule").slice(0, 10),
    topReducers: [...reducerCounts.entries()]
      .map(([reducer, count]) => ({ reducer, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
  };
}
