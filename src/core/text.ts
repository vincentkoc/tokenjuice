const ANSI_CSI_PATTERN = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, "g");
const ANSI_OSC_PATTERN = new RegExp(String.raw`\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)`, "g");
const ANSI_CSI_INCOMPLETE_PATTERN = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*$`, "g");
const ANSI_OSC_INCOMPLETE_PATTERN = new RegExp(String.raw`\u001B\][^\u0007\u001B]*$`, "g");
const ANSI_SINGLE_PATTERN = new RegExp(String.raw`\u001B[@-_]`, "g");
const TRUNCATION_SUFFIX = "\n... truncated ...";
const MIDDLE_TRUNCATION_MARKER = "\n... omitted ...\n";
const COMBINING_MARK_PATTERN = /\p{Mark}/u;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const graphemeSegmenter = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

function graphemes(text: string): string[] {
  if (!graphemeSegmenter) {
    return Array.from(text);
  }

  return Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment);
}

function trimHeadToLineBoundary(text: string): string {
  const lastNewline = text.lastIndexOf("\n");
  if (lastNewline === -1 || lastNewline < Math.floor(text.length * 0.5)) {
    return text;
  }
  return text.slice(0, lastNewline);
}

function trimTailToLineBoundary(text: string): string {
  const firstNewline = text.indexOf("\n");
  if (firstNewline === -1 || firstNewline > Math.ceil(text.length * 0.5)) {
    return text;
  }
  return text.slice(firstNewline + 1);
}

export function stripAnsi(text: string): string {
  return text
    .replaceAll(ANSI_OSC_PATTERN, "")
    .replaceAll(ANSI_CSI_PATTERN, "")
    .replaceAll(ANSI_OSC_INCOMPLETE_PATTERN, "")
    .replaceAll(ANSI_CSI_INCOMPLETE_PATTERN, "")
    .replaceAll(ANSI_SINGLE_PATTERN, "")
    .replaceAll("\u001b", "");
}

export function countTextChars(text: string): number {
  return graphemes(text).length;
}

function codePointWidth(codePoint: number): number {
  if (
    codePoint === 0
    || (codePoint >= 0x0000 && codePoint < 0x0020)
    || (codePoint >= 0x007f && codePoint < 0x00a0)
  ) {
    return 0;
  }

  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f)
    || codePoint === 0x2329
    || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  ) {
    return 2;
  }

  return 1;
}

function graphemeWidth(segment: string): number {
  if (segment === "") {
    return 0;
  }

  if (EMOJI_PATTERN.test(segment)) {
    return 2;
  }

  let width = 0;
  let hasVisibleCodePoint = false;
  for (const char of segment) {
    if (char === "\u200d" || char === "\ufe0f" || COMBINING_MARK_PATTERN.test(char)) {
      continue;
    }
    width = Math.max(width, codePointWidth(char.codePointAt(0) ?? 0));
    hasVisibleCodePoint = true;
  }

  return hasVisibleCodePoint ? width : 0;
}

export function countTerminalCells(text: string): number {
  return graphemes(text).reduce((sum, segment) => sum + graphemeWidth(segment), 0);
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
  const head = trimHeadToLineBoundary(graphemes(text).slice(0, bodyChars).join(""));
  return `${head}${TRUNCATION_SUFFIX}`;
}

export function clampTextMiddle(text: string, maxChars: number): string {
  if (countTextChars(text) <= maxChars) {
    return text;
  }

  const markerChars = countTextChars(MIDDLE_TRUNCATION_MARKER);
  const bodyChars = Math.max(0, maxChars - markerChars);
  const headChars = Math.ceil(bodyChars * 0.7);
  const tailChars = Math.max(0, bodyChars - headChars);
  const segments = graphemes(text);
  const head = trimHeadToLineBoundary(segments.slice(0, headChars).join(""));
  const tail = trimTailToLineBoundary(segments.slice(-tailChars).join(""));

  return `${head}${MIDDLE_TRUNCATION_MARKER}${tail}`;
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
