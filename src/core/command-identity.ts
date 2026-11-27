import { basename } from "node:path";

import type { ToolExecutionInput } from "../types.js";

import { deriveCommandMatchCandidates, getSourcePriority, type CommandMatchCandidate, unwrapShellRunner } from "./command-match.js";
import { hasSequentialShellCommands, isCompoundShellCommand, stripLeadingCdPrefix, tokenizeCommand } from "./command-shell.js";

const FILE_CONTENT_INSPECTION_COMMANDS = new Set(["cat", "sed", "head", "tail", "nl", "bat", "batcat", "jq", "yq"]);
const REPO_INVENTORY_COMMANDS = new Set(["find", "fd", "fdfind", "ls", "tree"]);

// ssh options that consume a separate value argument (per ssh(1)); needed to
// find where the destination ends and the remote command begins.
const SSH_OPTIONS_WITH_VALUES = new Set([
  "-B",
  "-b",
  "-c",
  "-D",
  "-E",
  "-e",
  "-F",
  "-I",
  "-i",
  "-J",
  "-L",
  "-l",
  "-m",
  "-O",
  "-o",
  "-P",
  "-p",
  "-Q",
  "-R",
  "-S",
  "-W",
  "-w",
]);

function getNormalizedArgv(input: Pick<ToolExecutionInput, "argv" | "command">): string[] {
  if (input.argv?.length) {
    return input.argv;
  }
  if (!input.command) {
    return [];
  }
  return tokenizeCommand(input.command);
}

export function getCommandName(argv: string[]): string | null {
  const first = argv[0];
  if (!first) {
    return null;
  }
  return basename(first.replace(/^["']|["']$/gu, ""));
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
  const index = getGitSubcommandIndex(argv);
  return index === null ? null : argv[index] ?? null;
}

function getGitSubcommandIndex(argv: string[]): number | null {
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

    return index;
  }

  return null;
}

function hasGitNulShortFlag(arg: string): boolean {
  if (arg[0] !== "-") return false;
  let hasNulFlag = false;
  for (let index = 1; index < arg.length; index += 1) {
    const code = arg.charCodeAt(index);
    if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122))) return false;
    if (arg[index] === "z") hasNulFlag = true;
  }
  return hasNulFlag;
}

export function isMachineReadableGitInspectionCommand(input: Pick<ToolExecutionInput, "argv" | "command">, hasNulOutput = false): boolean {
  return deriveCommandMatchCandidates(input).some(({ argv }) => {
    const index = getGitSubcommandIndex(argv);
    if (index === null) return false;
    // NUL separates records even when an alias hides the underlying Git subcommand.
    if (hasNulOutput) return true;
    const subcommand = argv[index];
    if (subcommand !== "status" && subcommand !== "ls-files") return false;

    for (const arg of argv.slice(index + 1)) {
      if (arg === "--") break;
      if (hasGitNulShortFlag(arg)) return true;
      const option = arg.split("=", 1)[0];
      if (subcommand === "status" && option?.startsWith("--porc") && "--porcelain".startsWith(option)) return true;
    }
    return false;
  });
}

function isGitBlobSpecifier(arg: string): boolean {
  return /^[^:]+:.+/u.test(arg);
}

function isGitShowFileContentArgv(argv: string[]): boolean {
  const subcommandIndex = getGitSubcommandIndex(argv);
  if (subcommandIndex === null || argv[subcommandIndex] !== "show") {
    return false;
  }

  for (let index = subcommandIndex + 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--") {
      return false;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    if (isGitBlobSpecifier(arg)) {
      return true;
    }
  }

  return false;
}

function isPlutilFileContentArgv(argv: string[]): boolean {
  if (getCommandName(argv) !== "plutil") {
    return false;
  }
  if (argv.includes("-p")) {
    return true;
  }
  const outputIndex = argv.indexOf("-o");
  return outputIndex !== -1 && argv[outputIndex + 1] === "-";
}

function isReadOnlyConfigInspectionArgv(argv: string[]): boolean {
  return getCommandName(argv) === "openclaw"
    && argv[1] === "config"
    && argv[2] === "get";
}

function getSshRemoteCommand(argv: string[]): string | null {
  if (getCommandName(argv) !== "ssh") {
    return null;
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--") {
      continue;
    }
    if (SSH_OPTIONS_WITH_VALUES.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      continue;
    }

    const remoteCommand = argv.slice(index + 1).join(" ").trim();
    return remoteCommand || null;
  }

  return null;
}

function isFileContentInspectionArgv(argv: string[]): boolean {
  const argv0 = getCommandName(argv);
  if (!argv0) {
    return false;
  }
  return FILE_CONTENT_INSPECTION_COMMANDS.has(argv0) || isGitShowFileContentArgv(argv);
}

