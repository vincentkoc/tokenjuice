import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearFixtureCache,
  clearRuleCache,
  loadBuiltinRules,
  verifyBuiltinRules,
} from "../../src/index.js";

const RULES_ROOT = resolve(fileURLToPath(new URL("../../src/rules", import.meta.url)));

afterEach(() => {
  clearFixtureCache();
  clearRuleCache();
});

async function listBuiltinRuleFiles(): Promise<string[]> {
  async function walk(currentDir: string): Promise<string[]> {
    const entries = (await readdir(currentDir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          return await walk(fullPath);
        }
        if (
          !entry.name.endsWith(".json")
          || entry.name.endsWith(".schema.json")
          || entry.name.endsWith(".fixture.json")
        ) {
          return [];
        }
        return [fullPath];
      }),
    );
    return files.flat();
  }
  return await walk(RULES_ROOT);
}

describe("builtin rules loading", () => {
  it("loads all .json rule files from src/rules/", async () => {
    const ruleFiles = await listBuiltinRuleFiles();
    expect(ruleFiles.length).toBeGreaterThan(0);

    const rules = await loadBuiltinRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.length).toBe(ruleFiles.length);
  });

  it("every loaded rule has a valid id and family", async () => {
    const rules = await loadBuiltinRules();
    for (const { rule } of rules) {
      expect(rule.id).toBeTruthy();
      expect(typeof rule.id).toBe("string");
      expect(rule.id.length).toBeGreaterThan(0);
      expect(rule.family).toBeTruthy();
      expect(typeof rule.family).toBe("string");
      expect(rule.family.length).toBeGreaterThan(0);
    }
  });

  it("every loaded rule has a match object", async () => {
    const rules = await loadBuiltinRules();
    for (const { rule } of rules) {
      expect(rule.match).toBeDefined();
      expect(typeof rule.match).toBe("object");
      expect(rule.match).not.toBeNull();
    }
  });

  it("loaded rules have unique ids", async () => {
    const rules = await loadBuiltinRules();
    const ids = rules.map((r) => r.rule.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("loaded rules include generic/fallback", async () => {
    const rules = await loadBuiltinRules();
    const ids = rules.map((r) => r.rule.id);
    expect(ids).toContain("generic/fallback");
  });
});

describe("builtin rules validation", () => {
  it("verifies all builtin rules cleanly", async () => {
    const results = await verifyBuiltinRules();
    const failed = results.filter((r) => !r.ok);
    expect(failed.map((r) => `${r.id}: ${r.errors.join(" | ")}`)).toEqual([]);
  });

  it("no duplicate rule ids in builtin layer", async () => {
    const results = await verifyBuiltinRules();
    const idGroups = new Map<string, typeof results>();
    for (const result of results) {
      const group = idGroups.get(result.id) ?? [];
      group.push(result);
      idGroups.set(result.id, group);
    }
    const duplicates = [...idGroups.entries()].filter(([, group]) => group.length > 1);
    expect(duplicates.map(([id]) => id)).toEqual([]);
  });

  it("all rule files have a corresponding verification result", async () => {
    const ruleFiles = await listBuiltinRuleFiles();
    const results = await verifyBuiltinRules();
    expect(results.length).toBe(ruleFiles.length);
  });
});

describe("builtin rule schema validation", () => {
  it("rejects rules missing id", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ family: "test", match: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("id must be a string");
  });

  it("rejects rules missing family", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", match: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("family must be a string");
  });

  it("rejects rules missing match", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("match is required");
  });

  it("rejects rules with invalid counterSource", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {}, counterSource: "invalid" });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("counterSource must be one of");
  });

  it("rejects rules with invalid priority", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {}, priority: Infinity });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("priority must be a finite number");
  });

  it("accepts valid rule with all fields", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({
      id: "test/rule",
      family: "test",
      description: "A test rule",
      onEmpty: "no output",
      counterSource: "postKeep",
      priority: 1,
      match: { argv0: ["test"] },
      filters: { skipPatterns: ["^debug"], keepPatterns: ["^info"] },
      transforms: { stripAnsi: true, prettyPrintJson: false, dedupeAdjacent: true, trimEmptyEdges: true },
      summarize: { head: 10, tail: 5 },
      failure: { preserveOnFailure: true, head: 20, tail: 20 },
      counters: [{ name: "error", pattern: "error" }],
      matchOutput: [{ pattern: "FAIL", message: "Test failure" }],
    });
    expect(result.ok).toBe(true);
  });
});

