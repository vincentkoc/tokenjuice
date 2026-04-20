import { basename } from "node:path";

import type { CommandMatchSource, ToolExecutionInput } from "../types.js";

export type CommandMatchCandidate = {
  argv: string[];
  source: CommandMatchSource;
  command?: string;
};

type ShellOperator = ";" | "\n" | "|" | "&&" | "||";

const FILE_CONTENT_INSPECTION_COMMANDS = new Set(["cat", "sed", "head", "tail", "nl", "bat", "batcat", "jq", "yq"]);
const REPO_INVENTORY_COMMANDS = new Set(["find", "fd", "fdfind", "ls", "tree"]);
const SETUP_WRAPPER_COMMANDS = new Set(["cd", "pwd", "set", "source", ".", "export", "unset", "trap"]);
const COMPOUND_SHELL_OPERATORS = new Set<ShellOperator>([";", "\n", "|", "&&", "||"]);
const SEQUENTIAL_SHELL_OPERATORS = new Set<ShellOperator>([";", "\n", "&&", "||"]);
const SHELL_COMMAND_LAUNCHERS = new Set(["bash", "sh", "zsh", "fish"]);
const ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=.*/u;

function getNormalizedArgv(input: Pick<ToolExecutionInput, "argv" | "command">): string[] {
  if (input.argv?.length) {
    return input.argv;
  }
  if (!input.command) {
    return [];
  }
  return tokenizeCommand(input.command);
}

