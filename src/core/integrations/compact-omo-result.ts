import { compactBashResult } from "./compact-bash-result.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Preserve native projections; OmO also emits completed text-only Bash results. */
export async function compactOmoResult(event: unknown, cwd?: string) {
  if (!isRecord(event) || event.toolName !== "bash" || event.parentToolCallId !== undefined
    || event.isError !== false || !isRecord(event.input) || typeof event.input.command !== "string"
    || !Array.isArray(event.content) || event.content.length !== 1
    || !isRecord(event.content[0]) || event.content[0].type !== "text"
    || typeof event.content[0].text !== "string") return undefined;
  const structured = event.structuredContent;
  const text = event.content[0].text;
  if (isRecord(event.details) && (event.details.truncation !== undefined || event.details.fullOutputPath !== undefined
    || event.details.truncated === true || event.details.isTruncated === true
    || (event.details.exitCode !== undefined && event.details.exitCode !== 0))) return undefined;
  if (structured === undefined) {
    // Observed in omo-ai 5.1.70: completed Bash uses text + status; failures set isError.
    if (!isRecord(event.details) || event.details.status !== "completed") return undefined;
  } else if (!isRecord(structured) || structured.exit_code !== 0 || structured.truncated !== false
    || structured.output !== text || structured.full_output_path !== undefined) return undefined;

  const compacted = await compactBashResult({
    source: "omo", command: event.input.command, ...(cwd === undefined ? {} : { cwd }), visibleText: text, exitCode: 0,
    inspectionPolicy: "allow-safe-inventory", maxInlineChars: 1200, skipCommandNames: ["tokenjuice"],
    genericFallbackMinSavedChars: 120, genericFallbackMaxRatio: 0.75, skipGenericFallbackForCompoundCommands: true,
  });
  if (compacted.action !== "rewrite") return undefined;
  return {
    content: [{ ...event.content[0], text: compacted.result.inlineText }],
    ...(isRecord(structured) ? { structuredContent: { ...structured, output: compacted.result.inlineText } } : {}),
  };
}
