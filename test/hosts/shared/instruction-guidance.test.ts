import { describe, expect, it } from "vitest";

import {
  buildTokenjuiceGuidanceBullets,
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
