import { describe, expect, it } from "vitest";

import {
  buildTokenjuiceGuidanceBullets,
  collectTokenjuiceGuidanceIssues,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../../../src/hosts/shared/instruction-guidance.js";

describe("buildTokenjuiceGuidanceBullets", () => {
  it("builds shared wrap/raw guidance bullets", () => {
    const bullets = buildTokenjuiceGuidanceBullets();

    expect(bullets[0]).toContain(TOKENJUICE_WRAP_COMMAND);
    expect(bullets[1]).toContain("authoritative");
    expect(bullets[2]).toContain(TOKENJUICE_RAW_COMMAND);
    expect(bullets[3]).toContain("raw escape hatch");
  });

  it("allows hosts to customize the wrap guidance while sharing the remaining bullets", () => {
    const bullets = buildTokenjuiceGuidanceBullets({
      wrapBullet: `- Prefer \`${TOKENJUICE_WRAP_COMMAND}\` from custom host tools.`,
    });

    expect(bullets[0]).toBe("- Prefer `tokenjuice wrap -- <command>` from custom host tools.");
    expect(bullets[2]).toContain(TOKENJUICE_RAW_COMMAND);
  });
});

describe("collectTokenjuiceGuidanceIssues", () => {
  it("keeps plural issue order and recognizes concrete full-output commands", () => {
    expect(collectTokenjuiceGuidanceIssues("tokenjuice wrap --full -- npm test", {
      configuredLabel: "example instructions",
    })).toEqual([
      "configured example instructions are missing tokenjuice wrap guidance",
      "configured example instructions are missing the raw escape hatch",
      "configured example instructions still suggest the full escape hatch",
    ]);
  });

  it("keeps singular wording and accepts current guidance", () => {
    const options = { configuredLabel: "example rule", singular: true };
    expect(collectTokenjuiceGuidanceIssues(TOKENJUICE_RAW_COMMAND, options)).toEqual([
      "configured example rule is missing tokenjuice wrap guidance",
    ]);
    expect(collectTokenjuiceGuidanceIssues(buildTokenjuiceGuidanceBullets().join("\n"), options)).toEqual([]);
  });

  it("keeps host-specific requirements ahead of standard guidance issues", () => {
    expect(collectTokenjuiceGuidanceIssues("", {
      configuredLabel: "example rule",
      singular: true,
      additionalRequired: [{ requiredText: "activation: always_on", missingIssue: "missing activation" }],
    })).toEqual([
      "missing activation",
      "configured example rule is missing tokenjuice wrap guidance",
      "configured example rule is missing the raw escape hatch",
    ]);
  });
});
