import { dirname, resolve } from "node:path";

import { resolveArtifactBaseDir } from "./artifacts.js";
import { buildCompactionFooter } from "./compaction-metadata.js";

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
  const savedChars = rawChars - reducedChars;
  if (!result.captureTruncated && (savedChars < 512 || savedChars / rawChars < 0.2)) {
    return result.inlineText;
  }
  const recovery = recoveryCommand(result);
  const footer = [
    "",
    "---",
    result.captureTruncated
      ? "[tokenjuice] Capture limit reached. This summary and any stored output are incomplete."
      : buildCompactionFooter(rawChars, reducedChars),
    ...(recovery ? [`Captured output is available locally${process.platform === "win32" ? " (PowerShell)" : ""}: ${recovery}`] : result.captureTruncated ? [] : ["Full output: re-run with tokenjuice wrap --raw -- <command>"]),
  ].join("\n");
  return `${result.inlineText}${footer}`;
}
