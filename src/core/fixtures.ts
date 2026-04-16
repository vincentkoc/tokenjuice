import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { reduceExecutionWithRules } from "./reduce.js";
import { loadBuiltinRules } from "./rules.js";

import type { RuleFixture } from "../types.js";

export type FixtureVerificationResult = {
  id: string;
  ruleId: string;
  ok: boolean;
  path: string;
  errors: string[];
};

function fixturesRoot(): string {
  return resolve(fileURLToPath(new URL("../rules/fixtures", import.meta.url)));
}

const fixtureCache = new Map<string, Array<{ fixture: RuleFixture; path: string }>>();

async function listFixtureFiles(root: string): Promise<string[]> {
  async function walk(currentDir: string): Promise<string[]> {
    const entries = (await readdir(currentDir, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          return await walk(fullPath);
        }
        if (!entry.isFile() || !entry.name.endsWith(".fixture.json")) {
          return [];
        }
        return [fullPath];
      }),
    );
    return files.flat();
  }

  try {
    return await walk(root);
  } catch {
    return [];
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isFactMap(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0)
  );
}

function validateFixture(raw: unknown): raw is RuleFixture {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return false;
  }

  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.ruleId !== "string") {
    return false;
  }
  if (typeof value.input !== "object" || value.input === null || Array.isArray(value.input)) {
    return false;
  }
  if (typeof value.expect !== "object" || value.expect === null || Array.isArray(value.expect)) {
    return false;
  }

  const expect = value.expect as Record<string, unknown>;
  if ("matchedReducer" in expect && typeof expect.matchedReducer !== "string") {
    return false;
  }
  if ("family" in expect && typeof expect.family !== "string") {
    return false;
  }
  if ("inlineText" in expect && typeof expect.inlineText !== "string") {
    return false;
  }
  if ("previewText" in expect && typeof expect.previewText !== "string") {
    return false;
  }
  if ("facts" in expect && !isFactMap(expect.facts)) {
    return false;
  }
  if ("contains" in expect && !isStringArray(expect.contains)) {
    return false;
  }
  if ("excludes" in expect && !isStringArray(expect.excludes)) {
    return false;
  }

  return true;
}

export async function loadBuiltinFixtures(): Promise<Array<{ fixture: RuleFixture; path: string }>> {
  const root = fixturesRoot();
  const cached = fixtureCache.get(root);
  if (cached) {
    return cached;
  }
  const files = await listFixtureFiles(root);

  const fixtures = await Promise.all(
    files.map(async (fullPath) => {
      const parsed = JSON.parse(await readFile(fullPath, "utf8")) as unknown;
      if (!validateFixture(parsed)) {
        throw new Error(`invalid fixture: ${relative(root, fullPath)}`);
      }
      return {
        fixture: parsed,
        path: fullPath,
      };
    }),
  );
  const duplicateIds = new Map<string, string[]>();
  for (const { fixture, path } of fixtures) {
    const group = duplicateIds.get(fixture.id) ?? [];
    group.push(path);
    duplicateIds.set(fixture.id, group);
  }
  for (const [id, paths] of duplicateIds) {
    if (paths.length > 1) {
      throw new Error(`duplicate fixture id ${id}: ${paths.join(", ")}`);
    }
  }
  fixtureCache.set(root, fixtures);
  return fixtures;
}

export async function verifyBuiltinFixtures(): Promise<FixtureVerificationResult[]> {
  const root = fixturesRoot();
  const fixtures = await loadBuiltinFixtures();
  const rules = await loadBuiltinRules();
  const knownRuleIds = new Set(rules.map((rule) => rule.rule.id));
  const coveredRuleIds = new Set<string>();

  const results = await Promise.all(
    fixtures.map(async ({ fixture, path }) => {
      const errors: string[] = [];
      coveredRuleIds.add(fixture.ruleId);
      try {
        if (!knownRuleIds.has(fixture.ruleId)) {
          errors.push(`unknown builtin ruleId: ${fixture.ruleId}`);
        }
        if (fixture.expect.matchedReducer !== fixture.ruleId) {
          errors.push(
            fixture.expect.matchedReducer
              ? `builtin fixture matchedReducer must equal ruleId (${fixture.ruleId}), got ${fixture.expect.matchedReducer}`
              : `builtin fixture must declare expect.matchedReducer = ${fixture.ruleId}`,
          );
        }
        const result = await reduceExecutionWithRules(fixture.input, rules, {
          ...(fixture.input.cwd ? { cwd: fixture.input.cwd } : {}),
          maxInlineChars: 5000,
        });
        const factText = Object.entries(result.facts ?? {})
          .filter(([, count]) => count > 0)
          .map(([name, count]) => `${count} ${name}${count === 1 ? "" : "s"}`)
          .join("\n");
        const searchableText = [result.inlineText, result.previewText, factText].filter(Boolean).join("\n");

        if (fixture.expect.matchedReducer && result.classification.matchedReducer !== fixture.expect.matchedReducer) {
          errors.push(
            `expected matched reducer ${fixture.expect.matchedReducer}, got ${result.classification.matchedReducer ?? "none"}`,
          );
        }
        if (fixture.expect.family && result.classification.family !== fixture.expect.family) {
          errors.push(`expected family ${fixture.expect.family}, got ${result.classification.family}`);
        }
        if (fixture.expect.inlineText && result.inlineText !== fixture.expect.inlineText) {
          errors.push(`expected inlineText ${JSON.stringify(fixture.expect.inlineText)}, got ${JSON.stringify(result.inlineText)}`);
        }
        if (fixture.expect.previewText && result.previewText !== fixture.expect.previewText) {
          errors.push(`expected previewText ${JSON.stringify(fixture.expect.previewText)}, got ${JSON.stringify(result.previewText)}`);
        }
        for (const [name, count] of Object.entries(fixture.expect.facts ?? {})) {
          if ((result.facts?.[name] ?? 0) !== count) {
            errors.push(`expected fact ${JSON.stringify(name)}=${count}, got ${result.facts?.[name] ?? 0}`);
          }
        }
        for (const snippet of fixture.expect.contains ?? []) {
          if (!searchableText.includes(snippet)) {
            errors.push(`missing expected text: ${snippet}`);
          }
        }
        for (const snippet of fixture.expect.excludes ?? []) {
          if (searchableText.includes(snippet)) {
            errors.push(`unexpected text present: ${snippet}`);
          }
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }

      return {
        id: fixture.id,
        ruleId: fixture.ruleId,
        ok: errors.length === 0,
        path,
        errors,
      };
    }),
  );
  const missingCoverage = rules
    .map((rule) => rule.rule.id)
    .filter((id) => !coveredRuleIds.has(id))
    .map((ruleId) => ({
      id: `coverage:${ruleId}`,
      ruleId,
      ok: false,
      path: root,
      errors: [`missing builtin fixture coverage for rule ${ruleId}`],
    }));
  return [...results, ...missingCoverage];
}

export function clearFixtureCache(): void {
  fixtureCache.clear();
}
