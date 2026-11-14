import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { loadExtensionRuntimeSource } from "../shared/bundle-runtime.js";
import { readSettingsFile, removeSettingsFile, writeSettingsFile } from "../shared/settings-file.js";

export type MimoCodeOptions = { configDir?: string; local?: boolean };
const marker = "// tokenjuice:mimo-code file-hook-v1\n";
const advisory = "MiMo Code file-hook support is beta; doctor verifies the file, not native loading or model-visible output.";

function configRoot(options: MimoCodeOptions): string {
  const explicit = options.configDir ?? process.env.MIMOCODE_CONFIG_DIR?.trim();
  if (explicit) return resolve(explicit);
  const home = process.env.MIMOCODE_HOME;
  if (home) {
    if (!isAbsolute(home)) throw new Error("MIMOCODE_HOME must be an absolute path");
    return join(home, "config");
  }
  return join(process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "mimocode");
}

function hookPath(options: MimoCodeOptions): string {
  return join(configRoot(options), "hooks", "tokenjuice.js");
}

async function safePath(options: MimoCodeOptions): Promise<string> {
  const root = configRoot(options);
  const path = hookPath(options);
  for (const candidate of [root, join(root, "hooks"), path]) {
    try {
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink() || (candidate === path ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) {
        throw new Error(`unsafe MiMo Code hook path: ${candidate}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  return path;
}

async function source(options: MimoCodeOptions): Promise<string> {
  const runtime = await loadExtensionRuntimeSource("mimo-code", import.meta.url, Boolean(options.local));
  return `${marker}${runtime}\nexport default createTokenjuiceMimoCodeHook();\n`;
}

export async function installMimoCodeHook(options: MimoCodeOptions = {}) {
  const extensionPath = await safePath(options);
  const file = await readSettingsFile(extensionPath);
  const previous = file.data?.toString("utf8");
  if (previous !== undefined && !previous.startsWith(marker)) {
    throw new Error(`refusing to replace an unowned MiMo Code hook: ${extensionPath}`);
  }
  const text = await source(options);
  const backupPath = previous === text ? undefined : await writeSettingsFile(file, text, "preserve");
  return { extensionPath, ...(backupPath ? { backupPath } : {}) };
}

export async function doctorMimoCodeHook(options: MimoCodeOptions = {}) {
  const extensionPath = hookPath(options);
  const base = { extensionPath, fixCommand: "tokenjuice install mimo-code", advisories: [advisory],
    checkedPaths: [extensionPath], missingPaths: [] as string[] };
  try {
    const file = await readSettingsFile(await safePath(options));
    if (!file.data) return { ...base, status: "disabled" as const, issues: [], missingPaths: [extensionPath] };
    if (!file.data.toString("utf8").startsWith(marker)) {
      return { ...base, status: "broken" as const, issues: ["hook path contains an unowned file"] };
    }
    const issues = file.data.toString("utf8") === await source(options) ? [] : ["hook differs from the current bundle; reinstall to refresh"];
    return { ...base, status: issues.length ? "warn" as const : "ok" as const, issues };
  } catch (error) {
    return { ...base, status: "broken" as const, issues: [error instanceof Error ? error.message : String(error)] };
  }
}

export async function uninstallMimoCodeHook(options: MimoCodeOptions = {}) {
  const extensionPath = await safePath(options);
  const file = await readSettingsFile(extensionPath);
  if (!file.data?.toString("utf8").startsWith(marker)) return { extensionPath, removed: false };
  return { extensionPath, removed: await removeSettingsFile(file) };
}
