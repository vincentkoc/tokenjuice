import {
  getCommandName,
  getEffectiveCommandArgv,
  stripLeadingCdPrefix,
  stripLeadingEnvAssignments,
  tokenizeCommand,
  unwrapShellRunner,
} from "../command.js";
import { getInspectionCommandSkipReason, getSafeRepositoryInventorySourceArgv } from "../inventory-safety.js";
import { readNoOmissionFromEnv } from "../env.js";
import { shouldRecordStats, storeArtifact } from "../artifacts.js";
import { reduceExecution } from "../reduce.js";
import { getCompactionSkipReason, type RewritePolicyOptions } from "./rewrite-policy.js";

import type { CompactResult, ReduceOptions, ToolExecutionInput } from "../../types.js";
import type { InspectionCommandPolicy, InspectionCommandSkipReason } from "../inventory-safety.js";

export type CompactBashResultInput = {
  source: "claude-code" | "cline" | "codex" | "command-code" | "copilot-agent" | "copilot-cli" | "droid" | "gemini-cli" | "grok-cli" | "kimi" | "mux" | "openclaw" | "openhands" | "opencode" | "pi" | "qwen-code";
  command: string;
  cwd?: string;
  visibleText: string;
  trustedFullText?: string;
  exitCode?: number;
  maxInlineChars?: number;
  noOmit?: boolean;
  allowOmit?: boolean;
  storeRaw?: boolean;
  recordStats?: boolean;
  storeDir?: string;
  metadata?: Record<string, unknown>;
  inspectionPolicy?: InspectionCommandPolicy;
  /** @deprecated use inspectionPolicy instead. */
  skipInspectionCommands?: boolean;
  skipCommandNames?: readonly string[];
} & RewritePolicyOptions;

type CompactBashResultKeepReason =
  | "raw-bypass"
  | "empty-output"
  | InspectionCommandSkipReason
  | "configured-command"
  | "unsupported"
  | "no-compaction"
  | "low-savings-compaction"
  | "generic-compound-command"
  | "generic-weak-compaction";

export type CompactBashResultOutput =
  | {
      action: "keep";
      reason: CompactBashResultKeepReason;
      rawText: string;
      usedTrustedFullText: boolean;
      result?: CompactResult;
    }
  | {
      action: "rewrite";
      rawText: string;
      usedTrustedFullText: boolean;
      result: CompactResult;
    };

function resolveInspectionPolicy(input: CompactBashResultInput): InspectionCommandPolicy {
  if (input.inspectionPolicy) {
    return input.inspectionPolicy;
  }
  return input.skipInspectionCommands ? "skip-all" : "compact-all";
}

export function getOutputAwareInspectionSkipReason(
  policy: InspectionCommandPolicy,
  executionInput: ToolExecutionInput,
): InspectionCommandSkipReason | null {
  const command = executionInput.command ?? "";
  return getInspectionCommandSkipReason(command, policy);
}

const SIMPLE_COMMAND_WRAPPERS = new Set(["nohup", "builtin", "exec", "noglob", "nocorrect"]);

