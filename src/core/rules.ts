import { readdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CompiledRule, JsonRule, RuleOrigin } from "../types.js";
import { assertValidRule, validateRule } from "./validate-rules.js";

type LoadRuleOptions = {
  cwd?: string;
  includeUser?: boolean;
  includeProject?: boolean;
  userRulesDir?: string;
  projectRulesDir?: string;
};

type RuleDescriptor = {
  source: RuleOrigin;
  path: string;
  relativePath: string;
  rule: JsonRule;
};

type RuleVerificationResult = {
  id: string;
  ok: boolean;
  source: RuleOrigin;
  path: string;
  errors: string[];
  warnings: string[];
};

const ruleCache = new Map<string, CompiledRule[]>();

function builtinRulesRoot(): string {
  return resolve(fileURLToPath(new URL("../rules", import.meta.url)));
}

function mergeRegexFlags(flags?: string): string {
  return [...new Set(`u${flags ?? ""}`.split(""))].join("");
}

function compileRule(descriptor: RuleDescriptor): CompiledRule {
  return {
    rule: descriptor.rule,
    source: descriptor.source,
    path: descriptor.path,
    compiled: {
      skipPatterns: (descriptor.rule.filters?.skipPatterns ?? []).map((pattern) => new RegExp(pattern, "u")),
      keepPatterns: (descriptor.rule.filters?.keepPatterns ?? []).map((pattern) => new RegExp(pattern, "u")),
      counters: (descriptor.rule.counters ?? []).map((counter) => ({
        name: counter.name,
        pattern: new RegExp(counter.pattern, mergeRegexFlags(counter.flags)),
      })),
      outputMatches: (descriptor.rule.matchOutput ?? []).map((entry) => ({
        pattern: new RegExp(entry.pattern, mergeRegexFlags(entry.flags)),
        message: entry.message,
      })),
    },
  };
}

