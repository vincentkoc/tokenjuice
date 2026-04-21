import { basename } from "node:path";

import type { ToolExecutionInput } from "../types.js";

type ShellOperator = ";" | "\n" | "|" | "&&" | "||";

const FILE_CONTENT_INSPECTION_COMMANDS = new Set(["cat", "sed", "head", "tail", "nl", "bat", "batcat", "jq", "yq"]);
const COMPOUND_SHELL_OPERATORS = new Set<ShellOperator>([";", "\n", "|", "&&", "||"]);
const SEQUENTIAL_SHELL_OPERATORS = new Set<ShellOperator>([";", "\n", "&&", "||"]);
const SHELL_COMMAND_LAUNCHERS = new Set(["bash", "sh", "zsh", "fish"]);

function getNormalizedArgv(input: Pick<ToolExecutionInput, "argv" | "command">): string[] {
  if (input.argv?.length) {
    return input.argv;
  }
  if (!input.command) {
    return [];
  }
  return tokenizeCommand(stripLeadingCdPrefix(input.command));
}

export function getCommandName(argv: string[]): string | null {
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

export function isCompoundShellCommand(command: string): boolean {
  return hasUnquotedShellOperator(command, COMPOUND_SHELL_OPERATORS);
}

export function hasSequentialShellCommands(command: string): boolean {
  return hasUnquotedShellOperator(command, SEQUENTIAL_SHELL_OPERATORS);
}

function gitGlobalOptionTakesValue(option: string): boolean {
  return option === "-C"
    || option === "-c"
    || option === "--git-dir"
    || option === "--work-tree"
    || option === "--namespace"
    || option === "--exec-path"
    || option === "--super-prefix"
    || option === "--config-env";
}

function isGitGlobalOptionWithInlineValue(option: string): boolean {
  return option.startsWith("--git-dir=")
    || option.startsWith("--work-tree=")
    || option.startsWith("--namespace=")
    || option.startsWith("--exec-path=")
    || option.startsWith("--super-prefix=")
    || option.startsWith("--config-env=");
}

export function getGitSubcommand(argv: string[]): string | null {
  if (getCommandName(argv) !== "git") {
    return null;
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (gitGlobalOptionTakesValue(arg)) {
      index += 1;
      continue;
    }

    if (isGitGlobalOptionWithInlineValue(arg)) {
      continue;
    }

    if (arg.startsWith("-")) {
      continue;
    }

    return arg;
  }

  return null;
}

export function isFileContentInspectionCommand(input: Pick<ToolExecutionInput, "argv" | "command">): boolean {
  const argv = getNormalizedArgv(input);
  const argv0 = getCommandName(argv);
  if (!argv0) {
    return false;
  }
  return FILE_CONTENT_INSPECTION_COMMANDS.has(argv0);
}

export function normalizeCommandSignature(command?: string): string | null {
  if (!command || command === "stdin" || command.startsWith("reduce:")) {
    return null;
  }

  const argv = getNormalizedArgv({ command });
  if (argv.length === 0) {
    return null;
  }

  const normalized = getCommandName(argv);
  return normalized || null;
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
  // Guard against pathological inputs; legitimate chains are rarely > 2.
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const next = matchLeadingCdChain(current);
    if (next === null) return current;
    current = next;
  }
  return current;
}

function matchLeadingCdChain(command: string): string | null {
  const keywordMatch = /^\s*(cd|pushd)(\s+)/u.exec(command);
  if (!keywordMatch) return null;

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
      if (char === quote) quote = null;
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
    if (/\s/u.test(char)) break;
    if (
      char === "&" ||
      char === "|" ||
      char === ";" ||
      char === "<" ||
      char === ">" ||
      char === "\n"
    ) {
      return null;
    }
    sawArg = true;
    index += 1;
  }

  if (!sawArg) return null;

  while (index < length && /[ \t]/u.test(command[index]!)) index += 1;

  if (command[index] === "&" && command[index + 1] === "&") {
    const tail = command.slice(index + 2).trim();
    return tail.length > 0 ? tail : null;
  }
  return null;
}


export function normalizeExecutionInput(input: ToolExecutionInput): ToolExecutionInput {
  const shellWrapped = unwrapShellLauncherCommand(input);
  if (shellWrapped) {
    const effectiveCommand = stripLeadingCdPrefix(shellWrapped);
    if (isCompoundShellCommand(effectiveCommand)) {
      const { argv: _argv, ...restInput } = input;
      return {
        ...restInput,
        command: effectiveCommand,
      };
    }

    const argv = tokenizeCommand(effectiveCommand);
    if (argv.length === 0) {
      return {
        ...input,
        command: effectiveCommand,
      };
    }

    return {
      ...input,
      command: effectiveCommand,
      argv,
    };
  }

  if (input.argv?.length || !input.command) {
    return input;
  }

  const effectiveCommand = stripLeadingCdPrefix(input.command);
  if (isCompoundShellCommand(effectiveCommand)) {
    return input;
  }

  const argv = tokenizeCommand(effectiveCommand);
  if (argv.length === 0) {
    return input;
  }

  return {
    ...input,
    argv,
  };
}

function unwrapShellLauncherCommand(input: ToolExecutionInput): string | null {
  const argv = input.argv;
  if (!argv || argv.length < 3) {
    return null;
  }

  const launcher = getCommandName(argv);
  const launchFlag = argv[1];
  const nestedCommand = argv[2];
  if (
    !launcher
    || !SHELL_COMMAND_LAUNCHERS.has(launcher)
    || (launchFlag !== "-c" && launchFlag !== "-lc")
    || typeof nestedCommand !== "string"
    || nestedCommand.trim().length === 0
  ) {
    return null;
  }

  return nestedCommand;
}
