import { dirname, resolve } from "node:path";

import { resolveArtifactBaseDir } from "./artifacts.js";
import { WRAP_AUTHORITATIVE_FOOTER } from "./compaction-metadata.js";

import type { CompactResult } from "../types.js";

export function quoteRecoveryDirectory(directory: string, platform = process.platform): string {
  return platform === "win32"
    ? `'${directory.replaceAll("'", "''")}'`
    : `'${directory.replaceAll("'", "'\\''")}'`;
}

function recoveryCommand(result: CompactResult): string | undefined {
  if (!result.rawRef) return undefined;
  const directory = resolve(dirname(result.rawRef.path));
  const defaultDirectory = resolve(resolveArtifactBaseDir());
  const quotedDirectory = quoteRecoveryDirectory(directory);
  return `tokenjuice cat ${result.rawRef.id}${directory === defaultDirectory ? "" : ` --store-dir ${quotedDirectory}`}`;
}

export function decorateWrapInlineText(result: CompactResult, raw: boolean): string {
  const { rawChars, reducedChars } = result.stats;
  if (raw || !result.compaction?.authoritative || reducedChars === 0 || reducedChars >= rawChars) {
    return result.inlineText;
  }
  const recovery = recoveryCommand(result);
  const footer = [
    "",
    "---",
    result.captureTruncated
      ? "[tokenjuice] Capture limit reached. This summary and any stored output are incomplete."
      : WRAP_AUTHORITATIVE_FOOTER,
    ...(recovery ? [`Captured output is available locally${process.platform === "win32" ? " (PowerShell)" : ""}: ${recovery}`] : []),
  ].join("\n");
  return `${result.inlineText}${footer}`;
}
