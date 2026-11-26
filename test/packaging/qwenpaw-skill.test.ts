import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("QwenPaw workspace skill package", () => {
  it("declares the executable dependency and preserves exact and failed command guidance", async () => {
    const text = await readFile(new URL("../../packaging/skills/qwenpaw/tokenjuice/SKILL.md", import.meta.url), "utf8");
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/u)?.[1];
    expect(frontmatter).toBeDefined();
    expect(frontmatter).toMatch(/^name: tokenjuice$/mu);
    expect(frontmatter).toMatch(/^description: ".+"$/mu);
    expect(frontmatter).toContain("metadata:\n  version: \"1.0.0\"\n  requires:\n    bins: [tokenjuice]");
    expect(text).toContain("tokenjuice --version");
    expect(text).toContain("command -v tokenjuice");
    expect(text).toContain("tokenjuice wrap --keep-failures -- <command>");
    expect(text).toContain("tokenjuice wrap --raw -- <command>");
    expect(text).toContain("approval");
    expect(text).not.toContain("wrap --full");
  });

  it("keeps every documented lifecycle command scoped to an explicit agent", async () => {
    const text = await readFile(new URL("../../docs/qwenpaw-integration.md", import.meta.url), "utf8");
    const commands = text.split("\n").filter((line) => line.startsWith("qwenpaw skills "));
    expect(commands.length).toBeGreaterThan(5);
    for (const command of commands) expect(command).toContain("--agent-id AGENT_ID");
    expect(text).toContain("as **disabled**");
    expect(text).toContain("custom workspace");
    expect(text).toContain("remain unqualified");
  });
});
