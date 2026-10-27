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
import { shouldRecordStats } from "../artifacts.js";
import { buildInspectionSummary } from "../reduce-inspection-summary.js";
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
  metadata?: Record<string, unknown>;
  inspectionPolicy?: InspectionCommandPolicy;
  /** @deprecated use inspectionPolicy instead. */
  skipInspectionCommands?: boolean;
  skipCommandNames?: readonly string[];
} & RewritePolicyOptions;

export type CompactBashResultKeepReason =
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
  const rawText = executionInput.combinedText ?? "";
  const inspectionSkipReason = getInspectionCommandSkipReason(command, policy);
  if (
    inspectionSkipReason === "file-content-inspection-command"
    && buildInspectionSummary(executionInput, rawText)
  ) {
    return null;
  }
  return inspectionSkipReason;
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

  const options: ReduceOptions = {
    ...(typeof input.cwd === "string" && input.cwd.trim() ? { cwd: input.cwd } : {}),
    ...(typeof input.maxInlineChars === "number" ? { maxInlineChars: input.maxInlineChars } : {}),
    ...(input.noOmit || (!input.allowOmit && readNoOmissionFromEnv()) ? { noOmit: true } : {}),
    recordStats: input.recordStats ?? shouldRecordStats(),
    ...(input.storeRaw ? { store: true } : {}),
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

  return {
    action: "rewrite",
    rawText,
    usedTrustedFullText,
    result,
  };
}
