import type { ReduceJsonRequest, ReduceOptions, ToolExecutionInput } from "../types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateOptionalString(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string") {
    errors.push(`${path} must be a string`);
    return;
  }

  if (value.includes("\0")) {
    errors.push(`${path} must not contain NUL bytes`);
  }
}

function validateOptionalNumber(value: unknown, path: string, errors: string[]): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    errors.push(`${path} must be a finite number`);
  }
}

function validateOptionalBoolean(value: unknown, path: string, errors: string[]): void {
  if (value !== undefined && typeof value !== "boolean") {
    errors.push(`${path} must be a boolean`);
  }
}

function validateOptionalStringArray(value: unknown, path: string, errors: string[]): void {
  if (
    value !== undefined
    && (
      !Array.isArray(value)
      || !value.every((entry) => typeof entry === "string" && !entry.includes("\0"))
    )
  ) {
    errors.push(`${path} must be an array of strings`);
  }
}

function validateOptionalRecord(value: unknown, path: string, errors: string[]): void {
  if (value !== undefined && !isRecord(value)) {
    errors.push(`${path} must be an object`);
  }
}

function validateToolExecutionInput(raw: unknown): { ok: true; value: ToolExecutionInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return {
      ok: false,
      errors: ["input must be an object"],
    };
  }

  if (typeof raw.toolName !== "string" || raw.toolName.length === 0) {
    errors.push("input.toolName must be a non-empty string");
  }

  validateOptionalString(raw.toolCallId, "input.toolCallId", errors);
  validateOptionalString(raw.runId, "input.runId", errors);
  validateOptionalString(raw.command, "input.command", errors);
  validateOptionalStringArray(raw.argv, "input.argv", errors);
  validateOptionalRecord(raw.args, "input.args", errors);
  validateOptionalString(raw.cwd, "input.cwd", errors);
  validateOptionalBoolean(raw.partial, "input.partial", errors);
  validateOptionalString(raw.stdout, "input.stdout", errors);
  validateOptionalString(raw.stderr, "input.stderr", errors);
  validateOptionalString(raw.combinedText, "input.combinedText", errors);
  validateOptionalNumber(raw.exitCode, "input.exitCode", errors);
  validateOptionalNumber(raw.startedAt, "input.startedAt", errors);
  validateOptionalNumber(raw.finishedAt, "input.finishedAt", errors);
  validateOptionalNumber(raw.durationMs, "input.durationMs", errors);
  validateOptionalRecord(raw.metadata, "input.metadata", errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: raw as ToolExecutionInput,
  };
}

function validateReduceOptions(raw: unknown): { ok: true; value: ReduceOptions } | { ok: false; errors: string[] } {
  if (raw === undefined) {
    return {
      ok: true,
      value: {},
    };
  }

  if (!isRecord(raw)) {
    return {
      ok: false,
      errors: ["options must be an object"],
    };
  }

  const errors: string[] = [];
  validateOptionalString(raw.classifier, "options.classifier", errors);
  validateOptionalNumber(raw.maxInlineChars, "options.maxInlineChars", errors);
  validateOptionalBoolean(raw.store, "options.store", errors);
  validateOptionalString(raw.storeDir, "options.storeDir", errors);
  validateOptionalString(raw.cwd, "options.cwd", errors);

  if (typeof raw.maxInlineChars === "number" && (!Number.isInteger(raw.maxInlineChars) || raw.maxInlineChars <= 0)) {
    errors.push("options.maxInlineChars must be a positive integer");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: raw as ReduceOptions,
  };
}

export function parseReduceJsonRequest(raw: unknown): ReduceJsonRequest {
  if (!isRecord(raw)) {
    throw new Error("reduce-json payload must be an object");
  }

  const directInput = validateToolExecutionInput(raw);
  if (directInput.ok) {
    return {
      input: directInput.value,
      options: {},
    };
  }

  const input = validateToolExecutionInput(raw.input);
  const options = validateReduceOptions(raw.options);
  const errors = [
    ...(!input.ok ? input.errors : []),
    ...(!options.ok ? options.errors : []),
  ];

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  if (!input.ok || !options.ok) {
    throw new Error("reduce-json request validation failed");
  }

  return {
    input: input.value,
    options: options.value,
  };
}
