import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { loadExtensionRuntimeSource } from "../shared/bundle-runtime.js";
import { readSettingsFile, removeSettingsFile, writeSettingsFile } from "../shared/settings-file.js";

export type DevEcoOptions = { configDir?: string; local?: boolean };
const marker = "// tokenjuice:deveco\n";

function configRoot(options: DevEcoOptions): string {
  return resolve(options.configDir ?? (process.env.DEVECO_CONFIG_DIR?.trim()
    || join(process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "deveco")));
}

async function safePath(options: DevEcoOptions): Promise<string> {
  const root = configRoot(options);
  const extensionPath = join(root, "plugins", "tokenjuice.js");
  for (const path of [root, join(root, "plugins"), extensionPath]) {
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || (path === extensionPath ? !stats.isFile() || stats.nlink !== 1 : !stats.isDirectory())) {
        throw new Error(`unsafe DevEco Code plugin path: ${path}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  return extensionPath;
}

async function source(local: boolean): Promise<string> {
  return marker + await loadExtensionRuntimeSource("deveco", import.meta.url, local);
}

export async function installDevEcoExtension(options: DevEcoOptions = {}) {
  const extensionPath = await safePath(options);
  const file = await readSettingsFile(extensionPath);
  const previous = file.data?.toString("utf8");
  if (previous !== undefined && !previous.startsWith(marker)) throw new Error(`refusing to replace unowned DevEco Code plugin: ${extensionPath}`);
  const text = await source(Boolean(options.local));
  const backupPath = previous === text ? undefined : await writeSettingsFile(file, text, "preserve");
  return { extensionPath, ...(backupPath ? { backupPath } : {}) };
}

export async function doctorDevEcoExtension(options: DevEcoOptions = {}) {
  const extensionPath = join(configRoot(options), "plugins", "tokenjuice.js");
  const base = { extensionPath, fixCommand: "tokenjuice install deveco",
    advisories: ["DevEco Code support is beta. Doctor checks the plugin file, not native loading or execution. Complete successful Bash results only."],
    checkedPaths: [extensionPath], missingPaths: [] as string[] };
  try {
    const file = await readSettingsFile(await safePath(options));
    if (!file.data) return { ...base, status: "disabled" as const, issues: ["DevEco Code plugin is not installed"], missingPaths: [extensionPath] };
    const text = file.data.toString("utf8");
    if (!text.startsWith(marker)) return { ...base, status: "broken" as const, issues: ["plugin path contains an unowned file"] };
    const issues = text === await source(Boolean(options.local)) ? [] : ["plugin differs from the current bundle; reinstall to refresh"];
    return { ...base, status: issues.length ? "warn" as const : "ok" as const, issues };
  } catch (error) {
    return { ...base, status: "broken" as const, issues: [error instanceof Error ? error.message : String(error)] };
  }
}

export async function uninstallDevEcoExtension(options: DevEcoOptions = {}) {
  const extensionPath = await safePath(options);
  const file = await readSettingsFile(extensionPath);
  if (!file.data?.toString("utf8").startsWith(marker)) return { extensionPath, removed: false };
  return { extensionPath, removed: await removeSettingsFile(file) };
}
