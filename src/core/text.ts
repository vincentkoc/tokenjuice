const ANSI_CSI_PATTERN = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, "g");
const ANSI_OSC_PATTERN = new RegExp(String.raw`\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)`, "g");
const ANSI_SINGLE_PATTERN = new RegExp(String.raw`\u001B[@-_]`, "g");
const TRUNCATION_SUFFIX = "\n... truncated ...";
const graphemeSegmenter = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

function graphemes(text: string): string[] {
  if (!graphemeSegmenter) {
    return Array.from(text);
  }

  return Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment);
}

export function stripAnsi(text: string): string {
  return text
    .replaceAll(ANSI_OSC_PATTERN, "")
    .replaceAll(ANSI_CSI_PATTERN, "")
    .replaceAll(ANSI_SINGLE_PATTERN, "");
}

export function countTextChars(text: string): number {
  return graphemes(text).length;
}

export function normalizeLines(text: string): string[] {
  return text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/u, ""));
}

export function trimEmptyEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === "") {
    start += 1;
  }
  while (end > start && lines[end - 1]?.trim() === "") {
    end -= 1;
  }
  return lines.slice(start, end);
}

export function dedupeAdjacent(lines: string[]): string[] {
  const next: string[] = [];
  for (const line of lines) {
    if (next[next.length - 1] !== line) {
      next.push(line);
    }
  }
  return next;
}

export function headTail(lines: string[], head: number, tail: number): string[] {
  if (lines.length <= head + tail) {
    return lines;
  }

  return [
    ...lines.slice(0, head),
    `... ${lines.length - head - tail} lines omitted ...`,
    ...lines.slice(-tail),
  ];
}

export function clampText(text: string, maxChars: number): string {
  if (countTextChars(text) <= maxChars) {
    return text;
  }
  const bodyChars = Math.max(0, maxChars - countTextChars(TRUNCATION_SUFFIX));
  return `${graphemes(text).slice(0, bodyChars).join("")}${TRUNCATION_SUFFIX}`;
}

export function pluralize(count: number, noun: string): string {
  if (count === 1) {
    return `${count} ${noun}`;
  }

  if (/[sxz]$/u.test(noun) || /(sh|ch)$/u.test(noun)) {
    return `${count} ${noun}es`;
  }

  if (/[^aeiou]y$/u.test(noun)) {
    return `${count} ${noun.slice(0, -1)}ies`;
  }

  return `${count} ${noun}s`;
}
