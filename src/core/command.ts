import { basename } from "node:path";

import type { ToolExecutionInput } from "../types.js";

type ShellOperator = ";" | "\n" | "|" | "&&" | "||";
type StdinFilterSpec = {
  flags?: readonly string[];
  valueFlags?: readonly string[];
  inlineValuePrefixes?: readonly string[];
  compactValueFlags?: readonly RegExp[];
};

const FILE_CONTENT_INSPECTION_COMMANDS = new Set(["cat", "sed", "head", "tail", "nl", "bat", "batcat", "jq", "yq"]);
const REPO_INVENTORY_COMMANDS = new Set(["find", "fd", "fdfind", "ls"]);
const FIND_EXEC_ACTIONS = new Set(["-exec", "-execdir", "-ok", "-okdir"]);
const FD_EXEC_OPTIONS = new Set(["-x", "--exec", "-X", "--exec-batch"]);
const COMPOUND_SHELL_OPERATORS = new Set<ShellOperator>([";", "\n", "|", "&&", "||"]);
const SEQUENTIAL_SHELL_OPERATORS = new Set<ShellOperator>([";", "\n", "&&", "||"]);
const HEAD_FILTER: StdinFilterSpec = {
  flags: ["-q", "-v", "-z"],
  valueFlags: ["-n", "-c", "--lines", "--bytes"],
  inlineValuePrefixes: ["--lines=", "--bytes="],
  compactValueFlags: [/^-[0-9]+$/u, /^-[nc].+/u],
};
const TAIL_FILTER: StdinFilterSpec = {
  flags: ["-q", "-v", "-z", "-f", "-F", "-r"],
  valueFlags: ["-n", "-c", "--lines", "--bytes", "--pid", "-s", "--sleep-interval"],
  inlineValuePrefixes: ["--lines=", "--bytes=", "--pid=", "--sleep-interval="],
  compactValueFlags: [/^-[0-9]+$/u, /^-[nc].+/u],
};
const SORT_FILTER: StdinFilterSpec = {
  flags: [
    "-b",
    "-d",
    "-f",
    "-g",
    "-h",
    "-i",
    "-M",
    "-m",
    "-n",
    "-R",
    "-r",
    "-s",
    "-u",
    "-V",
    "-z",
    "--batch-size",
    "--check",
    "--debug",
    "--dictionary-order",
    "--general-numeric-sort",
    "--human-numeric-sort",
    "--ignore-case",
    "--ignore-leading-blanks",
    "--ignore-nonprinting",
    "--merge",
    "--month-sort",
    "--numeric-sort",
    "--random-sort",
    "--reverse",
    "--sort",
    "--stable",
    "--unique",
    "--version-sort",
    "--zero-terminated",
  ],
  valueFlags: ["-k", "-S", "-t", "--batch-size", "--key", "--sort"],
  inlineValuePrefixes: ["--batch-size=", "--key=", "--sort="],
  compactValueFlags: [/^-[bdfghinMmrRsuVz]*k.+/u, /^-[bdfghinMmrRsuVz]*S.+/u, /^-[bdfghinMmrRsuVz]*t.+/u],
};
const UNIQ_FILTER: StdinFilterSpec = {
  flags: [
    "-c",
    "-d",
    "-D",
    "-i",
    "-u",
    "-z",
    "--all-repeated",
    "--count",
    "--ignore-case",
    "--repeated",
    "--unique",
    "--zero-terminated",
  ],
  valueFlags: ["-f", "-s", "-w", "--skip-fields", "--skip-chars", "--check-chars"],
  inlineValuePrefixes: ["--skip-fields=", "--skip-chars=", "--check-chars=", "--all-repeated="],
  compactValueFlags: [/^-[fsw].+/u],
};
const REPO_INVENTORY_PIPE_FILTERS = new Map<string, StdinFilterSpec>([
  ["head", HEAD_FILTER],
  ["sort", SORT_FILTER],
  ["tail", TAIL_FILTER],
  ["uniq", UNIQ_FILTER],
]);

export type RepositoryInventorySafety = "not-inventory" | "safe" | "sequential-command" | "unsafe-pipeline";
export type InspectionCommandPolicy = "compact-all" | "skip-all" | "skip-file-content" | "allow-safe-inventory";
export type InspectionCommandSkipReason =
  | "inspection-command"
  | "file-content-inspection-command"
  | "sequential-inventory-command"
  | "unsafe-inventory-pipeline";

