type ShellOperator = ";" | "\n" | "|" | "&&" | "||";

const COMPOUND_SHELL_OPERATORS = new Set<ShellOperator>([";", "\n", "|", "&&", "||"]);
const SEQUENTIAL_SHELL_OPERATORS = new Set<ShellOperator>([";", "\n", "&&", "||"]);

export const ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=.*/u;

export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaping = false;

  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    if (/\s/u.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += "\\";
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function hasUnquotedShellOperator(command: string, operators: Set<ShellOperator>): boolean {
  let quote: "'" | "\"" | null = null;
  let escaping = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    if ((char === ";" || char === "\n" || char === "|") && operators.has(char)) {
      return true;
    }

    if (char === "&" && command[index + 1] === "&" && operators.has("&&")) {
      return true;
    }

    if (char === "|" && command[index + 1] === "|" && operators.has("||")) {
      return true;
    }
  }

  return false;
}

export function splitTopLevelCommandChain(command: string): string[] {
  const trimmed = command.trim();
  if (!trimmed) {
    return [];
  }

  const segments: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaping = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]!;

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaping = true;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      current += char;
      quote = char;
      continue;
    }

    if (char === "&" && trimmed[index + 1] === "&") {
      const segment = current.trim();
      if (segment) {
        segments.push(segment);
      }
      current = "";
      index += 1;
      continue;
    }

    if (char === ";" || char === "\n") {
      const segment = current.trim();
      if (segment) {
        segments.push(segment);
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (quote || escaping) {
    return [trimmed];
  }

  const segment = current.trim();
  if (segment) {
    segments.push(segment);
  }

  return segments;
}

export function isCompoundShellCommand(command: string): boolean {
  return hasUnquotedShellOperator(command, COMPOUND_SHELL_OPERATORS);
}

export function hasSequentialShellCommands(command: string): boolean {
  return hasUnquotedShellOperator(command, SEQUENTIAL_SHELL_OPERATORS);
}

export function stripLeadingEnvAssignmentsFromCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) {
    return null;
  }

  let index = 0;

  while (index < trimmed.length) {
    while (/\s/u.test(trimmed[index] ?? "")) {
      index += 1;
    }

    if (index >= trimmed.length) {
      return null;
    }

    const tokenStart = index;
    let quote: "'" | "\"" | null = null;
    let escaping = false;

    while (index < trimmed.length) {
      const char = trimmed[index]!;

      if (escaping) {
        escaping = false;
        index += 1;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        index += 1;
        continue;
      }

      if (quote) {
        if (char === quote) {
          quote = null;
        }
        index += 1;
        continue;
      }

      if (char === "'" || char === "\"") {
        quote = char;
        index += 1;
        continue;
      }

      if (/\s/u.test(char)) {
        break;
      }

      index += 1;
    }

    if (quote || escaping) {
      return trimmed;
    }

    const token = trimmed.slice(tokenStart, index);
    if (!ENV_ASSIGNMENT_PATTERN.test(token)) {
      return trimmed.slice(tokenStart).trim();
    }
  }

  return null;
}

/**
 * Strip trivial leading `cd <dir> && ` (or `pushd`) prefixes from a shell
 * command. Models sometimes emit `cd /path && git status` even when the
 * harness provides a cwd, which causes downstream compound-command heuristics
 * to skip compaction. Stripping the prefix lets classification and the
 * rewrite policy reason about the effective command.
 *
 * Only handles trivially safe chains — a single shell token argument, no
 * redirections, no nested pipelines. Anything fancier returns the input
 * unchanged.
 */
export function stripLeadingCdPrefix(command: string): string {
  let current = command.trim();
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const next = matchLeadingCdChain(current);
    if (next === null) {
      return current;
    }
    current = next;
  }
  return current;
}

function matchLeadingCdChain(command: string): string | null {
  const keywordMatch = /^\s*(cd|pushd)(\s+)/u.exec(command);
  if (!keywordMatch) {
    return null;
  }

  let index = keywordMatch[0].length;
  const length = command.length;
  let quote: "'" | "\"" | null = null;
  let escaping = false;
  let sawArg = false;

  while (index < length) {
    const char = command[index]!;
    if (escaping) {
      escaping = false;
      index += 1;
      sawArg = true;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      index += 1;
      sawArg = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      index += 1;
      sawArg = true;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      index += 1;
      sawArg = true;
      continue;
    }
    if (/\s/u.test(char)) {
      break;
    }
    if (
      char === "&"
      || char === "|"
      || char === ";"
      || char === "<"
      || char === ">"
      || char === "\n"
    ) {
      return null;
    }
    sawArg = true;
    index += 1;
  }

  if (!sawArg) {
    return null;
  }

  while (index < length && /[ \t]/u.test(command[index]!)) {
    index += 1;
  }

  if (command[index] === "&" && command[index + 1] === "&") {
    const tail = command.slice(index + 2).trim();
    return tail.length > 0 ? tail : null;
  }
  return null;
}