function getWrappedCommandArgv(argv: string[]): string[] | null {
  const wrapper = getCommandName(argv);
  if (wrapper && SIMPLE_COMMAND_WRAPPERS.has(wrapper)) {
    return argv.slice(1);
  }
  if (wrapper === "uv" && argv[1] === "run") {
    return argv.slice(2);
  }
  if (wrapper === "command") {
    let commandIndex = 1;
    while (commandIndex < argv.length) {
      const arg = argv[commandIndex];
      if (arg === "-v" || arg === "-V") {
        return null;
      }
      if (arg === "-p") {
        commandIndex += 1;
        continue;
      }
      if (arg === "--") {
        commandIndex += 1;
      }
      break;
    }
    return argv.slice(commandIndex);
  }

  let index = 1;
  if (wrapper === "timeout") {
    while (index < argv.length) {
      const arg = argv[index] ?? "";
      if (["-s", "-k", "--signal", "--kill-after"].includes(arg)) {
        index += 2;
      } else if (
        ["--preserve-status", "--foreground", "-v", "--verbose"].includes(arg)
        || (arg.length > 2 && (arg.startsWith("-s") || arg.startsWith("-k")))
        || arg.startsWith("--signal=")
        || arg.startsWith("--kill-after=")
      ) {
        index += 1;
      } else if (arg === "--") {
        return index + 1 < argv.length ? argv.slice(index + 2) : null;
      } else {
        return argv.slice(index + 1);
      }
    }
    return null;
  }

  if (wrapper === "nice" || wrapper === "time") {
    const valueOptions = wrapper === "nice"
      ? ["-n", "--adjustment"]
      : ["-f", "-o", "--format", "--output"];
    const flagOptions = wrapper === "nice"
      ? []
      : ["-p", "-a", "-v", "--append", "--verbose", "--portability", "--quiet"];
    while (index < argv.length) {
      const arg = argv[index] ?? "";
      if (valueOptions.includes(arg)) {
        index += 2;
      } else if (
        flagOptions.includes(arg)
        || wrapper === "nice" && (/^-\d+$/u.test(arg) || arg.startsWith("-n") && arg.length > 2 || arg.startsWith("--adjustment="))
        || wrapper === "time" && ((arg.startsWith("-f") || arg.startsWith("-o")) && arg.length > 2 || arg.startsWith("--format=") || arg.startsWith("--output="))
      ) {
        index += 1;
      } else if (arg === "--") {
        return argv.slice(index + 1);
      } else {
        return argv.slice(index);
      }
    }
  }

  return null;
}


const WINDOWS_EXECUTABLE_SUFFIXES = [".exe", ".cmd", ".bat", ".com"];

