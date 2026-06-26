import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const integrationDoc = new URL("../../docs/codebuddy-integration.md", import.meta.url);
const specDoc = new URL("../../docs/spec.md", import.meta.url);

describe("CodeBuddy documentation", () => {
  it("describes external-change activation without unverified reload claims", async () => {
    const text = await readFile(integrationDoc, "utf8");

    expect(text).toContain(
      "open `/hooks` and review the external change for this session, or start a new CodeBuddy session",
    );
    expect(text).toContain("verifies the persisted settings file");
    expect(text).toMatch(/does not\s+verify that an active CodeBuddy session has reviewed or activated the hook/);
    expect(text).not.toContain("/reload-plugins");
    expect(text).not.toContain("panel still does not show");
  });

  it("keeps the persisted-config boundary in the host support table", async () => {
    const text = await readFile(specDoc, "utf8");

    expect(text).toContain("doctor verifies persisted config, not active-session activation");
    expect(text).not.toContain("/reload-plugins");
  });
});
