import type { CommandMatchSource, ToolExecutionInput } from "../types.js";

import {
  ENV_ASSIGNMENT_PATTERN,
  isCompoundShellCommand,
  splitTopLevelCommandChain,
  stripLeadingEnvAssignmentsFromCommand,
  tokenizeCommand,
} from "./command-shell.js";

export type CommandMatchCandidate = {
  argv: string[];
  source: CommandMatchSource;
  command?: string;
};

const SETUP_WRAPPER_COMMANDS = new Set(["cd", "pwd", "set", "source", ".", "export", "unset", "trap", "true"]);
const SHELL_COMMAND_LAUNCHERS = new Set(["bash", "sh", "zsh", "fish"]);
const ENV_FLAGS_WITH_VALUES = new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]);
const ENV_FLAGS = new Set(["-i", "--ignore-environment", "-0", "--null", "--debug"]);

function splitTopLevelOrChain(command: string): string[] {
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

    if (char === "|" && trimmed[index + 1] === "|") {
      const segment = current.trim();
      if (segment) {
        segments.push(segment);
      }
      current = "";
      index += 1;
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

function isFullyParenthesized(command: string): boolean {
  if (!command.startsWith("(") || !command.endsWith(")")) {
    return false;
  }

  let quote: "'" | "\"" | null = null;
  let escaping = false;
  let depth = 0;

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
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      if (depth === 0 && index < command.length - 1) {
        return false;
      }
    }
  }

  return depth === 0 && !quote && !escaping;
}

