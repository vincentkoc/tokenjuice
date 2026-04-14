const ANSI_PATTERN = new RegExp(
  String.raw`\u001B\[[0-?]*[ -/]*[@-~]`,
  "g",
);

export function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_PATTERN, "");
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
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 18))}\n... truncated ...`;
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
