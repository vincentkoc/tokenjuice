import { compactDevEcoResult } from "../../../core/integrations/compact-deveco-result.js";
import { buildCompactionNotice, buildTokenjuiceDetails } from "../../shared/tool-result.js";

// Only one export: DevEco treats every function export as a plugin initializer.
export default async function tokenjuiceDevEcoPlugin() {
  return {
    "tool.execute.after": async (
      input: { tool: string; args?: unknown },
      output: { output: string; metadata?: unknown },
    ): Promise<void> => {
      try {
        const result = await compactDevEcoResult({ tool: input.tool, args: input.args, output: output.output, metadata: output.metadata });
        if (!result || result.action === "keep") return;
        const metadata = output.metadata as Record<string, unknown>;
        const text = `${result.result.inlineText}\n\n[${buildCompactionNotice(result.result)}]`;
        const details = buildTokenjuiceDetails(result.result);
        // Keep native exit/truncation fields and unrelated metadata intact.
        output.metadata = { ...metadata, tokenjuice: details };
        output.output = text;
      } catch {
        // Optional compaction must not fail an already completed shell call.
      }
    },
  };
}
