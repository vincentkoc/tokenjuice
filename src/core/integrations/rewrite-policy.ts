import type { CompactResult } from "../../types.js";

import { isCompoundShellCommand, stripLeadingCdPrefix } from "../command.js";

export type RewritePolicyOptions = {
  minSavedCharsAny?: number;
  genericFallbackMinSavedChars: number;
  genericFallbackMaxRatio: number;
  skipGenericFallbackForCompoundCommands: boolean;
};

export function getCompactionSkipReason(
  command: string,
  rawText: string,
  result: CompactResult,
  options: RewritePolicyOptions,
): "no-compaction" | "low-savings-compaction" | "generic-compound-command" | "generic-weak-compaction" | null {
  const inlineText = typeof result.inlineText === "string" ? result.inlineText.trim() : "";
  const normalizedRaw = rawText.trim();
  const rawChars = typeof result.stats?.rawChars === "number" ? result.stats.rawChars : normalizedRaw.length;
  const reducedChars = typeof result.stats?.reducedChars === "number" ? result.stats.reducedChars : inlineText.length;
  const savedChars = rawChars - reducedChars;

  if (!inlineText || inlineText === normalizedRaw || reducedChars >= rawChars) {
    return "no-compaction";
  }

  if (typeof options.minSavedCharsAny === "number" && savedChars < options.minSavedCharsAny) {
    return "low-savings-compaction";
  }

  if (result.classification?.matchedReducer !== "generic/fallback") {
    return null;
  }

  if (options.skipGenericFallbackForCompoundCommands && isCompoundShellCommand(stripLeadingCdPrefix(command))) {
    return "generic-compound-command";
  }

  const ratio = rawChars === 0 ? 1 : reducedChars / rawChars;
  if (savedChars < options.genericFallbackMinSavedChars || ratio > options.genericFallbackMaxRatio) {
    return "generic-weak-compaction";
  }

  return null;
}