function isGhApiContentsDecodeCommand(command: string | undefined): boolean {
  if (!command) {
    return false;
  }
  return /\bgh\s+api\b/u.test(command)
    && /\/contents\//u.test(command)
    && /--jq(?:=|\s+)['"]?\.content['"]?/u.test(command)
    && /\|\s*base64\s+(?:-[dD]\b|--decode\b)/u.test(command);
}

function isRepositoryInspectionArgv(argv: string[]): boolean {
  const argv0 = getCommandName(argv);
  if (!argv0) {
    return false;
  }
  if (isFileContentInspectionArgv(argv)) {
    return true;
  }
  if (REPO_INVENTORY_COMMANDS.has(argv0)) {
    return true;
  }
  if (argv0 === "rg" && argv.includes("--files")) {
    return true;
  }
  if (getGitSubcommand(argv) === "ls-files") {
    return true;
  }
  return false;
}

function getMostDerivedCandidate(
  input: Pick<ToolExecutionInput, "argv" | "command">,
  candidates = deriveCommandMatchCandidates(input),
): CommandMatchCandidate {
  return candidates.reduce((best, candidate) => (
    getSourcePriority(candidate.source) >= getSourcePriority(best.source) ? candidate : best
  ));
}

function extractPipelineSourceCommand(command: string): string {
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
      break;
    }

    current += char;
  }

  return current.trim();
}

function getInspectionArgv(
  input: Pick<ToolExecutionInput, "argv" | "command">,
  candidates = deriveCommandMatchCandidates(input),
): string[] {
  const candidate = getMostDerivedCandidate(input, candidates);
  if (candidate.argv.length > 0) {
    return candidate.argv;
  }
  if (typeof input.command !== "string") {
    return [];
  }

  const sourceCommand = extractPipelineSourceCommand(stripLeadingCdPrefix(input.command));
  return sourceCommand ? tokenizeCommand(sourceCommand) : [];
}

export function isFileContentInspectionCommand(input: Pick<ToolExecutionInput, "argv" | "command">): boolean {
  const candidates = deriveCommandMatchCandidates(input);
  return isFileContentInspectionArgv(getInspectionArgv(input, candidates))
    || candidates.some((candidate) => isGhApiContentsDecodeCommand(candidate.command));
}

export function isPackageLockSummaryInspectionCommand(input: Pick<ToolExecutionInput, "argv" | "command">): boolean {
  const candidate = getMostDerivedCandidate(input);
  const file = candidate.argv[2];
  // Only the unformatted jq identity read is the legacy human summary entry point.
  return candidate.argv.length === 3
    && getCommandName(candidate.argv) === "jq"
    && candidate.argv[1] === "."
    && typeof file === "string"
    && file.split(/[/\\]/u).at(-1) === "package-lock.json"
    && !isCompoundShellCommand(stripLeadingCdPrefix(candidate.command ?? ""));
}

function isVerbatimRemoteInspectionCommand(command: string): boolean {
  const effectiveCommand = unwrapShellRunner({ command }) ?? command;
  const isSingleGhContentsDecode = isGhApiContentsDecodeCommand(effectiveCommand)
    && !hasSequentialShellCommands(effectiveCommand)
    && /^[^|]+\|\s*base64\s+(?:-[dD]\b|--decode\b)\s*$/u.test(effectiveCommand.trim());
  if (isSingleGhContentsDecode) {
    return true;
  }
  if (
    isCompoundShellCommand(stripLeadingCdPrefix(command))
    || isCompoundShellCommand(effectiveCommand)
  ) {
    return false;
  }

  const argv = getInspectionArgv({ command: effectiveCommand });
  return isPlutilFileContentArgv(argv)
    || isReadOnlyConfigInspectionArgv(argv)
    || isFileContentInspectionArgv(argv);
}

export function isVerbatimConfigInspectionCommand(input: Pick<ToolExecutionInput, "argv" | "command">): boolean {
  if (input.command && isCompoundShellCommand(stripLeadingCdPrefix(input.command))) {
    return false;
  }

  const candidates = deriveCommandMatchCandidates(input);
  return candidates.some((candidate) => (
    isPlutilFileContentArgv(candidate.argv)
    || isReadOnlyConfigInspectionArgv(candidate.argv)
  ))
    || candidates.some((candidate) => {
      const remoteCommand = getSshRemoteCommand(candidate.argv);
      return remoteCommand !== null
        && isVerbatimRemoteInspectionCommand(remoteCommand);
    });
}

export function isRepositoryInspectionCommand(input: Pick<ToolExecutionInput, "argv" | "command">): boolean {
  return isRepositoryInspectionArgv(getMostDerivedCandidate(input).argv);
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

export function normalizeEffectiveCommandSignature(command?: string): string | null {
  if (!command || command === "stdin" || command.startsWith("reduce:")) {
    return null;
  }

  const candidate = getMostDerivedCandidate({ command });
  const normalized = getCommandName(candidate.argv);
  return normalized || null;
}
