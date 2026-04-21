import type { PiContext } from "./pi-types.js";
import { isRecord } from "./pi-types.js";

export type TokenjuiceStatusSnapshot = {
  manualEnabled: boolean;
  autoCompactEnabled: boolean;
  effectiveEnabled: boolean;
  bypassNext: boolean;
  compactedCount: number;
  savedChars: number;
  rawChars: number;
  reducedChars: number;
  averageSavedChars: number;
  lastReducer?: string;
};

export function formatCompactNumber(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function getTokenjuiceEntries(sessionManager: PiContext["sessionManager"]) {
  return sessionManager.getBranch();
}

export function buildTokenjuiceStatusSnapshot(
  sessionManager: PiContext["sessionManager"],
  options: {
    manualEnabled: boolean;
    autoCompactEnabled: boolean;
    bypassNext: boolean;
  },
): TokenjuiceStatusSnapshot {
  let compactedCount = 0;
  let savedChars = 0;
  let rawChars = 0;
  let reducedChars = 0;
  let lastReducer: string | undefined;

  for (const entry of getTokenjuiceEntries(sessionManager)) {
    if (entry.type !== "message" || entry.message?.role !== "toolResult") {
      continue;
    }

    const details = isRecord(entry.message.details) ? entry.message.details : null;
    const tokenjuice = details && isRecord(details.tokenjuice) ? details.tokenjuice : null;
    if (!tokenjuice || tokenjuice.compacted !== true) {
      continue;
    }

    compactedCount += 1;
    savedChars += typeof tokenjuice.savedChars === "number" ? tokenjuice.savedChars : 0;
    rawChars += typeof tokenjuice.rawChars === "number" ? tokenjuice.rawChars : 0;
    reducedChars += typeof tokenjuice.reducedChars === "number" ? tokenjuice.reducedChars : 0;
    if (typeof tokenjuice.reducer === "string" && tokenjuice.reducer) {
      lastReducer = tokenjuice.reducer;
    }
  }

  return {
    manualEnabled: options.manualEnabled,
    autoCompactEnabled: options.autoCompactEnabled,
    effectiveEnabled: options.manualEnabled && options.autoCompactEnabled,
    bypassNext: options.bypassNext,
    compactedCount,
    savedChars,
    rawChars,
    reducedChars,
    averageSavedChars: compactedCount > 0 ? Math.round(savedChars / compactedCount) : 0,
    ...(lastReducer ? { lastReducer } : {}),
  };
}

export function buildTokenjuiceStatusMessage(
  enabled: boolean,
  autoCompactEnabled: boolean,
  bypassNext: boolean,
): string {
  const manualState = enabled ? "on" : "off";
  const autoState = autoCompactEnabled ? "on" : "off";
  const effectiveState = enabled && autoCompactEnabled ? "on" : "off";
  const bypassState = bypassNext ? "armed" : "idle";
  return `tokenjuice manual ${manualState}; pi auto-compaction ${autoState}; effective ${effectiveState}; bypass-next ${bypassState}`;
}
