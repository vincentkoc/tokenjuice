import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("provides a Doubao Work skill with required metadata and runtime/raw guidance", async () => {
  const text = await readFile(new URL("../../packaging/skills/doubao-work/tokenjuice/SKILL.md", import.meta.url), "utf8");
  expect(text.startsWith("---\nname: tokenjuice\ndescription: ")).toBe(true);
  expect(text).toContain("tokenjuice --version");
  expect(text).toContain("command -v tokenjuice");
  expect(text).toContain("tokenjuice wrap --raw -- <command>");
  expect(text).not.toContain("wrap --full");
});