<<<<<<< HEAD
export function getCommandName(argv: string[]): string | null {
=======
function getCommandText(input: Pick<ToolExecutionInput, "argv" | "command">): string {
  if (typeof input.command === "string") {
    return input.command.trim();
  }
  return getNormalizedArgv(input).join(" ");
}

function isShellCommandStringOption(token: string): boolean {
  return /^-[A-Za-z]*c[A-Za-z]*$/u.test(token);
}

function getNormalizedArgv0(argv: string[]): string | null {
>>>>>>> 5fad275 (fix(command): handle clustered shell wrappers and argv-only env prefixes)
  const first = argv[0];
  if (!first) {
    return null;
  }
  return basename(first.replace(/^["']|["']$/gu, ""));
}

function isShellCommandStringOption(token: string): boolean {
  return /^-[A-Za-z]*c[A-Za-z]*$/u.test(token);
}

function stripLeadingEnvAssignmentsFromCommand(command: string): string | null {
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

function getSourcePriority(source: CommandMatchSource): number {
  switch (source) {
    case "effective":
      return 2;
    case "shell-body":
      return 1;
    case "original":
    default:
      return 0;
  }
}

function isFileContentInspectionArgv(argv: string[]): boolean {
  const argv0 = getCommandName(argv);
  if (!argv0) {
    return false;
  }
  return FILE_CONTENT_INSPECTION_COMMANDS.has(argv0);
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

function buildCandidate(
  input: Pick<ToolExecutionInput, "argv" | "command">,
  source: CommandMatchSource,
): CommandMatchCandidate {
  return {
    ...(typeof input.command === "string" && input.command.trim()
      ? { command: input.command.trim() }
      : {}),
    argv: getNormalizedArgv(input),
    source,
  };
}

function dedupeCandidates(candidates: CommandMatchCandidate[]): CommandMatchCandidate[] {
  const deduped: CommandMatchCandidate[] = [];
  const indexes = new Map<string, number>();

  for (const candidate of candidates) {
    const key = `${candidate.command ?? ""}\0${candidate.argv.join("\0")}`;
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, deduped.length);
      deduped.push(candidate);
      continue;
    }

    const existing = deduped[existingIndex]!;
    if (getSourcePriority(candidate.source) > getSourcePriority(existing.source)) {
      deduped[existingIndex] = candidate;
    }
  }

  return deduped;
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

function isLikelyShellLauncher(launcherName: string, launcherPath?: string): boolean {
  const normalized = launcherName.toLowerCase().replace(/\.exe$/u, "");
  if (SHELL_COMMAND_LAUNCHERS.has(normalized)) {
    return true;
  }

  if (
    normalized === "dash"
    || normalized === "ksh"
    || normalized === "mksh"
    || normalized === "ash"
    || normalized === "csh"
    || normalized === "tcsh"
  ) {
    return true;
  }

  const pathNormalized = launcherPath?.toLowerCase().replace(/\\/gu, "/");
  if (!pathNormalized) {
    return false;
  }
  if (!pathNormalized.includes("/bin/")) {
    return false;
  }
  return (
    pathNormalized.endsWith("/bash")
    || pathNormalized.endsWith("/sh")
    || pathNormalized.endsWith("/zsh")
    || pathNormalized.endsWith("/fish")
    || pathNormalized.endsWith("/dash")
    || pathNormalized.endsWith("/ksh")
    || pathNormalized.endsWith("/mksh")
    || pathNormalized.endsWith("/ash")
    || pathNormalized.endsWith("/csh")
    || pathNormalized.endsWith("/tcsh")
    || pathNormalized.endsWith("/bash.exe")
    || pathNormalized.endsWith("/sh.exe")
    || pathNormalized.endsWith("/zsh.exe")
    || pathNormalized.endsWith("/fish.exe")
  );
}

export function unwrapShellRunner(input: Pick<ToolExecutionInput, "argv" | "command">): string | null {
  const argv = getNormalizedArgv(input);
  const argv0 = getCommandName(argv);
  if (!argv0 || !isLikelyShellLauncher(argv0, argv[0])) {
    return null;
  }

  for (let index = 1; index < argv.length - 1; index += 1) {
    if (!isShellCommandStringOption(argv[index] ?? "")) {
      continue;
    }

    const shellBody = argv[index + 1]?.trim();
    return shellBody ? shellBody : null;
  }

  return null;
}

export function stripLeadingEnvAssignments(argv: string[]): string[] {
  let index = 0;
  while (index < argv.length && ENV_ASSIGNMENT_PATTERN.test(argv[index] ?? "")) {
    index += 1;
  }
  return argv.slice(index);
}

export function isSetupWrapperSegment(argv: string[]): boolean {
  if (argv.length === 0) {
    return true;
  }

  const argv0 = getCommandName(argv);
  if (!argv0) {
    return true;
  }

  return SETUP_WRAPPER_COMMANDS.has(argv0);
}

function buildEffectiveCandidate(
  argv: string[],
  transformed: boolean,
  command?: string,
): CommandMatchCandidate | null {
  const strippedArgv = stripLeadingEnvAssignments(argv);
  if (strippedArgv.length === 0 || isSetupWrapperSegment(strippedArgv)) {
    return null;
  }

  if (!transformed && strippedArgv.length === argv.length) {
    return null;
  }

  return {
    ...(command ? { command } : {}),
    argv: strippedArgv,
    source: "effective",
  };
}

export function resolveEffectiveCommand(input: Pick<ToolExecutionInput, "argv" | "command">): CommandMatchCandidate | null {
  const command = typeof input.command === "string" ? input.command.trim() : "";
  const argv = getNormalizedArgv(input);

  if (!command && argv.length === 0) {
    return null;
  }

  if (!command) {
    return buildEffectiveCandidate(argv, false);
  }

  const segments = splitTopLevelCommandChain(command);
  const transformedByChain = segments.length > 1;

  for (const segment of segments) {
    const trimmedSegment = segment.trim();
    const segmentArgv = tokenizeCommand(trimmedSegment);
    if (segmentArgv.length === 0) {
      continue;
    }

    const effectiveCommand = stripLeadingEnvAssignmentsFromCommand(trimmedSegment) ?? undefined;
    const candidate = buildEffectiveCandidate(segmentArgv, transformedByChain, effectiveCommand);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export function deriveCommandMatchCandidates(
  input: Pick<ToolExecutionInput, "argv" | "command">,
): CommandMatchCandidate[] {
  const candidates: CommandMatchCandidate[] = [buildCandidate(input, "original")];

  const shellBody = unwrapShellRunner(input);
  if (shellBody) {
    candidates.push(buildCandidate({ command: shellBody }, "shell-body"));
  }

  const effective = resolveEffectiveCommand(shellBody ? { command: shellBody } : input);
  if (effective) {
    candidates.push(effective);
  }

  return dedupeCandidates(candidates);
}

function getMostDerivedCandidate(input: Pick<ToolExecutionInput, "argv" | "command">): CommandMatchCandidate {
  return deriveCommandMatchCandidates(input).reduce((best, candidate) => (
    getSourcePriority(candidate.source) >= getSourcePriority(best.source) ? candidate : best
  ));
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
  return isFileContentInspectionArgv(getMostDerivedCandidate(input).argv);
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

export function normalizeExecutionInput(input: ToolExecutionInput): ToolExecutionInput {
  const shellWrapped = unwrapShellRunner(input);
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
