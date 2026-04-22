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

  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

export function parseShellWords(command: string, platform = process.platform): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaping = false;

  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (platform !== "win32" && char === "\\") {
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
  if (first && second && isNodeExecutablePath(first) && second.endsWith(".js")) {
    paths.add(second);
  }

  return [...paths];
}
