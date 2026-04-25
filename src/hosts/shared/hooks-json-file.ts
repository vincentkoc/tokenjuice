import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Shared helpers for claude-code-style PostToolUse/PreToolUse hook JSON
// files under `~/.copilot/hooks/`. Used by both the Copilot CLI and
// VS Code Copilot Chat adapters; each adapter supplies its own filename
// and its own command-marker substring so the two installs coexist in
// the same directory without clobbering each other.
//
// The codex/claude-code adapters predate this helper and retain their
// own serializers for historical reasons; migrating them belongs in a
// separate refactor PR.

export type CopilotHooksConfig = Record<string, unknown> & {
  version?: number;
  disableAllHooks?: boolean;
  hooks: Record<string, unknown>;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeCopilotHooksConfig(raw: unknown): CopilotHooksConfig {
  if (!isRecord(raw)) {
    return { version: 1, hooks: {} };
  }
  return {
    ...raw,
    version: typeof raw.version === "number" ? raw.version : 1,
    hooks: isRecord(raw.hooks) ? { ...raw.hooks } : {},
  };
}

export async function readCopilotHooksConfig(
  hooksPath: string,
  hostLabel: string,
): Promise<{ config: CopilotHooksConfig; exists: boolean }> {
  try {
    const rawText = await readFile(hooksPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    return { config: sanitizeCopilotHooksConfig(parsed), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { version: 1, hooks: {} }, exists: false };
    }
    throw new Error(
      `failed to read ${hostLabel} hooks from ${hooksPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function loadCopilotHooksConfigWithBackup(
  hooksPath: string,
  hostLabel: string,
): Promise<{ config: CopilotHooksConfig; backupPath?: string }> {
  try {
    const rawText = await readFile(hooksPath, "utf8");
    const parsed = JSON.parse(rawText) as unknown;
    const config = sanitizeCopilotHooksConfig(parsed);
    const backupPath = `${hooksPath}.bak`;
    await writeFile(backupPath, rawText, "utf8");
    return { config, backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: { version: 1, hooks: {} } };
    }
    throw new Error(
      `failed to load ${hostLabel} hooks from ${hooksPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function writeCopilotHooksConfigAtomic(
  hooksPath: string,
  config: CopilotHooksConfig,
): Promise<void> {
  const tempPath = `${hooksPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, hooksPath);
}

export async function ensureHooksDir(hooksDir: string): Promise<void> {
  await mkdir(hooksDir, { recursive: true });
}

// Scan every sibling `*.json` in `hooksDir`, skipping the canonical
// install path, and return those that contain a tokenjuice entry
// matching `isTokenjuiceCommand`. Used by doctor to surface stray
// installs that would otherwise be silently double-loaded by the
// host's hook scanner.
export async function findStrayTokenjuiceHookFiles(
  hooksDir: string,
  canonicalPath: string,
  isTokenjuiceCommand: (command: string) => boolean,
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(hooksDir);
  } catch {
    return [];
  }

  const stray: string[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    const candidate = join(hooksDir, entry);
    if (candidate === canonicalPath) {
      continue;
    }
    try {
      const rawText = await readFile(candidate, "utf8");
      const parsed = JSON.parse(rawText) as unknown;
      const config = sanitizeCopilotHooksConfig(parsed);
      if (hasTokenjuiceCommand(config, isTokenjuiceCommand)) {
        stray.push(candidate);
      }
    } catch {
      // ignore unreadable/invalid files
    }
  }
  return stray;
}

function hasTokenjuiceCommand(
  config: CopilotHooksConfig,
  isTokenjuiceCommand: (command: string) => boolean,
): boolean {
  for (const bucket of Object.values(config.hooks)) {
    if (!Array.isArray(bucket)) {
      continue;
    }
    for (const entry of bucket) {
      if (
        isRecord(entry)
        && typeof entry.command === "string"
        && isTokenjuiceCommand(entry.command)
      ) {
        return true;
      }
    }
  }
  return false;
}
