import { compactFrameworkResult, type FrameworkShellResult } from "../../core/integrations/compact-framework-result.js";

export type MastraToolResult = {
  toolName: string;
  toolCallId: string;
  args: unknown;
  result: unknown;
  messageList: { updateToolInvocation(value: {
    type: "tool-invocation";
    toolInvocation: { state: "result"; toolCallId: string; toolName: string; args: unknown; result: unknown };
  }): unknown };
};

export type MastraCompactorOptions = {
  decode: (input: MastraToolResult) => FrameworkShellResult | undefined;
  replace: (original: unknown, text: string) => unknown;
};

/** Register in outputProcessors. Explicit mappings preserve each application's tool schema. */
export function createMastraProcessor(options: MastraCompactorOptions) {
  return {
    id: "tokenjuice",
    async processToolResult(input: MastraToolResult): Promise<void> {
      let replacement: unknown;
      try {
        const execution = options.decode(input);
        if (!execution) return;
        const text = await compactFrameworkResult("mastra", execution);
        if (text === undefined) return;
        replacement = options.replace(input.result, text);
      } catch {
        return;
      }
      // The host owns message-list failures; don't swallow a failed state update.
      input.messageList.updateToolInvocation({ type: "tool-invocation", toolInvocation: {
        state: "result", toolCallId: input.toolCallId, toolName: input.toolName, args: input.args, result: replacement,
      } });
    },
  };
}
