import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("portable skill packages", () => {
  it("provides WorkBuddy's required localized metadata and execution prerequisites", async () => {
    const text = await readFile(new URL("../../packaging/skills/workbuddy/tokenjuice/SKILL.md", import.meta.url), "utf8");
    const lines = text.split("\n");
    expect(lines[0]).toBe("---");
    const end = lines.indexOf("---", 1);
    expect(end).toBeGreaterThan(1);
    const fields = Object.fromEntries(lines.slice(1, end).map((line) => {
      const colon = line.indexOf(":");
      const value = line.slice(colon + 1).trim();
      return [line.slice(0, colon), value.startsWith('"') ? JSON.parse(value) : value];
    }));
    expect(fields.name).toBe("tokenjuice");
    for (const key of ["display_name", "display_name_en", "description", "description_zh", "description_en", "version", "author"]) {
      expect(typeof fields[key]).toBe("string");
      expect(fields[key].length).toBeGreaterThan(0);
    }
    expect(text).toContain("command -v tokenjuice");
    expect(text).toContain("tokenjuice --version");
    expect(text).toContain("tokenjuice wrap --raw -- <command>");
    expect(text).not.toContain("wrap --full");
  });
});
