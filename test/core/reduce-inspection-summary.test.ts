import { describe, expect, it } from "vitest";

import { buildInspectionSummary } from "../../src/core/reduce-inspection-summary.js";

describe("buildInspectionSummary", () => {
  const packageNames = Array.from({ length: 20 }, (_, index) => `node_modules/pkg-${index}`);
  const lockfile = JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: Object.fromEntries(packageNames.map((name) => [name, { version: "1.0.0" }])),
  });
  const lockfileRead = {
    toolName: "exec",
    command: "jq . package-lock.json",
    argv: ["jq", ".", "package-lock.json"],
    exitCode: 0,
  };

  it("samples the package list of a package-lock summary by default", () => {
    const summary = buildInspectionSummary(lockfileRead, lockfile);

    expect(summary?.matchedReducer).toBe("generic/package-lock-summary");
    expect(summary?.lines).toContain("packages: 20");
    expect(summary?.lines.join("\n")).toContain("node_modules/pkg-11");
    expect(summary?.lines.join("\n")).not.toContain("node_modules/pkg-12");
    expect(summary?.compaction.kinds).toEqual(["inspection-package-lock-summary"]);
  });

  it("keeps the full package list when noOmit is enabled", () => {
    const summary = buildInspectionSummary(lockfileRead, lockfile, true);

    expect(summary?.matchedReducer).toBe("generic/package-lock-summary");
    expect(summary?.lines.join("\n")).toContain("node_modules/pkg-19");
  });

  it("returns no summary for an exact read of a document-shaped file", () => {
    const longHeading = `## ${"Detailed heading ".repeat(16).trim()}`;
    const rawText = [
      "# Review",
      longHeading,
      ...Array.from({ length: 60 }, (_, index) => `paragraph ${index} ${"x".repeat(120)}`),
    ].join("\n");
    const prosePageRead = {
      toolName: "exec",
      command: "sed -n '1,260p' notes.txt",
      argv: ["sed", "-n", "1,260p", "notes.txt"],
      exitCode: 0,
    };

    expect(buildInspectionSummary(prosePageRead, rawText)).toBeNull();
    expect(buildInspectionSummary(prosePageRead, rawText, true)).toBeNull();
  });
});
