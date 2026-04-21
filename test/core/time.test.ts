import { describe, expect, it } from "vitest";

import { buildCalendarDayFormatter } from "../../src/core/time.js";

describe("time helpers", () => {
  it("formats calendar days in utc and explicit timezones", () => {
    const createdAt = "2026-04-20T03:30:00.000Z";

    expect(buildCalendarDayFormatter("utc")(createdAt)).toBe("2026-04-20");
    expect(buildCalendarDayFormatter("UTC")(createdAt)).toBe("2026-04-20");
    expect(buildCalendarDayFormatter("America/New_York")(createdAt)).toBe("2026-04-19");
  });

  it("preserves the stored iso day when timestamps are malformed", () => {
    expect(buildCalendarDayFormatter("utc")("2026-04-20-not-a-date")).toBe("2026-04-20");
  });
});
