const POSIX_SAFE_SHELL_WORD = /^[A-Za-z0-9_./:-]+$/u;
const WINDOWS_SAFE_SHELL_WORD = /^[A-Za-z0-9_./:\\-]+$/u;

export function isTokenjuiceExecutablePath(value: string): boolean {
  return /(?:^|[\\/])tokenjuice(?:\.(?:exe|cmd|bat))?$/iu.test(value);
}

function isHookExecutablePath(value: string): boolean {
  return isNodeExecutablePath(value) || isTokenjuiceExecutablePath(value);
}

function coalesceLeadingWindowsExecutable(words: string[]): string[] {
  if (words.length < 2 || isHookExecutablePath(words[0] ?? "")) {
    return words;
  }

  for (let index = 1; index < words.length; index += 1) {
    const candidate = words.slice(0, index + 1).join(" ");
    if (isHookExecutablePath(candidate)) {
      return [candidate, ...words.slice(index + 1)];
    }
  }

  return words;
}

export function shellQuote(value: string, platform = process.platform): string {
  const safePattern = platform === "win32" ? WINDOWS_SAFE_SHELL_WORD : POSIX_SAFE_SHELL_WORD;
  if (safePattern.test(value)) {
    return value;
  }

  if (platform === "win32") {
    return `"${value}"`;
  }

  return posixShellQuote(value);
}

/**
 * Quote a value for a POSIX shell, regardless of the host platform.
 *
 * `shellQuote` picks its quoting style from `process.platform`, which is the
 * right question for a *path* going into a host config file: on win32 it wraps
 * in double quotes without escaping, and that is safe because a Windows path
 * cannot contain `"` in the first place.
 *
 * It is the wrong question for a *command* that we are about to hand to a
 * POSIX shell via `-lc`. There the parser is the shell we resolved, not the
 * platform we happen to be running on, and user commands routinely contain
 * quotes. Wrapping `git commit -m "fix: thing"` in bare double quotes on
 * Windows yields `-lc "git commit -m "fix: thing""`, which bash re-splits into
 * `git commit -m fix: thing` -- a different command, silently.
 *
 * Callers building a command line that a POSIX shell will parse must use this
 * for every argv item, including Windows paths and the `-lc` payload.
 */
export function posixShellQuote(value: string): string {
  if (POSIX_SAFE_SHELL_WORD.test(value)) {
    return value;
  }

  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

export function parseShellWords(command: string, platform = process.platform): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaping = false;

  const chars = [...command];
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] as string;

    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      if (platform === "win32") {
        current += char;
      } else if (chars[index + 1] === "\n") {
        index += 1;
      } else if (quote === "\"") {
        const next = chars[index + 1];
        if (next === "$" || next === "`" || next === "\"" || next === "\\") {
          escaping = true;
        } else {
          current += char;
        }
      } else {
        escaping = true;
      }
      continue;
    }

    if (quote === "\"") {
      if (char === "\"") {
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
        words.push(current);
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
    words.push(current);
  }

  return platform === "win32" ? coalesceLeadingWindowsExecutable(words) : words;
}

export function isNodeExecutablePath(value: string): boolean {
  return /(?:^|[\\/])node(?:\.exe)?$/iu.test(value);
}

export function extractHookCommandPaths(command: string, platform = process.platform): string[] {
  const argv = parseShellWords(command, platform);
  if (argv.length === 0) {
    return [];
  }

  const paths = new Set<string>();
  const first = argv[0];
  if (first && (first.includes("/") || first.includes("\\"))) {
    paths.add(first);
  }

  const second = argv[1];
  if (
    first
    && second
    && isNodeExecutablePath(first)
    && (second.endsWith(".js") || isTokenjuiceExecutablePath(second))
  ) {
    paths.add(second);
  }

  return [...paths];
}
