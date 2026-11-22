import { compactCopilotResult } from "../../core/integrations/compact-copilot-result.js";

type Replacement = { modifiedResult: {
  textResultForLlm: string; resultType: "success"; [key: string]: unknown;
} };

/** Compose this callback with the application's existing hooks; it never grants permission. */
export function createCopilotSdkHooks() {
  return {
    async onPostToolUse(input: unknown): Promise<Replacement | undefined> {
      try {
        const replacement = await compactCopilotResult(input, { source: "copilot-sdk" });
        return replacement as Replacement | undefined;
      } catch {
        return undefined;
      }
    },
  };
}
