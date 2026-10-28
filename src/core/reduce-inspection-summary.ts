import { createCompactionMetadata, type CompactionMetadata } from "./compaction-metadata.js";
import { parseJsonValue } from "./reduce-utils.js";

import type { ToolExecutionInput } from "../types.js";

const PACKAGE_LOCK_RE = /\bpackage-lock\.json\b/u;

type InspectionSummaryReducerId = "generic/package-lock-summary";

export type InspectionSummary = {
  lines: string[];
  matchedReducer: InspectionSummaryReducerId;
  compaction: CompactionMetadata;
};

function buildPackageLockSummary(value: unknown, noOmit = false): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }
  const record = value as Record<string, unknown>;
  const packages = typeof record.packages === "object" && record.packages !== null && !Array.isArray(record.packages)
    ? Object.keys(record.packages as Record<string, unknown>)
    : [];
  const dependencies = typeof record.dependencies === "object" && record.dependencies !== null && !Array.isArray(record.dependencies)
    ? Object.keys(record.dependencies as Record<string, unknown>)
    : [];

  const lines = [
    "package-lock summary",
    typeof record.name === "string" ? `name: ${record.name}` : null,
    typeof record.version === "string" ? `version: ${record.version}` : null,
    typeof record.lockfileVersion === "number" ? `lockfileVersion: ${record.lockfileVersion}` : null,
    `packages: ${packages.length}`,
    `dependencies: ${dependencies.length}`,
  ].filter((line): line is string => line !== null);

  const packageSamples = noOmit ? packages.filter(Boolean) : packages.filter(Boolean).slice(0, 12);
  if (packageSamples.length > 0) {
    lines.push(`sample packages: ${packageSamples.join(", ")}`);
  }
  return lines;
}

export function buildInspectionSummary(input: ToolExecutionInput, rawText: string, noOmit = false): InspectionSummary | null {
  const command = input.command ?? "";
  if (!PACKAGE_LOCK_RE.test(command)) {
    return null;
  }

  const lines = buildPackageLockSummary(parseJsonValue(rawText), noOmit);
  return lines.length > 0
    ? { lines, matchedReducer: "generic/package-lock-summary", compaction: createCompactionMetadata("inspection-package-lock-summary") }
    : null;
}
