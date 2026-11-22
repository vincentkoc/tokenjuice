import { compactBashResult } from "./compact-bash-result.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Qoder replaces the complete tool response with a string, not a partial object. */
export async function compactQoderResult(payload: unknown): Promise<string | undefined> {
  if (!isRecord(payload) || payload.hook_event_name !== "PostToolUse" || payload.tool_name !== "Bash"
    || !isRecord(payload.tool_input) || typeof payload.tool_input.command !== "string"
    || !isRecord(payload.tool_response)) {
    return undefined;
  }
  const response = payload.tool_response;
  if (typeof response.stdout !== "string" || typeof response.stderr !== "string"
    || response.exitCode !== 0 || response.interrupted === true
    || response.kind !== undefined || response.taskId !== undefined || response.outputFile !== undefined) {
    return undefined;
  }
  const outcome = await compactBashResult({
    source: "qoder",
    command: payload.tool_input.command,
    visibleText: response.stdout,
    exitCode: response.exitCode,
    ...(typeof payload.cwd === "string" ? { cwd: payload.cwd } : {}),
    inspectionPolicy: "allow-safe-inventory",
    skipCommandNames: ["tokenjuice"],
    minSavedCharsAny: 8,
    genericFallbackMinSavedChars: 120,
    genericFallbackMaxRatio: 0.75,
    skipGenericFallbackForCompoundCommands: true,
  });
  return outcome.action === "rewrite"
    ? JSON.stringify({ ...response, stdout: outcome.result.inlineText })
    : undefined;
}
