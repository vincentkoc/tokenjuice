import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { JsonRule } from "../types.js";

const RULE_PATHS = [
  "git/status.json",
  "search/rg.json",
  "generic/fallback.json",
] as const;

let cachedRules: JsonRule[] | null = null;

async function readRule(relativePath: string): Promise<JsonRule> {
  const rulesRoot = resolve(fileURLToPath(new URL("../rules", import.meta.url)));
  const fullPath = resolve(rulesRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw) as JsonRule;
}

export async function loadBuiltinRules(): Promise<JsonRule[]> {
  if (cachedRules !== null) {
    return cachedRules;
  }

  cachedRules = await Promise.all(RULE_PATHS.map((path) => readRule(path)));
  return cachedRules;
}
