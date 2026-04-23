import { createHash } from "node:crypto";

import { countTextChars, sliceTextChars } from "./text.js";

export function compactWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

export function clipMiddleWithHash(text: string, maxChars: number): string {
  if (countTextChars(text) <= maxChars) {
    return text;
  }
  const omitted = countTextChars(text) - maxChars;
  const headChars = Math.max(20, Math.floor(maxChars * 0.55));
  const tailChars = Math.max(20, maxChars - headChars);
  return `${sliceTextChars(text, 0, headChars)} ...[${omitted} chars omitted, sha256:${shortHash(text)}]... ${sliceTextChars(text, -tailChars)}`;
}

export function parseJsonObjectLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function parseJsonValue(text: string): unknown | null {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}