function normalizeSkipCommandName(name: string): string {
  let normalized = name.trim().toLowerCase();
  for (const suffix of WINDOWS_EXECUTABLE_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  return normalized;
}

export function shouldSkipCommand(command: string, skipCommandNames?: readonly string[]): boolean {
  if (!skipCommandNames?.length) {
    return false;
  }

  let candidate = command;
  let argv: string[] = [];
  for (let iteration = 0; iteration < 10; iteration += 1) {
    if (candidate) {
      candidate = stripLeadingCdPrefix(candidate);
      const effectiveArgv = getEffectiveCommandArgv({ command: candidate });
      argv = effectiveArgv.length > 0
        ? effectiveArgv
        : stripLeadingEnvAssignments(tokenizeCommand(candidate));
      candidate = "";
    }
    const shellBody = unwrapShellRunner({ argv });
    if (shellBody) {
      candidate = shellBody;
      continue;
    }
    const commandName = getCommandName(argv);
    if (
      commandName
      && skipCommandNames.some(
        (skipName) => normalizeSkipCommandName(skipName) === normalizeSkipCommandName(commandName),
      )
    ) {
      return true;
    }
    const wrappedArgv = getWrappedCommandArgv(argv);
    if (!wrappedArgv?.length) {
      return false;
    }
    argv = wrappedArgv;
  }

  return false;
}

function commandRequestsRawBypass(command: string): boolean {
  let argv = getEffectiveCommandArgv({ command: stripLeadingCdPrefix(command) });
  for (let depth = 0; depth < 16; depth++) {
    const shellBody = unwrapShellRunner({ argv });
    if (shellBody) {
      argv = getEffectiveCommandArgv({ command: shellBody });
      continue;
    }
    const name = getCommandName(argv)?.toLowerCase();
    const wrapIndex = name && /^tokenjuice(?:\.(?:exe|cmd|bat))?$/u.test(name)
      ? 1
      : name && /^node(?:\.exe)?$/u.test(name) && argv[1]?.endsWith(".js") && argv[1].includes("tokenjuice")
        ? 2
        : -1;
    if (wrapIndex !== -1 && argv[wrapIndex] === "wrap") {
      const end = argv.indexOf("--", wrapIndex + 1);
      if (end === -1) return false;
      const options = argv.slice(wrapIndex + 1, end);
      return options.includes("--raw") || options.includes("--full");
    }
    const wrapped = getWrappedCommandArgv(argv);
    if (!wrapped?.length) return false;
    argv = wrapped;
  }
  return false;
}

export async function compactBashResult(input: CompactBashResultInput): Promise<CompactBashResultOutput> {
  const command = input.command.trim();
  if (!command) {
    return {
      action: "keep",
      reason: "unsupported",
      rawText: "",
      usedTrustedFullText: false,
    };
  }

  const rawText = input.trustedFullText ?? input.visibleText;
  const usedTrustedFullText = typeof input.trustedFullText === "string";
  if (!rawText.trim()) {
    return {
      action: "keep",
      reason: "empty-output",
      rawText,
      usedTrustedFullText,
    };
  }

  if (commandRequestsRawBypass(command)) {
    return { action: "keep", reason: "raw-bypass", rawText, usedTrustedFullText };
  }

  const safeInventoryArgv = getSafeRepositoryInventorySourceArgv(command);
  const executionInput: ToolExecutionInput = {
    toolName: "exec",
    command,
    combinedText: rawText,
    ...(safeInventoryArgv ? { argv: safeInventoryArgv } : {}),
    ...(typeof input.cwd === "string" && input.cwd.trim() ? { cwd: input.cwd } : {}),
    ...(typeof input.exitCode === "number" ? { exitCode: input.exitCode } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  if (shouldSkipCommand(command, input.skipCommandNames)) {
    return {
      action: "keep",
      reason: "configured-command",
      rawText,
      usedTrustedFullText,
    };
  }

  const inspectionSkipReason = getOutputAwareInspectionSkipReason(resolveInspectionPolicy(input), executionInput);
  if (inspectionSkipReason) {
    return {
      action: "keep",
      reason: inspectionSkipReason,
      rawText,
      usedTrustedFullText,
    };
  }

  const storeDir = typeof input.storeDir === "string" && input.storeDir.trim()
    ? input.storeDir.trim()
    : undefined;
  const recordStats = input.recordStats ?? shouldRecordStats();
  const options: ReduceOptions = {
    ...(typeof input.cwd === "string" && input.cwd.trim() ? { cwd: input.cwd } : {}),
    ...(typeof input.maxInlineChars === "number" ? { maxInlineChars: input.maxInlineChars } : {}),
    ...(input.noOmit || (!input.allowOmit && readNoOmissionFromEnv()) ? { noOmit: true } : {}),
    // store:true inside reduceExecution writes before this function can keep the output, so a
    // storeRaw caller stores below, only after the rewrite decision. A keep from a storeRaw
    // caller then leaves no raw file and no stats entry: recordStats stays off for that call
    // as well. Callers without storeRaw keep the stats policy unchanged: an explicit
    // input.recordStats wins, otherwise stats are on unless TOKENJUICE_STATS disables them.
    recordStats: input.storeRaw ? false : recordStats,
    ...(storeDir ? { storeDir } : {}),
  };

  const result = await reduceExecution(executionInput, options);
  const skipReason = getCompactionSkipReason(command, rawText, result, input);
  if (skipReason) {
    return {
      action: "keep",
      reason: skipReason,
      rawText,
      usedTrustedFullText,
      result,
    };
  }

  if (!input.storeRaw) {
    return {
      action: "rewrite",
      rawText,
      usedTrustedFullText,
      result,
    };
  }

  const rawRef = await storeArtifact(
    {
      input: executionInput,
      rawText,
      classification: result.classification,
      stats: result.stats,
      recordStats,
    },
    storeDir,
  );

  return {
    action: "rewrite",
    rawText,
    usedTrustedFullText,
    result: {
      ...result,
      rawRef,
    },
  };
}
