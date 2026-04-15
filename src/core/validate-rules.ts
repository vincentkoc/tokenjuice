import type { JsonRule, RuleCounter, RuleFailure, RuleFilters, RuleMatch, RuleSummarize, RuleTransforms } from "../types.js";

type ValidationResult = {
  ok: true;
} | {
  ok: false;
  errors: string[];
};

function hasNulByte(value: string): boolean {
  return value.includes("\0");
}

function validateSafeString(value: unknown, path: string, errors: string[], { allowEmpty = false }: { allowEmpty?: boolean } = {}): void {
  if (typeof value !== "string") {
    errors.push(`${path} must be a string`);
    return;
  }

  if (!allowEmpty && value.length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }

  if (hasNulByte(value)) {
    errors.push(`${path} must not contain NUL bytes`);
  }
}

function validatePositiveInteger(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    errors.push(`${path} must be a non-negative integer`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function validateMatch(value: unknown, path: string): string[] {
  if (!isRecord(value)) {
    return [`${path} must be an object`];
  }

  const errors: string[] = [];
  if ("toolNames" in value && !isStringArray(value.toolNames)) {
    errors.push(`${path}.toolNames must be an array of strings`);
  }
  if ("argv0" in value && !isStringArray(value.argv0)) {
    errors.push(`${path}.argv0 must be an array of strings`);
  }
  if ("commandIncludes" in value && !isStringArray(value.commandIncludes)) {
    errors.push(`${path}.commandIncludes must be an array of strings`);
  }
  if ("argvIncludes" in value) {
    if (!Array.isArray(value.argvIncludes) || !value.argvIncludes.every(isStringArray)) {
      errors.push(`${path}.argvIncludes must be an array of string arrays`);
    }
  }
  return errors;
}

function validateCounter(value: unknown, path: string): string[] {
  if (!isRecord(value)) {
    return [`${path} must be an object`];
  }

  const errors: string[] = [];
  validateSafeString(value.name, `${path}.name`, errors);
  validateSafeString(value.pattern, `${path}.pattern`, errors);
  if ("flags" in value) {
    validateSafeString(value.flags, `${path}.flags`, errors, { allowEmpty: true });
  }
  return errors;
}

function validateOptionalStringArrayObject(
  value: unknown,
  path: string,
  keys: string[],
): string[] {
  if (!isRecord(value)) {
    return [`${path} must be an object`];
  }

  const errors: string[] = [];
  for (const key of keys) {
    if (key in value && !isStringArray(value[key])) {
      errors.push(`${path}.${key} must be an array of strings`);
    }
  }
  return errors;
}

function validateOptionalNumberObject(value: unknown, path: string, keys: string[]): string[] {
  if (!isRecord(value)) {
    return [`${path} must be an object`];
  }

  const errors: string[] = [];
  for (const key of keys) {
    if (key in value) {
      validatePositiveInteger(value[key], `${path}.${key}`, errors);
    }
  }
  return errors;
}

function validateOptionalBooleanObject(value: unknown, path: string, keys: string[]): string[] {
  if (!isRecord(value)) {
    return [`${path} must be an object`];
  }

  const errors: string[] = [];
  for (const key of keys) {
    if (key in value && typeof value[key] !== "boolean") {
      errors.push(`${path}.${key} must be a boolean`);
    }
  }
  return errors;
}

export function validateRule(raw: unknown): ValidationResult {
  if (!isRecord(raw)) {
    return {
      ok: false,
      errors: ["rule must be an object"],
    };
  }

  const errors: string[] = [];
  validateSafeString(raw.id, "id", errors);
  validateSafeString(raw.family, "family", errors);
  if ("description" in raw) {
    validateSafeString(raw.description, "description", errors, { allowEmpty: true });
  }
  if ("priority" in raw && (typeof raw.priority !== "number" || !Number.isFinite(raw.priority))) {
    errors.push("priority must be a finite number");
  }
  if (!("match" in raw)) {
    errors.push("match is required");
  } else {
    errors.push(...validateMatch(raw.match, "match"));
  }
  if ("filters" in raw) {
    errors.push(...validateOptionalStringArrayObject(raw.filters, "filters", ["skipPatterns", "keepPatterns"]));
  }
  if ("transforms" in raw) {
    errors.push(...validateOptionalBooleanObject(raw.transforms, "transforms", [
      "stripAnsi",
      "dedupeAdjacent",
      "trimEmptyEdges",
    ]));
  }
  if ("summarize" in raw) {
    errors.push(...validateOptionalNumberObject(raw.summarize, "summarize", ["head", "tail"]));
  }
  if ("failure" in raw) {
    errors.push(...validateOptionalBooleanObject(raw.failure, "failure", ["preserveOnFailure"]));
    errors.push(...validateOptionalNumberObject(raw.failure, "failure", ["head", "tail"]));
  }
  if ("counters" in raw) {
    if (!Array.isArray(raw.counters)) {
      errors.push("counters must be an array");
    } else {
      raw.counters.forEach((counter, index) => {
        errors.push(...validateCounter(counter, `counters[${index}]`));
      });
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return { ok: true };
}

export function assertValidRule(raw: unknown): asserts raw is JsonRule {
  const validation = validateRule(raw);
  if (!validation.ok) {
    throw new Error(`invalid rule:\n- ${validation.errors.join("\n- ")}`);
  }
}

export type { RuleCounter, RuleFailure, RuleFilters, RuleMatch, RuleSummarize, RuleTransforms };
