import type { ToolExecutionInput } from "../types.js";

export const UNKNOWN_ARTIFACT_SOURCE = "unknown";
export const DEFAULT_CLI_ARTIFACT_SOURCE = "cli";

export function normalizeArtifactSource(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const source = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/gu, "-")
    .replace(/[^a-z0-9.-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  if (!source) {
    return null;
  }

  if (source.startsWith("claude-code") || source === "claude") {
    return "claude-code";
  }
  if (source.startsWith("codex")) {
    return "codex";
  }
  if (source.startsWith("cursor")) {
    return "cursor";
  }
  if (source.startsWith("gemini")) {
    return "gemini-cli";
  }
  if (source.startsWith("openclaw")) {
    return "openclaw";
  }
  if (source.startsWith("opencode") || source.startsWith("open-code")) {
    return "opencode";
  }
  if (source.startsWith("pi")) {
    return "pi";
  }
  if (source === "direct" || source === "tokenjuice" || source === "wrap") {
    return DEFAULT_CLI_ARTIFACT_SOURCE;
  }

  return source;
}

export function resolveArtifactSource(input: ToolExecutionInput): string {
  return normalizeArtifactSource(input.metadata?.source) ?? DEFAULT_CLI_ARTIFACT_SOURCE;
}

export function readStoredArtifactSource(source: string | undefined): string {
  return normalizeArtifactSource(source) ?? UNKNOWN_ARTIFACT_SOURCE;
}
