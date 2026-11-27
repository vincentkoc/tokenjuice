import { compactBashResult } from "../../core/integrations/compact-bash-result.js";
import { isRecord } from "../shared/pre-tool-wrap.js";

type CompactionOptions = { recordStats?: boolean; storeRaw?: boolean; storeDir?: string };
type ToolResultPatch = { content: Record<string, unknown>[]; details: Record<string, unknown> };

/** Decode Hana's completed one-shot exec_command result, never a PTY or partial update. */
export async function compactOpenHanakoResult(event: unknown, options: CompactionOptions = {}): Promise<ToolResultPatch | undefined> {
  try {
    if (!isRecord(event) || event.toolName !== "exec_command" || event.isError === true
      || !isRecord(event.input) || !isRecord(event.details)) return undefined;
    const details = event.details;
    const execution = details.execCommand;
    if (!isRecord(execution) || execution.ok !== true || execution.exitCode !== 0
      || execution.transportError !== false || execution.tty !== false
      || details.errorCode || execution.errorCode || details.fullOutputPath
      || (isRecord(details.truncation) && details.truncation.truncated === true)
      || typeof execution.cmd !== "string" || !execution.cmd.trim()
      || typeof execution.workdir !== "string"
      || event.input.tty === true || event.input.cmd !== execution.cmd) return undefined;
    // Mixed content can carry additional structured or attachment projections.
    if (!Array.isArray(event.content) || event.content.length !== 1) return undefined;
    const block = event.content[0];
    if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") return undefined;
    const result = await compactBashResult({
      source: "openhanako",
      command: execution.cmd,
      cwd: execution.workdir,
      visibleText: block.text,
      exitCode: 0,
      inspectionPolicy: "allow-safe-inventory",
      genericFallbackMinSavedChars: 120,
      genericFallbackMaxRatio: 0.75,
      skipGenericFallbackForCompoundCommands: true,
      ...options,
    });
    return result.action === "rewrite"
      ? { content: [{ ...block, text: result.result.inlineText }], details }
      : undefined;
  } catch {
    return undefined;
  }
}

export default function openHanakoExtension(pi: {
  on(event: "tool_result", handler: (event: unknown) => Promise<ToolResultPatch | undefined>): void;
}): void {
  pi.on("tool_result", event => compactOpenHanakoResult(event));
}
