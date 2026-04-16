import { basename } from "node:path";

import type { ToolExecutionInput } from "../types.js";

const FILE_CONTENT_INSPECTION_COMMANDS = new Set(["cat", "sed", "head", "tail", "nl", "bat", "batcat", "jq", "yq"]);
const REPO_INVENTORY_COMMANDS = new Set(["find", "fd", "fdfind", "ls", "tree"]);

function getNormalizedArgv(input: Pick<ToolExecutionInput, "argv" | "command">): string[] {
  if (input.argv?.length) {
    return input.argv;
  }
  if (!input.command) {
    return [];
  }
  return tokenizeCommand(input.command);
}

function getNormalizedArgv0(argv: string[]): string | null {
  const first = argv[0];
  if (!first) {
    return null;
  }
  return basename(first.replace(/^["']|["']$/gu, ""));
}

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

export function isCompoundShellCommand(command: string): boolean {
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

    if (char === ";" || char === "\n" || char === "|") {
      return true;
    }

    if ((char === "&" || char === "|") && command[index + 1] === char) {
      return true;
    }
  }

  return false;
}

export function isFileContentInspectionCommand(input: Pick<ToolExecutionInput, "argv" | "command">): boolean {
  const argv = getNormalizedArgv(input);
  const argv0 = getNormalizedArgv0(argv);
  if (!argv0) {
    return false;
  }
  return FILE_CONTENT_INSPECTION_COMMANDS.has(argv0);
}

export function isRepositoryInspectionCommand(input: Pick<ToolExecutionInput, "argv" | "command">): boolean {
  const argv = getNormalizedArgv(input);
  const argv0 = getNormalizedArgv0(argv);
  if (!argv0) {
    return false;
  }
  if (isFileContentInspectionCommand(input)) {
    return true;
  }
  if (REPO_INVENTORY_COMMANDS.has(argv0)) {
    return true;
  }
  if (argv0 === "rg" && argv.includes("--files")) {
    return true;
  }
  if (argv0 === "git" && argv[1] === "ls-files") {
    return true;
  }
  return false;
}

export function normalizeCommandSignature(command?: string): string | null {
  if (!command || command === "stdin" || command.startsWith("reduce:")) {
    return null;
  }

  const argv = getNormalizedArgv({ command });
  if (argv.length === 0) {
    return null;
  }

  const normalized = getNormalizedArgv0(argv);
  return normalized || null;
}

export function normalizeExecutionInput(input: ToolExecutionInput): ToolExecutionInput {
  if (input.argv?.length || !input.command) {
    return input;
  }

  const argv = tokenizeCommand(input.command);
  if (argv.length === 0) {
    return input;
  }

  return {
    ...input,
    argv,
  };
}
