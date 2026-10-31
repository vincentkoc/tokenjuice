import { access, lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readSettingsFile, removeSettingsFile, writeSettingsFile } from "../../shared/settings-file.js";

export type OpenCodeV2Options = { configDir?: string; local?: boolean };
const marker = "// tokenjuice:opencode-v2\n";

function configRoot(options: OpenCodeV2Options): string {
  return resolve(options.configDir ?? (process.env.OPENCODE_CONFIG_DIR?.trim()
    || join(process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "opencode")));
}

async function safePath(options: OpenCodeV2Options): Promise<string> {
  const root = configRoot(options);
  const extensionPath = join(root, "plugins", "tokenjuice-v2", "index.js");
  for (const path of [root, join(root, "plugins"), join(root, "plugins", "tokenjuice-v2"), extensionPath]) {
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || (path === extensionPath ? !stats.isFile() || stats.nlink !== 1 : !stats.isDirectory())) {
        throw new Error(`unsafe OpenCode V2 plugin path: ${path}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  return extensionPath;
}

async function source(local: boolean): Promise<string> {
  if (!local) {
    try {
      return marker + await readFile(new URL("./bundle/index.js", import.meta.url), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const candidates = [new URL("./runtime.ts", import.meta.url), new URL("../../../../src/hosts/opencode/v2/runtime.ts", import.meta.url)];
  let entryPoint: string | undefined;
  for (const candidate of candidates) {
    try { await access(candidate); entryPoint = fileURLToPath(candidate); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  if (!entryPoint) throw new Error("OpenCode V2 runtime source is unavailable; use the shipped bundle outside a source checkout");
  const { build } = await import("esbuild");
  const built = await build({ entryPoints: [entryPoint],
    bundle: true, format: "esm", platform: "node", target: "node22", write: false });
  const text = built.outputFiles[0]?.text;
  if (!text) throw new Error("OpenCode V2 runtime bundling produced no output");
  return marker + text;
}

export async function installOpenCodeV2Extension(options: OpenCodeV2Options = {}) {
  const extensionPath = await safePath(options);
  const file = await readSettingsFile(extensionPath);
  const previous = file.data?.toString("utf8");
  if (previous !== undefined && !previous.startsWith(marker)) throw new Error(`refusing to replace unowned OpenCode V2 plugin: ${extensionPath}`);
  const text = await source(Boolean(options.local));
  const backupPath = previous === text ? undefined : await writeSettingsFile(file, text, "preserve");
  return { extensionPath, ...(backupPath ? { backupPath } : {}) };
}

export async function doctorOpenCodeV2Extension(options: OpenCodeV2Options = {}) {
  const extensionPath = join(configRoot(options), "plugins", "tokenjuice-v2", "index.js");
  const base = { extensionPath, fixCommand: "tokenjuice install opencode-v2",
    advisories: ["OpenCode V2 support is beta, pinned to v2.0.18. Doctor checks the plugin file, not server loading or execution."],
    checkedPaths: [extensionPath], missingPaths: [] as string[] };
  try {
    const file = await readSettingsFile(await safePath(options));
    if (!file.data) return { ...base, status: "disabled" as const, issues: ["OpenCode V2 plugin is not installed"], missingPaths: [extensionPath] };
    const text = file.data.toString("utf8");
    if (!text.startsWith(marker)) return { ...base, status: "broken" as const, issues: ["plugin path contains an unowned file"] };
    const issues = text === await source(Boolean(options.local)) ? [] : ["plugin differs from the current bundle; reinstall to refresh"];
    return { ...base, status: issues.length ? "warn" as const : "ok" as const, issues };
  } catch (error) {
    return { ...base, status: "broken" as const, issues: [error instanceof Error ? error.message : String(error)] };
  }
}

export async function uninstallOpenCodeV2Extension(options: OpenCodeV2Options = {}) {
  const extensionPath = await safePath(options);
  const file = await readSettingsFile(extensionPath);
  if (!file.data?.toString("utf8").startsWith(marker)) return { extensionPath, removed: false };
  return { extensionPath, removed: await removeSettingsFile(file) };
}
