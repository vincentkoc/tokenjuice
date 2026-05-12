import { createHash } from "node:crypto";

import { createCompactionMetadata, type CompactionMetadata } from "./compaction-metadata.js";
import { countTextChars, sliceTextChars } from "./text.js";

export const compactWhitespace = (text: string): string => text.replace(/\s+/gu, " ").trim();

const shortHash = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 12);

export function clipMiddleWithHash(text: string, maxChars: number): { text: string; compaction?: CompactionMetadata } {
  if (countTextChars(text) <= maxChars) {
    return { text };
  }
  const omitted = countTextChars(text) - maxChars;
  const headChars = Math.max(20, Math.floor(maxChars * 0.55));
  const tailChars = Math.max(20, maxChars - headChars);
  return {
    text: `${sliceTextChars(text, 0, headChars)} ...[${omitted} chars omitted, sha256:${shortHash(text)}]... ${sliceTextChars(text, -tailChars)}`,
    compaction: createCompactionMetadata("hashed-middle-clip"),
  };
}

function clipMiddleWithHashStrict(text: string, maxChars: number): { text: string; compaction?: CompactionMetadata } {
  if (countTextChars(text) <= maxChars) {
    return { text };
  }

  const omitted = countTextChars(text) - maxChars;
  const marker = `...[${omitted} chars omitted, sha256:${shortHash(text)}]...`;
  const markerChars = countTextChars(marker);
  if (maxChars <= markerChars) {
    return {
      text: sliceTextChars(marker, 0, maxChars),
      compaction: createCompactionMetadata("hashed-middle-clip"),
    };
  }

  const bodyChars = maxChars - markerChars;
  const headChars = Math.ceil(bodyChars * 0.7);
  const tailChars = Math.max(0, bodyChars - headChars);
  return {
    text: `${sliceTextChars(text, 0, headChars)}${marker}${tailChars > 0 ? sliceTextChars(text, -tailChars) : ""}`,
    compaction: createCompactionMetadata("hashed-middle-clip"),
  };
}

function minifyJsonLexically(rawText: string): string {
  const text = rawText.trim();
  let output = "";
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      output += char;
      continue;
    }

    if (/\s/u.test(char)) {
      continue;
    }

    output += char;
  }

  return output;
}

export function compactWholeJsonText(rawText: string, maxChars: number): { text: string; compaction?: CompactionMetadata } | null {
  return parseJsonValue(rawText) === null
    ? null
    : clipMiddleWithHashStrict(minifyJsonLexically(rawText), maxChars);
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
