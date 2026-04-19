import {
  getCommandName,
  getGitSubcommand,
  hasSequentialShellCommands,
  isFileContentInspectionCommand,
  stripLeadingCdPrefix,
  tokenizeCommand,
} from "./command.js";

import type { ToolExecutionInput } from "../types.js";

type StdinFilterSpec = {
  flags?: readonly string[];
  valueFlags?: readonly string[];
  inlineValuePrefixes?: readonly string[];
  compactValueFlags?: readonly RegExp[];
};

const REPO_INVENTORY_COMMANDS = new Set(["find", "fd", "fdfind", "ls"]);
const FIND_EXEC_ACTIONS = new Set(["-exec", "-execdir", "-ok", "-okdir"]);
const FD_EXEC_OPTIONS = new Set(["-x", "--exec", "-X", "--exec-batch"]);
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
  const commandName = getCommandName(argv);
  if (commandName === "find") {
    return argv.every((arg) => !FIND_EXEC_ACTIONS.has(arg));
  }
  if (commandName === "fd" || commandName === "fdfind") {
    return argv.every((arg) => !FD_EXEC_OPTIONS.has(arg) && !arg.startsWith("--exec=") && !arg.startsWith("--exec-batch="));
  }
  return true;
}

export function isRepositoryInventoryCommand(input: Pick<ToolExecutionInput, "argv" | "command">): boolean {
  const argv = input.argv?.length ? input.argv : tokenizeCommand(stripLeadingCdPrefix(input.command ?? ""));
  const argv0 = getCommandName(argv);
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
    const commandName = getCommandName(argv);
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
