import { compactQoderResult } from "../../core/integrations/compact-qoder-result.js";
import { commandAlreadyWrapped } from "../shared/pre-tool-wrap.js";
import { isRecord } from "../shared/hooks-json-file.js";
import { writeHookJsonLine } from "../shared/hook-output.js";

export async function runQoderPostToolUseHook(rawText: string): Promise<number> {
  let output: Record<string, unknown> = {};
  try {
    const payload: unknown = JSON.parse(rawText);
    const command = isRecord(payload) && isRecord(payload.tool_input) ? payload.tool_input.command : undefined;
    if (typeof command === "string" && !commandAlreadyWrapped(command)) {
      const updatedToolOutput = await compactQoderResult(payload);
      if (updatedToolOutput !== undefined) {
        output = { hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput } };
      }
    }
  } catch {
    // A failed optional compactor leaves Qoder's original response intact.
  }
  writeHookJsonLine(output);
  return 0;
}
