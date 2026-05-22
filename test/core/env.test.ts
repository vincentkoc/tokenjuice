import { afterEach, describe, expect, it } from "vitest";

import { readNoOmissionFromEnv } from "../../src/core/env.js";

const NO_OMISSION_ENV = "TOKENJUICE_NO_OMISSION";
const originalNoOmissionEnv = process.env[NO_OMISSION_ENV];

afterEach(() => {
  if (originalNoOmissionEnv === undefined) {
    delete process.env[NO_OMISSION_ENV];
    return;
  }
  process.env[NO_OMISSION_ENV] = originalNoOmissionEnv;
});

describe("readNoOmissionFromEnv", () => {
  it.each(["1", "true", "TRUE", "yes", "YES"])("returns true for %s", (value) => {
    process.env[NO_OMISSION_ENV] = value;

    expect(readNoOmissionFromEnv()).toBe(true);
  });

  it.each(["", "0", "false", "True", "on"])("returns false for %s", (value) => {
    process.env[NO_OMISSION_ENV] = value;

    expect(readNoOmissionFromEnv()).toBe(false);
  });

  it("returns false when the environment variable is unset", () => {
    delete process.env[NO_OMISSION_ENV];

    expect(readNoOmissionFromEnv()).toBe(false);
  });
});
