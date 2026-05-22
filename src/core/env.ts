const NO_OMISSION_ENV = "TOKENJUICE_NO_OMISSION";
const NO_OMISSION_TRUTHY_VALUES = new Set(["1", "true", "TRUE", "yes", "YES"]);

export function readNoOmissionFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return NO_OMISSION_TRUTHY_VALUES.has(env[NO_OMISSION_ENV] ?? "");
}
