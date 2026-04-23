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

const SETUP_WRAPPER_COMMANDS = new Set(["cd", "pwd", "set", "source", ".", "export", "unset", "trap"]);
const SHELL_COMMAND_LAUNCHERS = new Set(["bash", "sh", "zsh", "fish"]);
const ENV_FLAGS_WITH_VALUES = new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]);
const ENV_FLAGS = new Set(["-i", "--ignore-environment", "-0", "--null", "--debug"]);

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

export function isSetupWrapperSegment(argv: string[]): boolean {
  if (argv.length === 0) {
    return true;
  }

  const argv0 = getArgv0Name(argv);
  if (!argv0) {
    return true;
  }

  return SETUP_WRAPPER_COMMANDS.has(argv0);
}

export function buildEffectiveCandidate(
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
