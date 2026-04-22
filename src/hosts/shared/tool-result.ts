import type { CompactResult } from "../../types.js";

export type TokenjuiceDetails = {
  compacted: true;
  rawChars: number;
  reducedChars: number;
  savedChars: number;
  reducer?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n");
}

export function buildBypassNotice(fullOutputPath?: string): string {
  return fullOutputPath
    ? `tokenjuice bypassed compaction for this command. full output: ${fullOutputPath}`
    : "tokenjuice bypassed compaction for this command.";
}

export function buildCompactionNotice(result: CompactResult, fullOutputPath?: string): string {
  const hints: string[] = [];
  if (result.rawRef?.id) {
    hints.push(`raw artifact: ${result.rawRef.id}`);
  }
  if (fullOutputPath) {
    hints.push(`full output: ${fullOutputPath}`);
  }
  const suffix = hints.length > 0 ? ` (${hints.join(", ")})` : "";
  return `tokenjuice compacted bash output${suffix}`;
}

export function buildTokenjuiceDetails(result: CompactResult): TokenjuiceDetails {
  const rawChars = typeof result.stats?.rawChars === "number" ? result.stats.rawChars : 0;
  const reducedChars = typeof result.stats?.reducedChars === "number" ? result.stats.reducedChars : 0;
  return {
    compacted: true,
    rawChars,
    reducedChars,
    savedChars: Math.max(0, rawChars - reducedChars),
    ...(typeof result.classification?.matchedReducer === "string"
      ? { reducer: result.classification.matchedReducer }
      : {}),
  };
}

export function mergeDetails(existingDetails: unknown, tokenjuiceDetails: TokenjuiceDetails) {
  if (isRecord(existingDetails)) {
    return {
      ...existingDetails,
      tokenjuice: tokenjuiceDetails,
    };
  }

  return {
    tokenjuice: tokenjuiceDetails,
  };
}
