import { describe, expect, it } from "vitest";

import { collectGuidanceIssues } from "../../../src/hosts/shared/instruction-file.js";

describe("collectGuidanceIssues", () => {
  it("reports missing required guidance and present forbidden guidance in order", () => {
    const issues = collectGuidanceIssues("marker\nuse `tokenjuice wrap -- <command>`\nuse `tokenjuice wrap --full -- <command>`", {
      required: [
        { requiredText: "marker", missingIssue: "missing marker" },
        { requiredText: "tokenjuice wrap -- <command>", missingIssue: "missing wrap" },
        { requiredText: "tokenjuice wrap --raw -- <command>", missingIssue: "missing raw" },
      ],
      forbidden: [
        { forbiddenText: "tokenjuice wrap --full -- <command>", presentIssue: "has full" },
      ],
    });

    expect(issues).toEqual(["missing raw", "has full"]);
  });
});
