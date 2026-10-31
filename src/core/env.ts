const NO_OMISSION_ENV = "TOKENJUICE_NO_OMISSION";
const NO_OMISSION_TRUTHY_VALUES = new Set(["1", "true", "TRUE", "yes", "YES"]);

export function readNoOmissionFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return NO_OMISSION_TRUTHY_VALUES.has(env[NO_OMISSION_ENV] ?? "");
}

export function readPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
