import { WRAP_AUTHORITATIVE_FOOTER } from "./compaction-metadata.js";

import type { CompactResult } from "../types.js";

export function decorateWrapInlineText(result: CompactResult, raw: boolean): string {
  const { rawChars, reducedChars } = result.stats;
  if (raw || !result.compaction?.authoritative || reducedChars === 0 || reducedChars >= rawChars) {
    return result.inlineText;
  }
  const footer = [
    "",
    "---",
    WRAP_AUTHORITATIVE_FOOTER,
    ...(result.rawRef?.id ? [`Raw output is available locally: tokenjuice cat ${result.rawRef.id}`] : []),
  ].join("\n");
  return `${result.inlineText}${footer}`;
}
