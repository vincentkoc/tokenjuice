import { compactBashResult } from "./compact-bash-result.js";

export type FrameworkSource = "hermes" | "copilot-sdk" | "langchain" | "mastra" | "fastmcp";

/** A host-owned decoder must supply execution facts; tool success alone is insufficient. */
export type FrameworkShellResult = {
  command: string;
  output: string;
  exitCode: number;
  cwd?: string;
  background?: boolean;
  truncated?: boolean;
};

const SOURCES = new Set<unknown>(["hermes", "copilot-sdk", "langchain", "mastra", "fastmcp"]);

export async function compactFrameworkResult(source: FrameworkSource, input: unknown): Promise<string | undefined> {
  if (!SOURCES.has(source) || typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>;
  if (typeof value.command !== "string" || !value.command.trim() || typeof value.output !== "string"
    || value.exitCode !== 0 || value.background === true || value.truncated === true
    || (value.cwd !== undefined && typeof value.cwd !== "string")) return undefined;
  const outcome = await compactBashResult({
    source, command: value.command, visibleText: value.output, exitCode: 0,
    ...(typeof value.cwd === "string" ? { cwd: value.cwd } : {}),
    inspectionPolicy: "allow-safe-inventory",
    genericFallbackMinSavedChars: 120, genericFallbackMaxRatio: 0.75,
    skipGenericFallbackForCompoundCommands: true,
  });
  return outcome.action === "rewrite" ? outcome.result.inlineText : undefined;
}
