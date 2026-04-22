import {
  getCommandName,
  getGitSubcommand,
  isFileContentInspectionCommand,
} from "./command-identity.js";
import { getEffectiveCommandArgv } from "./command-match.js";
import {
  hasSequentialShellCommands,
  stripLeadingCdPrefix,
  tokenizeCommand,
} from "./command-shell.js";

import type { ToolExecutionInput } from "../types.js";

type StdinFilterSpec = {
  flags?: readonly string[];
  valueFlags?: readonly string[];
  inlineValuePrefixes?: readonly string[];
  compactValueFlags?: readonly RegExp[];
};

const REPO_INVENTORY_COMMANDS = new Set(["find", "fd", "fdfind", "ls"]);
const REPO_INSPECTION_ONLY_COMMANDS = new Set(["tree"]);
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
const WC_FILTER: StdinFilterSpec = {
  flags: ["-l", "--lines"],
};
const REPO_INVENTORY_PIPE_FILTERS = new Map<string, StdinFilterSpec>([
  ["head", HEAD_FILTER],
  ["sort", SORT_FILTER],
  ["tail", TAIL_FILTER],
  ["uniq", UNIQ_FILTER],
  ["wc", WC_FILTER],
]);

export type RepositoryInventorySafety = "not-inventory" | "safe" | "sequential-command" | "unsafe-pipeline";
export type InspectionCommandPolicy = "compact-all" | "skip-all" | "skip-file-content" | "allow-safe-inventory";
export type InspectionCommandSkipReason =
  | "inspection-command"
  | "file-content-inspection-command"
  | "sequential-inventory-command"
  | "unsafe-inventory-pipeline";

function getRepositoryInventorySourceArgv(command: string): string[] {
  const effectiveCommand = stripLeadingCdPrefix(command);
  const leadingCommand = getLeadingSequentialSegment(effectiveCommand);
  const sourceCommand = splitUnquotedPipes(leadingCommand)[0] ?? leadingCommand;
  return getEffectiveCommandArgv({ command: sourceCommand });
}

function getLeadingSequentialSegment(command: string): string {
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

    if (char === ";" || char === "\n" || (char === "&" && command[index + 1] === "&") || (char === "|" && command[index + 1] === "|")) {
      return current.trim();
    }

    current += char;
  }

  return current.trim();
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
  if (commandName === "sed") {
    return isSafeSedInventoryFilter(argv);
  }

  const spec = REPO_INVENTORY_PIPE_FILTERS.get(commandName);
  if (!spec) {
    return false;
  }
  return isStdinOnlyFilter(argv, spec);
}

function isSafeSedInventoryFilter(argv: string[]): boolean {
  const scripts: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "-") {
      continue;
    }
    if (arg === "-n" || arg === "-E" || arg === "-r") {
      continue;
    }
    if (arg === "-e") {
      index += 1;
      if (index >= argv.length) {
        return false;
      }
      scripts.push(argv[index]!);
      continue;
    }
    if (arg.startsWith("-")) {
      return false;
    }
    scripts.push(arg);
  }

  if (scripts.length === 0 || scripts.length > 2) {
    return false;
  }

  return scripts.every((script) => {
    if (/^(?:\d+|\$)?(?:,\s*(?:\d+|\$))?p$/u.test(script)) {
      return true;
    }
    return /^s(.)(?:\^?[^\\\n]*)\1(?:[^\\\n]*)\1[gIp]*$/u.test(script);
  });
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
  const argv = input.argv?.length ? getEffectiveCommandArgv(input) : getRepositoryInventorySourceArgv(input.command ?? "");
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
  const sourceArgv = getRepositoryInventorySourceArgv(effectiveCommand);
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
  const argv = input.argv?.length ? getEffectiveCommandArgv(input) : getRepositoryInventorySourceArgv(input.command ?? "");
  const argv0 = getCommandName(argv);
  if (isFileContentInspectionCommand(input)) {
    return true;
  }
  if (isRepositoryInventoryCommand(input)) {
    return true;
  }
  if (argv0 && REPO_INSPECTION_ONLY_COMMANDS.has(argv0)) {
    return true;
  }
  return false;
}

export function hasCommandOnlyFileContentSummary(command: string): boolean {
  const effectiveCommand = stripLeadingCdPrefix(command);
  return /\bpackage-lock\.json\b/u.test(effectiveCommand);
}

export function getSafeRepositoryInventorySourceArgv(command: string): string[] | null {
  return getRepositoryInventorySafety(command) === "safe"
    ? getRepositoryInventorySourceArgv(command)
    : null;
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

  if (isFileContentInspectionCommand({ command }) && !hasCommandOnlyFileContentSummary(command)) {
    return "file-content-inspection-command";
  }

  if (policy === "skip-file-content") {
    return null;
  }

  if (isRepositoryInspectionCommand({ command })) {
    const sourceArgv = getRepositoryInventorySourceArgv(command);
    const argv0 = getCommandName(sourceArgv);
    if (argv0 && REPO_INSPECTION_ONLY_COMMANDS.has(argv0)) {
      return "inspection-command";
    }
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