function getNormalizedArgv(input: Pick<ToolExecutionInput, "argv" | "command">): string[] {
  if (input.argv?.length) {
    return input.argv;
  }
  if (!input.command) {
    return [];
  }
  return tokenizeCommand(stripLeadingCdPrefix(input.command));
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

function splitUnquotedPipes(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaping = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;

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

    if (char === "|" && command[index + 1] !== "|") {
      if (current.trim()) {
        segments.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

function isKnownFlag(arg: string, spec: StdinFilterSpec): boolean {
  return (spec.flags?.includes(arg) ?? false)
    || (spec.inlineValuePrefixes?.some((prefix) => arg.startsWith(prefix)) ?? false)
    || (spec.compactValueFlags?.some((pattern) => pattern.test(arg)) ?? false);
}

function isStdinOnlyFilter(argv: string[], spec: StdinFilterSpec): boolean {
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "-") {
      continue;
    }
    if (arg === "--") {
      return argv.slice(index + 1).every((operand) => operand === "-");
    }
    if (spec.valueFlags?.includes(arg)) {
      index += 1;
      if (index >= argv.length) {
        return false;
      }
      continue;
    }
    if (isKnownFlag(arg, spec)) {
      continue;
    }
    return false;
  }
  return true;
}

function isSafeRepositoryInventoryPipeSegment(commandName: string, argv: string[]): boolean {
  const spec = REPO_INVENTORY_PIPE_FILTERS.get(commandName);
  if (!spec) {
    return false;
  }
  return isStdinOnlyFilter(argv, spec);
}

function isSafeRepositoryInventorySource(argv: string[]): boolean {
  const commandName = getNormalizedArgv0(argv);
  if (commandName === "find") {
    return argv.every((arg) => !FIND_EXEC_ACTIONS.has(arg));
  }
  if (commandName === "fd" || commandName === "fdfind") {
    return argv.every((arg) => !FD_EXEC_OPTIONS.has(arg) && !arg.startsWith("--exec=") && !arg.startsWith("--exec-batch="));
  }
  return true;
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
  if (getNormalizedArgv0(argv) !== "git") {
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
  const argv0 = getNormalizedArgv0(argv);
  if (!argv0) {
    return false;
  }
  return FILE_CONTENT_INSPECTION_COMMANDS.has(argv0);
}

export function isRepositoryInventoryCommand(input: Pick<ToolExecutionInput, "argv" | "command">): boolean {
  const argv = getNormalizedArgv(input);
  const argv0 = getNormalizedArgv0(argv);
  if (!argv0) {
    return false;
  }
  if (REPO_INVENTORY_COMMANDS.has(argv0)) {
    return true;
  }
  if (argv0 === "rg" && argv.includes("--files")) {
    return true;
  }
  if (argv0 === "git" && getGitSubcommand(argv) === "ls-files") {
    return true;
  }
  return false;
}

export function getRepositoryInventorySafety(command: string): RepositoryInventorySafety {
  const effectiveCommand = stripLeadingCdPrefix(command);
  const sourceArgv = tokenizeCommand(effectiveCommand);
  if (!isRepositoryInventoryCommand({ argv: sourceArgv })) {
    return "not-inventory";
  }
  if (!isSafeRepositoryInventorySource(sourceArgv)) {
    return "unsafe-pipeline";
  }
  if (hasSequentialShellCommands(effectiveCommand)) {
    return "sequential-command";
  }

  const segments = splitUnquotedPipes(effectiveCommand);
  if (segments.length <= 1) {
    return "safe";
  }

  const safePipeline = segments.slice(1).every((segment) => {
    const argv = tokenizeCommand(segment);
    const commandName = getNormalizedArgv0(argv);
    return commandName !== null && isSafeRepositoryInventoryPipeSegment(commandName, argv);
  });
  return safePipeline ? "safe" : "unsafe-pipeline";
}

export function isSafeRepositoryInventoryPipeline(command: string): boolean {
  return getRepositoryInventorySafety(command) === "safe";
}

export function isRepositoryInspectionCommand(input: Pick<ToolExecutionInput, "argv" | "command">): boolean {
  if (isFileContentInspectionCommand(input)) {
    return true;
  }
  if (isRepositoryInventoryCommand(input)) {
    return true;
  }
  return false;
}

export function getInspectionCommandSkipReason(
  command: string,
  policy: InspectionCommandPolicy,
): InspectionCommandSkipReason | null {
  if (policy === "compact-all") {
    return null;
  }

  if (policy === "skip-all") {
    return isRepositoryInspectionCommand({ command }) ? "inspection-command" : null;
  }

  if (isFileContentInspectionCommand({ command })) {
    return "file-content-inspection-command";
  }

  if (policy === "skip-file-content") {
    return null;
  }

  const inventorySafety = getRepositoryInventorySafety(command);
  if (inventorySafety === "sequential-command") {
    return "sequential-inventory-command";
  }
  if (inventorySafety === "unsafe-pipeline") {
    return "unsafe-inventory-pipeline";
  }
  return null;
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
  if (input.argv?.length || !input.command) {
    return input;
  }

  const argv = tokenizeCommand(stripLeadingCdPrefix(input.command));
  if (argv.length === 0) {
    return input;
  }

  return {
    ...input,
    argv,
  };
}
