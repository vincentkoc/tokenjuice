export function stripYamlComment(value: string): { value: string; isValid: boolean } {
  let quote: "\"" | "'" | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote === "\"") {
      if (char === "\\" && index + 1 < value.length) {
        index += 1;
        continue;
      }
      if (char === "\"") {
        quote = undefined;
      }
      continue;
    }
    if (quote === "'") {
      if (char === "'" && value[index + 1] === "'") {
        index += 1;
        continue;
      }
      if (char === "'") {
        quote = undefined;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || /\s/u.test(value[index - 1] ?? ""))) {
      return { value: value.slice(0, index).trim(), isValid: true };
    }
  }

  return { value: value.trim(), isValid: quote === undefined };
}

function hasHexDigits(value: string, start: number, length: number): boolean {
  if (start + length > value.length) {
    return false;
  }
  return /^[0-9A-Fa-f]+$/u.test(value.slice(start, start + length));
}

export function isValidDoubleQuotedYamlScalar(value: string): boolean {
  if (!value.startsWith("\"") || !value.endsWith("\"")) {
    return false;
  }
  for (let index = 1; index < value.length - 1; index += 1) {
    if (value[index] === "\"") {
      return false;
    }
    if (value[index] !== "\\") {
      continue;
    }
    const escape = value[index + 1];
    if (!escape) {
      return false;
    }
    if ("0abtnvfre\"/\\N_LP".includes(escape)) {
      index += 1;
      continue;
    }
    const hexLength = escape === "x" ? 2 : escape === "u" ? 4 : escape === "U" ? 8 : 0;
    if (hexLength === 0 || !hasHexDigits(value, index + 2, hexLength)) {
      return false;
    }
    index += 1 + hexLength;
  }
  return true;
}

function isYamlBlockScalarHeader(value: string): boolean {
  return /^[|>](?:[+-][1-9]?|[1-9][+-]?)?$/u.test(value);
}

function normalizeYamlScalar(value: string): string {
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1).replace(/\\(["\\])/gu, "$1");
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/gu, "'");
  }
  return value;
}

export function parseSimpleYamlFrontmatter(
  frontmatter: string[],
  isValidSimpleYamlScalar: (rawValue: string) => boolean,
): { hasValidYaml: boolean; values: Map<string, string> } {
  const values = new Map<string, string>();
  for (let index = 0; index < frontmatter.length; index += 1) {
    const line = frontmatter[index] ?? "";
    const trimmedLine = line.trim();
    if (trimmedLine === "" || trimmedLine.startsWith("#")) {
      continue;
    }
    const match = /^\s*([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line);
    if (!match) {
      return { hasValidYaml: false, values };
    }
    const key = match[1] ?? "";
    if (values.has(key)) {
      return { hasValidYaml: false, values };
    }
    const rawValue = match[2] ?? "";
    const stripped = stripYamlComment(rawValue);
    if (!stripped.isValid) {
      return { hasValidYaml: false, values };
    }
    if (isYamlBlockScalarHeader(stripped.value)) {
      const blockLines: string[] = [];
      for (index += 1; index < frontmatter.length; index += 1) {
        const blockLine = frontmatter[index] ?? "";
        if (blockLine.trim() === "") {
          blockLines.push("");
          continue;
        }
        if (/^\s/u.test(blockLine)) {
          blockLines.push(blockLine.trimEnd());
          continue;
        }
        index -= 1;
        break;
      }
      values.set(key, blockLines.join("\n").trim());
      continue;
    }
    if (!isValidSimpleYamlScalar(rawValue)) {
      return { hasValidYaml: false, values };
    }
    values.set(key, normalizeYamlScalar(stripped.value));
  }
  return { hasValidYaml: true, values };
}
