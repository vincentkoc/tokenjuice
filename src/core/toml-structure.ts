type TomlMultilineState = {
  delimiter: "\"\"\"" | "'''" | undefined;
};

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findTomlMultilineClose(line: string, delimiter: "\"\"\"" | "'''", fromIndex: number): number {
  let searchIndex = fromIndex;
  while (searchIndex < line.length) {
    const closeIndex = line.indexOf(delimiter, searchIndex);
    if (closeIndex === -1) {
      return -1;
    }
    if (delimiter === "'''" || !isEscaped(line, closeIndex)) {
      return closeIndex;
    }
    searchIndex = closeIndex + 1;
  }
  return -1;
}

function updateTomlMultilineState(line: string, state: TomlMultilineState): void {
  let index = 0;
  let inBasicString = false;
  let inLiteralString = false;
  while (index < line.length) {
    if (state.delimiter) {
      const closeIndex = findTomlMultilineClose(line, state.delimiter, index);
      if (closeIndex === -1) {
        return;
      }
      index = closeIndex + state.delimiter.length;
      state.delimiter = undefined;
      continue;
    }

    const next = line.slice(index, index + 3);
    const char = line[index];
    if (inBasicString) {
      if (char === "\"" && !isEscaped(line, index)) {
        inBasicString = false;
      }
      index += 1;
      continue;
    }
    if (inLiteralString) {
      if (char === "'") {
        inLiteralString = false;
      }
      index += 1;
      continue;
    }

    if (char === "#") {
      return;
    }
    if (next === "\"\"\"" || next === "'''") {
      const closeIndex = findTomlMultilineClose(line, next, index + next.length);
      if (closeIndex === -1) {
        state.delimiter = next;
        return;
      }
      index = closeIndex + next.length;
      continue;
    }
    if (char === "\"") {
      inBasicString = true;
    } else if (char === "'") {
      inLiteralString = true;
    }
    index += 1;
  }
}

export function getTomlStructureLines(lines: readonly string[]): string[] {
  const state: TomlMultilineState = { delimiter: undefined };
  return lines.map((line) => {
    const structuralLine = state.delimiter ? "" : line;
    updateTomlMultilineState(line, state);
    return structuralLine;
  });
}

export function isTomlTableHeader(line: string): boolean {
  return /^\s*(?:\[[^\]\n]+\]|\[\[[^\]\n]+\]\])\s*(?:#.*)?$/u.test(line);
}
