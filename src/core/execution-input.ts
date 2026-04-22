import type { ToolExecutionInput } from "../types.js";

import { resolveEffectiveCommand, unwrapShellRunner } from "./command-match.js";
import { isCompoundShellCommand, stripLeadingCdPrefix, tokenizeCommand } from "./command-shell.js";

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

    const argv = resolveEffectiveCommand({ command: effectiveCommand })?.argv ?? tokenizeCommand(effectiveCommand);
    if (argv.length === 0) {
      return {
        ...input,
        command: effectiveCommand,
      };
    }

    return {
      ...input,
      command: argv.join(" "),
      argv,
    };
  }

  const effective = resolveEffectiveCommand(input);
  if (effective?.argv.length) {
    return {
      ...input,
      ...(effective.command ? { command: effective.command } : {}),
      argv: effective.argv,
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
    command: argv.join(" "),
    argv,
  };
}
