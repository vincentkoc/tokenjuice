import { compactBashResult } from "./compact-bash-result.js";

/** DevEco's V1 shell result contract. Only complete, successful output is eligible. */
export async function compactDevEcoResult(input: {
  tool: string;
  args: unknown;
  output: unknown;
  metadata: unknown;
}) {
  if (input.tool !== "bash" || !isRecord(input.args) || !isRecord(input.metadata)
    || input.metadata.exit !== 0 || input.metadata.truncated !== false
    || typeof input.args.command !== "string" || !input.args.command.trim()
    || typeof input.output !== "string" || !input.output.trim()) return undefined;

  return compactBashResult({
    source: "deveco",
    command: input.args.command,
    ...(typeof input.args.workdir === "string" && input.args.workdir.trim()
      ? { cwd: input.args.workdir } : {}),
    visibleText: input.output,
    exitCode: 0,
    maxInlineChars: 1200,
    inspectionPolicy: "allow-safe-inventory",
    minSavedCharsAny: 8,
    genericFallbackMinSavedChars: 120,
    genericFallbackMaxRatio: 0.75,
    skipGenericFallbackForCompoundCommands: true,
    metadata: { source: "deveco-tool-result" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
