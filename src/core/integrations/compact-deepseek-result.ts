import { compactBashResult } from "./compact-bash-result.js";

type TextBlock = Record<string, unknown> & { type: "text"; text: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stream(value: unknown): value is Record<string, unknown> & { text: string; truncated: false } {
  return record(value) && typeof value.text === "string" && value.truncated === false
    && value.spillPath === undefined;
}

/** Replace only the native projection; PTC consumes canonical values directly. */
export async function compactDeepSeekResult(execution: unknown, result: unknown): Promise<TextBlock[] | undefined> {
  if (!record(execution) || execution.name !== "bash" || execution.parent !== undefined
    || !record(execution.arguments) || typeof execution.arguments.command !== "string"
    || !record(result) || result.isError !== false || !record(result.value)) return undefined;
  const signal = record(execution.signal) ? execution.signal : undefined;
  if (signal?.aborted === true) return undefined;
  const value = result.value;
  if (value.kind !== "foreground" || value.exitCode !== 0 || value.signal !== null
    || value.timedOut !== false || value.aborted !== false || value.stopped !== undefined
    || typeof value.cwd !== "string" || !stream(value.stdout) || !stream(value.stderr)
    || (value.sandbox !== undefined && (!record(value.sandbox) || value.sandbox.denied === true || value.sandbox.runnerFailed === true))) return undefined;
  const blocks = result.content;
  if (!Array.isArray(blocks) || blocks.length !== 1 || !record(blocks[0])
    || blocks[0].type !== "text" || typeof blocks[0].text !== "string") return undefined;
  const original = blocks[0];
  const stderr = value.stderr.text;
  function render(stdout: string): string {
    return stdout + (stderr ? `${stdout && !stdout.endsWith("\n") ? "\n" : ""}[stderr]\n${stderr}` : "");
  }
  // A prior projection may carry tool/policy notices; never reconstruct those.
  if (original.text !== render(value.stdout.text)) return undefined;
  const outcome = await compactBashResult({
    source: "deepseek-harness", command: execution.arguments.command,
    cwd: value.cwd, visibleText: value.stdout.text, exitCode: 0,
    inspectionPolicy: "allow-safe-inventory", skipCommandNames: ["tokenjuice"],
    genericFallbackMinSavedChars: 120, genericFallbackMaxRatio: 0.75,
    skipGenericFallbackForCompoundCommands: true,
  });
  if (signal?.aborted === true || outcome.action !== "rewrite") return undefined;
  return [{ ...original, type: "text", text: render(outcome.result.inlineText) }];
}