function stripSetupShellDecorators(command: string): string {
  let trimmed = command.trim();
  while (isFullyParenthesized(trimmed)) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getArgv0Name(argv: string[]): string | null {
  const first = argv[0];
  if (!first) {
    return null;
  }

  const normalized = first.replace(/^["']|["']$/gu, "");
  const slashIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}

function getNormalizedArgv(input: Pick<ToolExecutionInput, "argv" | "command">): string[] {
  if (input.argv?.length) {
    return input.argv;
  }
  if (!input.command) {
    return [];
  }
  return tokenizeCommand(input.command);
}

function isShellCommandStringOption(token: string): boolean {
  return /^-[A-Za-z]*c[A-Za-z]*$/u.test(token);
}

export function getSourcePriority(source: CommandMatchSource): number {
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

export function getCandidateArgv(input: Pick<ToolExecutionInput, "argv" | "command">): string[] {
  if (input.argv?.length) {
    return input.argv;
  }

  const command = typeof input.command === "string" ? input.command.trim() : "";
  if (!command || isCompoundShellCommand(command)) {
    return [];
  }

  return tokenizeCommand(command);
}

function buildCandidate(
  input: Pick<ToolExecutionInput, "argv" | "command">,
  source: CommandMatchSource,
): CommandMatchCandidate {
  return {
    ...(typeof input.command === "string" && input.command.trim()
      ? { command: input.command.trim() }
      : {}),
    argv: getCandidateArgv(input),
    source,
  };
}

export function dedupeCandidates(candidates: CommandMatchCandidate[]): CommandMatchCandidate[] {
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
  const argv0 = getArgv0Name(argv);
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

  if (getArgv0Name(argv.slice(index)) !== "env") {
    return argv.slice(index);
  }

  index += 1;
  while (index < argv.length) {
    const arg = argv[index] ?? "";
    if (arg === "--") {
      index += 1;
      break;
    }
    if (ENV_ASSIGNMENT_PATTERN.test(arg)) {
      index += 1;
      continue;
    }
    if (ENV_FLAGS.has(arg)) {
      index += 1;
      continue;
    }
    if (ENV_FLAGS_WITH_VALUES.has(arg)) {
      index += 2;
      continue;
    }
    if (arg.startsWith("--unset=") || arg.startsWith("--chdir=") || arg.startsWith("--split-string=")) {
      index += 1;
      continue;
    }
    break;
  }

  return argv.slice(index);
}

function isSimpleSetupWrapperSegment(argv: string[]): boolean {
  if (argv.length === 0) {
    return true;
  }

  const argv0 = getArgv0Name(argv);
  if (!argv0) {
    return true;
  }

  if (isQuietCommandProbe(argv)) {
    return true;
  }
  if (argv0 === "tt" && (argv[1] === "title" || argv[1] === "sync")) {
    return true;
  }
  if (argv0 === "tmux" && argv[1] === "select-pane" && argv.includes("-T")) {
    return true;
  }

  return SETUP_WRAPPER_COMMANDS.has(argv0);
}

function isQuietCommandProbe(argv: string[]): boolean {
  const argv0 = getArgv0Name(argv);
  return argv0 === "command"
    && (argv[1] === "-v" || argv[1] === "-V")
    && argv.slice(2).some(redirectsStdout);
}

function redirectsStdout(arg: string): boolean {
  return arg === ">"
    || arg === ">>"
    || arg === "1>"
    || arg === "1>>"
    || arg === "&>"
    || arg === "&>>"
    || /^(?:>|>>|1>|1>>|&>|&>>)\S/u.test(arg);
}

function isFailFastSetupGuard(argv: string[]): boolean {
  const argv0 = getArgv0Name(argv);
  return argv0 === "exit" || argv0 === "return";
}

export function isSetupWrapperSegment(argv: string[], command?: string): boolean {
  const normalizedCommand = command ? stripSetupShellDecorators(command) : "";
  const orSegments = normalizedCommand ? splitTopLevelOrChain(normalizedCommand) : [];
  if (orSegments.length > 1) {
    return orSegments.every((segment) => {
      const segmentArgv = tokenizeCommand(stripSetupShellDecorators(segment));
      return isSimpleSetupWrapperSegment(segmentArgv) || isFailFastSetupGuard(segmentArgv);
    });
  }

  return isSimpleSetupWrapperSegment(normalizedCommand ? tokenizeCommand(normalizedCommand) : argv);
}

function isSetupWrapperCommand(command: string): boolean {
  const segments = splitTopLevelCommandChain(command);
  return segments.length > 0
    && segments.every((segment) => isSetupWrapperSegment(tokenizeCommand(segment), segment));
}

function isSingleSetupConditionSegment(argv: string[], command: string): boolean {
  const argv0 = getArgv0Name(argv);
  return argv0 === "[" || argv0 === "[[" || argv0 === "test" || isSetupWrapperSegment(argv, command);
}

function isSetupConditionSegment(argv: string[], command: string): boolean {
  const normalizedCommand = command ? stripSetupShellDecorators(command) : "";
  const orSegments = normalizedCommand ? splitTopLevelOrChain(normalizedCommand) : [];
  if (orSegments.length > 1) {
    return orSegments.every((segment) => {
      const segmentCommand = stripSetupShellDecorators(segment);
      const segmentArgv = tokenizeCommand(segmentCommand);
      return isSingleSetupConditionSegment(segmentArgv, segmentCommand) || isFailFastSetupGuard(segmentArgv);
    });
  }

  return isSingleSetupConditionSegment(normalizedCommand ? tokenizeCommand(normalizedCommand) : argv, normalizedCommand || command);
}

function isSetupConditionCommand(command: string): boolean {
  const segments = splitTopLevelCommandChain(command);
  return segments.length > 0
    && segments.every((segment) => isSetupConditionSegment(tokenizeCommand(segment), segment));
}

function stripLeadingSetupIfBlock(command: string): string | null {
  const match = /^if\s+([\s\S]+?)(?:;|\n)\s*then\s+([\s\S]+?)(?:(?:;|\n)\s*else\s+([\s\S]+?))?(?:;|\n)\s*fi\s*(?:;|&&|\n)\s*(.+)$/u.exec(command.trim());
  if (!match) {
    return null;
  }

  const [, condition, thenCommand, elseCommand, tail] = match;
  if (!condition || !thenCommand || !tail) {
    return null;
  }
  if (!isSetupConditionCommand(condition) || !isSetupWrapperCommand(thenCommand)) {
    return null;
  }
  if (elseCommand && !isSetupWrapperCommand(elseCommand)) {
    return null;
  }

  return tail.trim() || null;
}

function stripLeadingSetupSegment(command: string): string | null {
  const trimmed = command.trim();
  const segments = splitTopLevelCommandChain(trimmed);
  const first = segments[0]?.trim();
  if (!first || segments.length < 2 || !isSetupWrapperSegment(tokenizeCommand(first), first)) {
    return null;
  }
  if (!trimmed.startsWith(first)) {
    return null;
  }

  let index = first.length;
  while (/\s/u.test(trimmed[index] ?? "")) {
    index += 1;
  }
  if (trimmed[index] === "&" && trimmed[index + 1] === "&") {
    index += 2;
  } else if (trimmed[index] === ";" || trimmed[index] === "\n") {
    index += 1;
  } else {
    return null;
  }

  return trimmed.slice(index).trim() || null;
}

export function buildEffectiveCandidate(
  argv: string[],
  transformed: boolean,
  command?: string,
): CommandMatchCandidate | null {
  const strippedArgv = stripLeadingEnvAssignments(argv);
  if (strippedArgv.length === 0 || isSetupWrapperSegment(strippedArgv, command)) {
    return null;
  }

  if (!transformed && strippedArgv.length === argv.length) {
    return null;
  }

  return {
    ...(command ? { command: strippedArgv.length === argv.length ? command : strippedArgv.join(" ") } : {}),
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

  let effectiveCommand = command;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const setupIfTail = stripLeadingSetupIfBlock(effectiveCommand);
    const setupSegmentTail = setupIfTail ?? stripLeadingSetupSegment(effectiveCommand);
    if (!setupSegmentTail) {
      break;
    }
    effectiveCommand = setupSegmentTail;
  }
  if (effectiveCommand !== command) {
    return resolveEffectiveCommand({ command: effectiveCommand })
      ?? buildEffectiveCandidate(tokenizeCommand(effectiveCommand), true, effectiveCommand);
  }

  const segments = splitTopLevelCommandChain(effectiveCommand);
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

export function getEffectiveCommandArgv(input: Pick<ToolExecutionInput, "argv" | "command">): string[] {
  return resolveEffectiveCommand(input)?.argv ?? getCandidateArgv(input);
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
