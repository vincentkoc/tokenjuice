import { compactBashResult } from "./compact-bash-result.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** V2 shell results have both structured output and model-facing content. */
export async function compactOpenCodeV2Result(event: unknown): Promise<Record<string, unknown> | undefined> {
  if (!record(event) || event.tool !== "shell" || event.status !== "completed"
    || !record(event.input) || typeof event.input.command !== "string" || event.input.background === true
    || !record(event.result) || !record(event.result.output)) return undefined;
  const result = event.result;
  const output = event.result.output;
  if (output.status !== "completed" || output.exit !== 0 || output.truncated !== false
    || output.signal !== undefined || output.timeout === true || output.shellID !== undefined
    || typeof output.output !== "string") return undefined;
  const metadata = result.metadata;
  if (record(metadata) && (metadata.truncated === true || metadata.timeout === true
    || metadata.signal !== undefined || metadata.shellID !== undefined
    || (metadata.exit !== undefined && metadata.exit !== 0)
    || (metadata.status !== undefined && metadata.status !== "completed"))) return undefined;
  const content = result.content;
  if (!Array.isArray(content) || content.length !== 1 || !record(content[0])
    || content[0].type !== "text" || content[0].text !== output.output) return undefined;
  const outcome = await compactBashResult({
    source: "opencode", command: event.input.command, visibleText: output.output, exitCode: 0,
    // The plugin instance directory is not the session's execution directory.
    inspectionPolicy: "skip-all", skipCommandNames: ["tokenjuice"],
    genericFallbackMinSavedChars: 120, genericFallbackMaxRatio: 0.75,
    skipGenericFallbackForCompoundCommands: true,
    metadata: { source: "opencode-v2-tool-result" },
  });
  if (outcome.action !== "rewrite") return undefined;
  const text = outcome.result.inlineText;
  return { ...result, output: { ...output, output: text }, content: [{ ...content[0], text }] };
}