describe("builtin rule edge cases", () => {
  it("empty file content fails validation", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule("");
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("rule must be an object");
  });

  it("null fails validation", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule(null);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("rule must be an object");
  });

  it("array fails validation", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule([{ id: "test", family: "test", match: {} }]);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("rule must be an object");
  });

  it("number fails validation", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule(42);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("rule must be an object");
  });

  it("id with NUL byte fails validation", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test\u0000rule", family: "test", match: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("must not contain NUL bytes");
  });

  it("description with NUL byte fails validation", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", description: "bad\u0000desc", match: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("must not contain NUL bytes");
  });

  it("summarize.head must be non-negative integer", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {}, summarize: { head: -1 } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("non-negative integer");
  });

  it("summarize.tail must be non-negative integer", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {}, summarize: { tail: 1.5 } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("non-negative integer");
  });

  it("failure.head must be non-negative integer", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {}, failure: { head: -5 } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("non-negative integer");
  });

  it("match.toolNames must be string array", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: { toolNames: [123] } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("toolNames must be an array of strings");
  });

  it("match.argv0 must be string array", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: { argv0: ["git", 42] } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("argv0 must be an array of strings");
  });

  it("match.gitSubcommands must be string array", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: { gitSubcommands: [null] } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("gitSubcommands must be an array of strings");
  });

  it("match.argvIncludes must be array of string arrays", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: { argvIncludes: [["a"], "b"] } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("argvIncludes must be an array of string arrays");
  });

  it("match.commandIncludes must be string array", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: { commandIncludes: [1, 2, 3] } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("commandIncludes must be an array of strings");
  });

  it("counters array with invalid counter fails", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({
      id: "test/rule",
      family: "test",
      match: {},
      counters: [{ name: "", pattern: "" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("name must be a non-empty string");
  });

  it("matchOutput array with invalid entry fails", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({
      id: "test/rule",
      family: "test",
      match: {},
      matchOutput: [{ pattern: "", message: "" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("pattern must be a non-empty string");
  });

  it("transforms.stripAnsi must be boolean", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {}, transforms: { stripAnsi: "yes" } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("stripAnsi must be a boolean");
  });

  it("filters.skipPatterns must be string array", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {}, filters: { skipPatterns: [null] } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("skipPatterns must be an array of strings");
  });

  it("filters.keepPatterns must be string array", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {}, filters: { keepPatterns: [42] } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("keepPatterns must be an array of strings");
  });

  it("failure.preserveOnFailure must be boolean", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {}, failure: { preserveOnFailure: 1 } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("preserveOnFailure must be a boolean");
  });
});

describe("builtin rule JSON parsing edge cases", () => {
  it("invalid JSON string fails when parsed", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule("{ not valid json }");
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("rule must be an object");
  });

  it("undefined match object fails validation", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: undefined });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("match must be an object");
  });

  it("empty match object is valid", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {} });
    expect(result.ok).toBe(true);
  });

  it("match with empty arrays is valid", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({
      id: "test/rule",
      family: "test",
      match: { argv0: [], argvIncludes: [], commandIncludes: [] },
    });
    expect(result.ok).toBe(true);
  });

  it("empty counters array is valid", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {}, counters: [] });
    expect(result.ok).toBe(true);
  });

  it("empty matchOutput array is valid", async () => {
    const { validateRule } = await import("../../src/index.js");
    const result = validateRule({ id: "test/rule", family: "test", match: {}, matchOutput: [] });
    expect(result.ok).toBe(true);
  });
});

describe("builtin rules filesystem", () => {
  it("all .json files in src/rules/ load successfully", async () => {
    const ruleFiles = await listBuiltinRuleFiles();
    const rules = await loadBuiltinRules();
    expect(rules.length).toBe(ruleFiles.length);
  });

  it("no .schema.json files are treated as rules", async () => {
    const ruleFiles = await listBuiltinRuleFiles();
    const schemaFiles = ruleFiles.filter((f) => f.endsWith(".schema.json"));
    expect(schemaFiles).toEqual([]);
  });

  it("rules have expected directory structure", async () => {
    const ruleFiles = await listBuiltinRuleFiles();
    const relativePaths = ruleFiles.map((f) => relative(RULES_ROOT, f));

    // Expected subdirectories
    const expectedDirs = [
      "archive", "build", "cloud", "database", "devops", "filesystem",
      "generic", "git", "install", "lint", "media", "network",
      "observability", "openclaw", "package", "search", "service",
      "system", "task", "tests", "text", "transfer",
    ];

    for (const dir of expectedDirs) {
      const hasFiles = relativePaths.some((p) => p.startsWith(dir + "/"));
      expect(hasFiles).toBe(true);
    }
  });
});
