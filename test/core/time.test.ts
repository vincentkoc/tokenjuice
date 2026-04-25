import { describe, expect, it } from "vitest";

import { buildCalendarDayFormatter, normalizeTimeZone } from "../../src/core/time.js";

describe("time helpers", () => {
  it("formats calendar days in utc and explicit timezones", () => {
    const createdAt = "2026-04-20T03:30:00.000Z";

    expect(buildCalendarDayFormatter("utc")(createdAt)).toBe("2026-04-20");
    expect(buildCalendarDayFormatter("UTC")(createdAt)).toBe("2026-04-20");
    expect(buildCalendarDayFormatter("America/New_York")(createdAt)).toBe("2026-04-19");
    expect(buildCalendarDayFormatter("america/new_york")(createdAt)).toBe("2026-04-19");
  });

  it("normalizes valid timezones before formatting", () => {
    expect(normalizeTimeZone("america/new_york")).toBe("America/New_York");
    expect(normalizeTimeZone("US/Eastern")).toBe("America/New_York");
    expect(normalizeTimeZone("  ")).toBe("utc");
  });

  it("reports invalid timezones with an actionable message", () => {
    expect(() => buildCalendarDayFormatter("Asia/Beijing")).toThrow(
      'invalid timezone: Asia/Beijing. Expected "local", "utc", or an IANA time zone such as "Asia/Shanghai" or "America/New_York".',
    );
  });

  it("preserves the stored iso day when timestamps are malformed", () => {
    expect(buildCalendarDayFormatter("utc")("2026-04-20-not-a-date")).toBe("2026-04-20");
  });
});
