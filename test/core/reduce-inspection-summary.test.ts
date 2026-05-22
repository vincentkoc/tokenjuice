import { describe, expect, it } from "vitest";

import { buildInspectionSummary } from "../../src/core/reduce-inspection-summary.js";

describe("buildInspectionSummary", () => {
  it("keeps the full large document summary content when noOmit is enabled", () => {
    const longHeading = `## ${"Detailed heading ".repeat(16).trim()}`;
    const rawText = [
      "# Review",
      longHeading,
      ...Array.from({ length: 60 }, (_, index) => `paragraph ${index} ${"x".repeat(120)}`),
    ].join("\n");

    const summary = buildInspectionSummary(
      {
        toolName: "exec",
        command: "sed -n '1,260p' notes.txt",
        argv: ["sed", "-n", "1,260p", "notes.txt"],
        exitCode: 0,
      },
      rawText,
      true,
    );

    expect(summary?.matchedReducer).toBe("generic/large-document-summary");
    expect(summary?.lines.join("\n")).toContain(longHeading);
    expect(summary?.lines.join("\n")).toContain("paragraph 59");
    expect(summary?.lines.join("\n")).not.toContain("omitted");
    expect(summary?.lines.join("\n")).not.toContain("sha256:");
    expect(summary?.compaction.authoritative).toBe(false);
    expect(summary?.compaction.kinds).toEqual(expect.arrayContaining([
      "inspection-large-document-summary",
      "no-omit-head-tail-passthrough",
      "no-omit-char-clip-passthrough",
    ]));
  });
});
