import { compactBashResult } from "./compact-bash-result.js";
import { buildCompactionNotice } from "../../hosts/shared/tool-result.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type OmpResultReplacement = {
  content: Array<Record<string, unknown> & { type: "text"; text: string }>;
};

/** OMP normalizes completed successes to isError=false and omits their exitCode. */
export async function compactOmpResult(event: unknown, cwd: unknown): Promise<OmpResultReplacement | undefined> {
  if (!isRecord(event) || event.toolName !== "bash" || event.isError !== false
    || !isRecord(event.input) || typeof event.input.command !== "string"
    || typeof cwd !== "string" || !cwd || !isRecord(event.details)) return;

  const details = event.details;
  // Preserve OMP's background, spill/minimizer, timeout and host-notice envelopes.
  // The native trace stays intact for replay; it is not an input to our reducer.
  if (details.wallTimeNoticeEmitted !== false || details.async !== undefined
    || details.timedOut === true || (details.exitCode !== undefined && details.exitCode !== 0)
    || details.meta !== undefined || details.requestedTimeoutSeconds !== undefined
    || details.replies !== undefined || details.spotlight !== undefined) return;

  if (!Array.isArray(event.content) || event.content.length !== 1) return;
  const block: unknown = event.content[0];
  if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") return;

  const result = await compactBashResult({
    source: "omp",
    command: event.input.command,
    cwd: typeof details.cwd === "string" && details.cwd ? details.cwd : cwd,
    visibleText: block.text,
    exitCode: 0,
    inspectionPolicy: "allow-safe-inventory",
    maxInlineChars: 1200,
    minSavedCharsAny: 8,
    genericFallbackMinSavedChars: 120,
    genericFallbackMaxRatio: 0.75,
    skipGenericFallbackForCompoundCommands: true,
    storeRaw: true,
    metadata: { source: "omp-tool-result" },
  });
  if (result.action !== "rewrite") return;
  const text = `${result.result.inlineText}\n\n[${buildCompactionNotice(result.result)}]`;
  if (text.length >= block.text.length) return;
  return { content: [{ ...block, type: "text", text }] };
}
