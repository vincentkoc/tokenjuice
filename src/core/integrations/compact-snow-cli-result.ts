import { isAbsolute } from "node:path";
import { compactBashResult } from "./compact-bash-result.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Snow replaces the complete model-visible content string, not the tool envelope. */
export async function compactSnowCliResult(payload: unknown): Promise<string | undefined> {
  if (!record(payload) || payload.toolName !== "terminal-execute" || payload.error != null
    || !record(payload.args) || !record(payload.result) || payload.result.messageStatus === "error"
    || payload.result.hookFailed === true || typeof payload.result.content !== "string") return undefined;
  const args = payload.args;
  if (typeof args.command !== "string" || !args.command.trim()
    || typeof args.workingDirectory !== "string" || !isAbsolute(args.workingDirectory)
    || args.enableAiSummary === true || args.isInteractive === true) return undefined;
  let response: unknown;
  try { response = JSON.parse(payload.result.content) as unknown; } catch { return undefined; }
  if (!record(response) || response.exitCode !== 0 || response.command !== args.command
    || typeof response.stdout !== "string" || typeof response.stderr !== "string"
    || response.background === true || response.interrupted === true || response.taskId !== undefined
    || response.stdout.includes("[Command moved to background, execution continues...]")) return undefined;
  const outcome = await compactBashResult({
    source: "snow-cli", command: args.command, cwd: args.workingDirectory,
    visibleText: response.stdout, exitCode: 0, inspectionPolicy: "allow-safe-inventory",
    skipCommandNames: ["tokenjuice"], minSavedCharsAny: 8,
    genericFallbackMinSavedChars: 120, genericFallbackMaxRatio: 0.75,
    skipGenericFallbackForCompoundCommands: true,
  });
  if (outcome.action !== "rewrite") return undefined;
  const replacement = JSON.stringify({ ...response, stdout: outcome.result.inlineText });
  return replacement.length < payload.result.content.length ? replacement : undefined;
}
