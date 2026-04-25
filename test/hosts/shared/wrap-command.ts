import { isNodeExecutablePath, isTokenjuiceExecutablePath, parseShellWords } from "../../../src/hosts/shared/hook-command.js";

/**
 * Structured view of a command string produced by the PreToolUse wrap hosts
 * (cursor, codebuddy). Tests use this instead of byte-for-byte string equality
 * so that behavior-preserving refactors — different quoting, equivalent argv
 * layouts — do not break assertions.
 */
export type WrappedCommand = {
  /** Tokenized launcher portion — one entry for a bare `tokenjuice` binary, two for `node /abs/main.js`. */
  launcher: string[];
  /** The subcommand after the launcher. Always "wrap" on a correctly wrapped command. */
  subcommand: string;
  /** Extra wrap-level argv between the subcommand and the `--` separator (e.g. `--raw`, `--store`). */
  wrapArgs: string[];
  /** Shell interpreter tokenjuice will execute after `--`. */
  shellPath: string;
  /** Shell flag that introduces the inline payload (expected: `-lc` on POSIX). */
  shellFlag: string;
  /** The inner command string passed to the shell. This is what actually runs. */
  inner: string;
  /** Tokenized form of `inner` using the same POSIX rules the shell would apply. */
  innerArgv: string[];
  /** How many times `tokenjuice wrap` appears in the full argv (outer + inner). Must be 1 for a correctly wrapped command. */
  wrapDepth: number;
};

/**
 * Count occurrences of a tokenjuice `wrap` invocation in a flat argv. Matches
 * both shapes the hosts emit:
 *   `<tokenjuice> wrap`            — bare or absolute tokenjuice binary
 *   `<node> <something>.js wrap`   — local-build node dispatch
 */
function countWrapInvocations(argv: string[]): number {
  let count = 0;
  for (let index = 0; index < argv.length - 1; index += 1) {
    const token = argv[index];
    if (typeof token !== "string") {
      continue;
    }
    if (isTokenjuiceExecutablePath(token) && argv[index + 1] === "wrap") {
      count += 1;
      continue;
    }
    const next = argv[index + 1];
    if (
      isNodeExecutablePath(token)
      && typeof next === "string"
      && next.endsWith(".js")
      && argv[index + 2] === "wrap"
    ) {
      count += 1;
    }
  }
  return count;
}

/**
 * Parse a wrapped command string emitted by a PreToolUse wrap host.
 *
 * Throws an informative error rather than silently returning a bad shape, so
 * a test failure points at *what* is wrong (e.g. "subcommand was not 'wrap'")
 * rather than at a downstream structural assertion.
 */
export function parseWrappedCommand(raw: string): WrappedCommand {
  const argv = parseShellWords(raw);
  if (argv.length === 0) {
    throw new Error(`parseWrappedCommand: empty argv from ${JSON.stringify(raw)}`);
  }

  // Identify the launcher. Two supported shapes:
  //   a) `<tokenjuice-path> wrap ...`          → launcher = [argv[0]]
  //   b) `<node-path> <main.js> wrap ...`      → launcher = [argv[0], argv[1]]
  let launcherEnd: number;
  if (isTokenjuiceExecutablePath(argv[0] ?? "")) {
    launcherEnd = 1;
  } else if (isNodeExecutablePath(argv[0] ?? "") && typeof argv[1] === "string" && argv[1].endsWith(".js")) {
    launcherEnd = 2;
  } else {
    throw new Error(`parseWrappedCommand: first token is not a tokenjuice launcher or node+.js pair in ${JSON.stringify(raw)}`);
  }

  const launcher = argv.slice(0, launcherEnd);
  const subcommand = argv[launcherEnd];
  if (subcommand !== "wrap") {
    throw new Error(`parseWrappedCommand: expected 'wrap' subcommand, got ${JSON.stringify(subcommand)} in ${JSON.stringify(raw)}`);
  }

  // Everything between the subcommand and the `--` separator is wrap-level args.
  const separatorIndex = argv.indexOf("--", launcherEnd + 1);
  if (separatorIndex === -1) {
    throw new Error(`parseWrappedCommand: no '--' separator in ${JSON.stringify(raw)}`);
  }

  const wrapArgs = argv.slice(launcherEnd + 1, separatorIndex);
  const afterSeparator = argv.slice(separatorIndex + 1);
  if (afterSeparator.length < 3) {
    throw new Error(`parseWrappedCommand: expected at least <shell> <flag> <inner> after '--' in ${JSON.stringify(raw)}`);
  }

  const shellPath = afterSeparator[0] ?? "";
  const shellFlag = afterSeparator[1] ?? "";
  const innerTokens = afterSeparator.slice(2);
  if (innerTokens.length !== 1) {
    // The shell `-lc` flag takes exactly one argument (the command string).
    // Anything else means the wrap host assembled the argv in an unexpected
    // shape.
    throw new Error(`parseWrappedCommand: expected exactly one inner payload after ${shellFlag}, got ${innerTokens.length} in ${JSON.stringify(raw)}`);
  }

  const inner = innerTokens[0] ?? "";
  const innerArgv = parseShellWords(inner);

  // A correctly wrapped command has wrapDepth === 1: the outer invocation
  // counts, and nothing inside the shell payload should recursively re-wrap.
  const wrapDepth = countWrapInvocations(argv) + countWrapInvocations(innerArgv);

  return {
    launcher,
    subcommand,
    wrapArgs,
    shellPath,
    shellFlag,
    inner,
    innerArgv,
    wrapDepth,
  };
}
