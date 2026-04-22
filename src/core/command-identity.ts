import { basename } from "node:path";

import type { ToolExecutionInput } from "../types.js";

import { deriveCommandMatchCandidates, getSourcePriority, type CommandMatchCandidate } from "./command-match.js";
import { stripLeadingCdPrefix, tokenizeCommand } from "./command-shell.js";

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

export function isFileContentInspectionArgv(argv: string[]): boolean {
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

export function isRepositoryInspectionArgv(argv: string[]): boolean {
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

function getMostDerivedCandidate(input: Pick<ToolExecutionInput, "argv" | "command">): CommandMatchCandidate {
  return deriveCommandMatchCandidates(input).reduce((best, candidate) => (
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

function getInspectionArgv(input: Pick<ToolExecutionInput, "argv" | "command">): string[] {
  const candidate = getMostDerivedCandidate(input);
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
  return isFileContentInspectionArgv(getInspectionArgv(input))
    || deriveCommandMatchCandidates(input).some((candidate) => isGhApiContentsDecodeCommand(candidate.command));
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
