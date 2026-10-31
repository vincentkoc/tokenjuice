import { compactBashResult } from "./compact-bash-result.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Copilot's successful tool invocation can still contain a failed shell command. */
export async function compactCopilotResult(
  payload: unknown,
  options: { source?: "copilot-cli" | "copilot-agent"; maxInlineChars?: number; storeRaw?: boolean } = {},
): Promise<Record<string, unknown> | undefined> {
  if (!record(payload) || (payload.toolName ?? payload.tool_name) !== "bash"
    || (payload.hook_event_name !== undefined && payload.hook_event_name !== "PostToolUse")) return undefined;
  let input = payload.toolArgs ?? payload.tool_input;
  if (typeof input === "string") {
    try { input = JSON.parse(input) as unknown; } catch { return undefined; }
  }
  const result = payload.toolResult ?? payload.tool_result;
  if (!record(input) || typeof input.command !== "string" || !input.command.trim()
    || !record(result) || (result.resultType ?? result.result_type) !== "success") return undefined;
  const text = result.textResultForLlm ?? result.text_result_for_llm;
  if (typeof text !== "string") return undefined;

  // The host appends this status after command output. Unknown/running formats stay raw.
  const footer = /\n<(?:shellId: \d+ completed with exit code|exited with exit code) (-?\d+)>$/u.exec(text);
  if (!footer || footer[1] !== "0") return undefined;
  const { source = "copilot-cli", ...compactionOptions } = options;
  const outcome = await compactBashResult({
    source, command: input.command, visibleText: text.slice(0, footer.index), exitCode: 0,
    ...(typeof payload.cwd === "string" && payload.cwd.trim() ? { cwd: payload.cwd } : {}),
    ...compactionOptions,
    inspectionPolicy: "allow-safe-inventory",
    metadata: { source: `${source}-post-tool-use` },
    genericFallbackMinSavedChars: 120, genericFallbackMaxRatio: 0.75,
    skipGenericFallbackForCompoundCommands: true,
  });
  if (outcome.action !== "rewrite") return undefined;
  const compacted = outcome.result.inlineText + footer[0];
  return { modifiedResult: {
    ...result,
    resultType: "success",
    textResultForLlm: compacted,
    ...(result.text_result_for_llm !== undefined ? { text_result_for_llm: compacted } : {}),
  } };
}
