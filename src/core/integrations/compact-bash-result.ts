import { getInspectionCommandSkipReason } from "../inventory-safety.js";
import { reduceExecution } from "../reduce.js";
import { getCompactionSkipReason, type RewritePolicyOptions } from "./rewrite-policy.js";

import type { CompactResult, ReduceOptions, ToolExecutionInput } from "../../types.js";
import type { InspectionCommandPolicy, InspectionCommandSkipReason } from "../inventory-safety.js";

export type CompactBashResultInput = {
  source: "claude-code" | "codex" | "pi";
  command: string;
  cwd?: string;
  visibleText: string;
  trustedFullText?: string;
  exitCode?: number;
  maxInlineChars?: number;
  storeRaw?: boolean;
  metadata?: Record<string, unknown>;
  inspectionPolicy?: InspectionCommandPolicy;
  /** @deprecated use inspectionPolicy instead. */
  skipInspectionCommands?: boolean;
} & RewritePolicyOptions;

export type CompactBashResultKeepReason =
  | "empty-output"
  | InspectionCommandSkipReason
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

  const inspectionSkipReason = getInspectionCommandSkipReason(command, resolveInspectionPolicy(input));
  if (inspectionSkipReason) {
    return {
      action: "keep",
      reason: inspectionSkipReason,
      rawText,
      usedTrustedFullText,
    };
  }

  const executionInput: ToolExecutionInput = {
    toolName: "exec",
    command,
    combinedText: rawText,
    ...(typeof input.cwd === "string" && input.cwd.trim() ? { cwd: input.cwd } : {}),
    ...(typeof input.exitCode === "number" ? { exitCode: input.exitCode } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
  const options: ReduceOptions = {
    ...(typeof input.cwd === "string" && input.cwd.trim() ? { cwd: input.cwd } : {}),
    ...(typeof input.maxInlineChars === "number" ? { maxInlineChars: input.maxInlineChars } : {}),
    recordStats: true,
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
