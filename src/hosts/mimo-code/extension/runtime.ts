import { compactBashResult } from "../../../core/integrations/compact-bash-result.js";
import { buildCompactionNotice, buildTokenjuiceDetails } from "../../shared/tool-result.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// MiMo file hooks export the hook object itself, unlike OpenCode's initializer.
export function createTokenjuiceMimoCodeHook() {
  return {
    "tool.execute.after": async (input: unknown, output: unknown): Promise<void> => {
      if (!isRecord(input) || input.tool !== "bash" || !isRecord(input.args)
        || typeof input.args.command !== "string" || !isRecord(output)
        || typeof output.output !== "string" || !isRecord(output.metadata)) return;

      const metadata = output.metadata;
      // Missing status and partial output cannot establish a complete success.
      if (metadata.exit !== 0 || metadata.truncated !== false) return;

      try {
        const result = await compactBashResult({
          source: "mimo-code",
          metadata: { source: "mimo-code" },
          command: input.args.command,
          visibleText: output.output,
          exitCode: 0,
          maxInlineChars: 1200,
          // MiMo maintains session cwd independently of tool arguments.
          inspectionPolicy: "skip-all",
          minSavedCharsAny: 8,
          genericFallbackMinSavedChars: 120,
          genericFallbackMaxRatio: 0.75,
          skipGenericFallbackForCompoundCommands: true,
        });
        if (result.action === "keep") return;
        const text = `${result.result.inlineText}\n\n[${buildCompactionNotice(result.result)}]`;
        if (text.length >= output.output.length) return;
        const nextMetadata = { ...metadata, output: text, tokenjuice: buildTokenjuiceDetails(result.result) };
        output.output = text;
        output.metadata = nextMetadata;
      } catch {
        // A failed compactor leaves the host's completed tool result intact.
      }
    },
  };
}
