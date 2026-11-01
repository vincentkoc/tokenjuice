import { parseSimpleYamlFrontmatter } from "../../core/simple-yaml-frontmatter.js";

export function inspectSkillFrontmatter(text: string, isValidScalar: (rawValue: string) => boolean): { hasName: boolean; hasDescription: boolean; hasValidYaml: boolean } {
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== "---") {
    return { hasName: false, hasDescription: false, hasValidYaml: false };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (endIndex < 0) {
    return { hasName: false, hasDescription: false, hasValidYaml: false };
  }

  const frontmatter = lines.slice(1, endIndex);
  const parsed = parseSimpleYamlFrontmatter(frontmatter, isValidScalar);
  return {
    hasName: parsed.values.get("name") === "tokenjuice",
    hasDescription: (parsed.values.get("description") ?? "") !== "",
    hasValidYaml: parsed.hasValidYaml,
  };
}
