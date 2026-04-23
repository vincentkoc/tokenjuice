#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const POSIX_SHIM_SUFFIX_PATTERN = /node_modules\/\.pnpm\/[^"\n]+/u;
const POSIX_BASEDIR_TARGET_PATTERN = /\$basedir\/([^"\n]*node_modules\/\.pnpm\/[^"\n]+)"/gu;

function normalizeRelativePath(path) {
  return path.split(sep).join("/");
}

export function repairPosixShimText({ text, shimPath, projectRoot, targetExists }) {
  const basedir = dirname(shimPath);
  let nextText = text;
  let changed = false;
  const seenTargets = new Set();

  for (const match of text.matchAll(POSIX_BASEDIR_TARGET_PATTERN)) {
    const brokenRelativeTarget = match[1];
    if (!brokenRelativeTarget || seenTargets.has(brokenRelativeTarget)) {
      continue;
    }
    seenTargets.add(brokenRelativeTarget);

    const resolvedBrokenTarget = resolve(basedir, brokenRelativeTarget);
    if (targetExists(resolvedBrokenTarget)) {
      continue;
    }

    const suffixMatch = brokenRelativeTarget.match(POSIX_SHIM_SUFFIX_PATTERN);
    if (!suffixMatch) {
      continue;
    }

    const fixedTarget = resolve(projectRoot, suffixMatch[0]);
    if (!targetExists(fixedTarget)) {
      continue;
    }

    const fixedRelativeTarget = normalizeRelativePath(relative(basedir, fixedTarget));
    nextText = nextText.replaceAll(`$basedir/${brokenRelativeTarget}`, `$basedir/${fixedRelativeTarget}`);
    changed = true;
  }

  return {
    changed,
    text: nextText,
  };
}

export async function repairPnpmBinShims({
  projectRoot = fileURLToPath(new URL("..", import.meta.url)),
} = {}) {
  const binDir = join(projectRoot, "node_modules", ".bin");
  let entries;
  try {
    entries = await readdir(binDir, { withFileTypes: true });
  } catch (error) {
    const code = error?.code;
    if (code === "ENOENT") {
      return { repaired: [] };
    }
    throw error;
  }

  const repaired = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name.endsWith(".cmd") || entry.name.endsWith(".ps1")) {
      continue;
    }

    const shimPath = join(binDir, entry.name);
    const text = await readFile(shimPath, "utf8");
    const result = repairPosixShimText({
      text,
      shimPath,
      projectRoot,
      targetExists: (path) => existsSync(path),
    });

    if (!result.changed) {
      continue;
    }

    await writeFile(shimPath, result.text, "utf8");
    repaired.push(entry.name);
  }

  return { repaired };
}

async function main() {
  const result = await repairPnpmBinShims();
  if (result.repaired.length > 0) {
    console.log(`repaired broken pnpm .bin shims: ${result.repaired.join(", ")}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