async function listRuleFiles(root: string): Promise<string[]> {
  const resolvedRoot = await realpath(root).catch(() => null);
  if (!resolvedRoot) {
    return [];
  }
  const rootRealPath = resolvedRoot;

  async function walk(currentDir: string): Promise<string[]> {
    const entries = (await readdir(currentDir, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(currentDir, entry.name);
        if (entry.isSymbolicLink()) {
          return [];
        }
        if (entry.isDirectory()) {
          return await walk(fullPath);
        }
        if (
          !entry.isFile()
          || !entry.name.endsWith(".json")
          || entry.name.endsWith(".schema.json")
          || entry.name.endsWith(".fixture.json")
        ) {
          return [];
        }
        const realFilePath = await realpath(fullPath).catch(() => null);
        if (!realFilePath) {
          return [];
        }

        const relativePath = relative(rootRealPath, realFilePath);
        if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
          return [];
        }

        return [realFilePath];
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

function userRulesRoot(customDir?: string): string {
  return customDir ?? join(homedir(), ".config", "tokenjuice", "rules");
}

function projectRulesRoot(cwd?: string, customDir?: string): string {
  return customDir ?? join(cwd ?? process.cwd(), ".tokenjuice", "rules");
}

function sortRules(rules: CompiledRule[]): CompiledRule[] {
  return [...rules].sort((left, right) => {
    if (left.rule.id === "generic/fallback") {
      return 1;
    }
    if (right.rule.id === "generic/fallback") {
      return -1;
    }
    return left.rule.id.localeCompare(right.rule.id);
  });
}

async function loadRuleDescriptorsFromRoot(root: string, source: RuleOrigin): Promise<RuleDescriptor[]> {
  const files = await listRuleFiles(root);
  return await Promise.all(
    files.map(async (fullPath) => {
      const parsed = JSON.parse(await readFile(fullPath, "utf8")) as unknown;
      assertValidRule(parsed);
      return {
        source,
        path: fullPath,
        relativePath: relative(root, fullPath),
        rule: parsed,
      };
    }),
  );
}

function cacheKey(options: LoadRuleOptions): string {
  return JSON.stringify({
    cwd: options.cwd ?? process.cwd(),
    includeUser: options.includeUser ?? true,
    includeProject: options.includeProject ?? true,
    userRulesDir: options.userRulesDir ?? null,
    projectRulesDir: options.projectRulesDir ?? null,
  });
}

function overlayRules(descriptors: RuleDescriptor[]): CompiledRule[] {
  const byId = new Map<string, RuleDescriptor>();
  for (const descriptor of descriptors) {
    byId.set(descriptor.rule.id, descriptor);
  }
  return sortRules([...byId.values()].map((descriptor) => compileRule(descriptor)));
}

export async function loadRules(options: LoadRuleOptions = {}): Promise<CompiledRule[]> {
  const key = cacheKey(options);
  const cached = ruleCache.get(key);
  if (cached) {
    return cached;
  }

  const descriptors: RuleDescriptor[] = [];
  descriptors.push(...await loadRuleDescriptorsFromRoot(builtinRulesRoot(), "builtin"));

  if (options.includeUser ?? true) {
    descriptors.push(...await loadRuleDescriptorsFromRoot(userRulesRoot(options.userRulesDir), "user"));
  }
  if (options.includeProject ?? true) {
    descriptors.push(...await loadRuleDescriptorsFromRoot(projectRulesRoot(options.cwd, options.projectRulesDir), "project"));
  }

  const compiled = overlayRules(descriptors);
  ruleCache.set(key, compiled);
  return compiled;
}

export async function loadBuiltinRules(): Promise<CompiledRule[]> {
  return await loadRules({
    includeUser: false,
    includeProject: false,
  });
}

export function clearRuleCache(): void {
  ruleCache.clear();
}

async function verifyRuleRoot(root: string, source: RuleOrigin): Promise<RuleVerificationResult[]> {
  const files = await listRuleFiles(root);
  const results = await Promise.all(
    files.map(async (fullPath) => {
      try {
        const raw = JSON.parse(await readFile(fullPath, "utf8")) as unknown;
        const validation = validateRule(raw);
        const errors = validation.ok ? [] : [...validation.errors];
        if (validation.ok) {
          try {
            assertValidRule(raw);
            compileRule({
              source,
              path: fullPath,
              relativePath: relative(root, fullPath),
              rule: raw,
            });
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }
        return {
          id: validation.ok && typeof raw === "object" && raw !== null && "id" in raw && typeof raw.id === "string"
            ? raw.id
            : relative(root, fullPath).replace(/\.json$/u, ""),
          ok: errors.length === 0,
          source,
          path: fullPath,
          errors,
          warnings: [],
        };
      } catch (error) {
        return {
          id: relative(root, fullPath).replace(/\.json$/u, ""),
          ok: false,
          source,
          path: fullPath,
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: [],
        };
      }
    }),
  );

  const idGroups = new Map<string, RuleVerificationResult[]>();
  for (const result of results) {
    const group = idGroups.get(result.id) ?? [];
    group.push(result);
    idGroups.set(result.id, group);
  }
  for (const [id, group] of idGroups) {
    if (group.length > 1) {
      for (const result of group) {
        result.errors.push(`duplicate rule id in ${source} layer: ${id}`);
        result.ok = false;
      }
    }
  }

  return results;
}

function ruleSourceRank(source: RuleOrigin): number {
  switch (source) {
    case "builtin":
      return 0;
    case "user":
      return 1;
    case "project":
      return 2;
  }
}

function addShadowWarnings(results: RuleVerificationResult[]): void {
  const byId = new Map<string, RuleVerificationResult[]>();
  for (const result of results) {
    const group = byId.get(result.id) ?? [];
    group.push(result);
    byId.set(result.id, group);
  }

  for (const [id, group] of byId) {
    if (group.length < 2) {
      continue;
    }

    const ordered = [...group].sort((left, right) => ruleSourceRank(left.source) - ruleSourceRank(right.source));
    const winner = ordered[ordered.length - 1]!;
    const shadowed = ordered.slice(0, -1);

    winner.warnings.push(
      `shadows ${shadowed.map((result) => `${result.source}:${id}`).join(", ")}`,
    );
    for (const result of shadowed) {
      result.warnings.push(`shadowed by ${winner.source}:${id}`);
    }
  }
}

export async function verifyRules(options: LoadRuleOptions = {}): Promise<RuleVerificationResult[]> {
  const results: RuleVerificationResult[] = [];
  results.push(...await verifyRuleRoot(builtinRulesRoot(), "builtin"));
  if (options.includeUser ?? true) {
    results.push(...await verifyRuleRoot(userRulesRoot(options.userRulesDir), "user"));
  }
  if (options.includeProject ?? true) {
    results.push(...await verifyRuleRoot(projectRulesRoot(options.cwd, options.projectRulesDir), "project"));
  }
  addShadowWarnings(results);
  return results;
}

export async function verifyBuiltinRules(): Promise<RuleVerificationResult[]> {
  return await verifyRules({
    includeUser: false,
    includeProject: false,
  });
}
