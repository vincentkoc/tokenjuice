import { lstat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadExtensionRuntimeSource } from "../shared/bundle-runtime.js";
import { readSettingsFile, writeSettingsFile } from "../shared/settings-file.js";

const MARKER = "// tokenjuice:omo native extension";
const FIX_COMMAND = "tokenjuice install omo";
export type OmoExtensionOptions = { local?: boolean; agentDir?: string };

export function getOmoExtensionPath(options: OmoExtensionOptions = {}): string {
  const agentDir = options.agentDir ?? [process.env.OMO_CODING_AGENT_DIR, process.env.SENPI_CODING_AGENT_DIR,
    process.env.PI_CODING_AGENT_DIR].find((value) => value?.trim());
  return join(resolve(agentDir?.trim() || join(homedir(), ".omo", "agent")), "extensions", "tokenjuice.js");
}

async function assertSafePath(path: string): Promise<void> {
  let current = resolve(path);
  while (true) {
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || (current === resolve(path) && (!stat.isFile() || stat.nlink !== 1))) {
        throw new Error(`unsafe OmO extension path: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function owns(text: string): boolean {
  return text.startsWith(`${MARKER}\n`);
}

export async function installOmoExtension(options: OmoExtensionOptions = {}) {
  const extensionPath = getOmoExtensionPath(options);
  await assertSafePath(extensionPath);
  const file = await readSettingsFile(extensionPath);
  if (file.data && !owns(file.data.toString("utf8"))) throw new Error(`refusing to replace an unowned OmO extension: ${extensionPath}`);
  const text = `${MARKER}\n${await loadExtensionRuntimeSource("omo", import.meta.url, options.local)}\n`;
  const backupPath = file.data?.toString("utf8") === text ? undefined : await writeSettingsFile(file, text, "preserve");
  return { extensionPath, ...(backupPath ? { backupPath } : {}) };
}

export async function uninstallOmoExtension(options: OmoExtensionOptions = {}) {
  const extensionPath = getOmoExtensionPath(options);
  await assertSafePath(extensionPath);
  const file = await readSettingsFile(extensionPath);
  if (!file.data || !owns(file.data.toString("utf8"))) return { extensionPath, removed: false };
  const current = await readSettingsFile(extensionPath);
  if (current.metadata?.ino !== file.metadata?.ino || current.metadata?.dev !== file.metadata?.dev
    || !current.data?.equals(file.data)) throw new Error("OmO extension changed while uninstalling; retry");
  await unlink(extensionPath);
  return { extensionPath, removed: true };
}

export async function doctorOmoExtension(options: OmoExtensionOptions = {}) {
  const extensionPath = getOmoExtensionPath(options);
  const base = { extensionPath, fixCommand: FIX_COMMAND, checkedPaths: [extensionPath], missingPaths: [] as string[],
    advisories: ["OmO native extension: file validation only; this command does not verify live loading or model-visible delivery."],
    hasTokenjuiceMarker: false };
  try {
    await assertSafePath(extensionPath);
    const file = await readSettingsFile(extensionPath);
    if (!file.data) return { ...base, status: "disabled" as const, issues: [], missingPaths: [extensionPath] };
    base.hasTokenjuiceMarker = owns(file.data.toString("utf8"));
    if (!base.hasTokenjuiceMarker) return { ...base, status: "warn" as const, issues: ["extension path contains an unowned file"] };
    const expected = `${MARKER}\n${await loadExtensionRuntimeSource("omo", import.meta.url, options.local)}\n`;
    const issues = file.data.toString("utf8") !== expected ? ["installed extension differs from the current runtime; reinstall"] : [];
    return { ...base, status: issues.length ? "warn" as const : "ok" as const, issues };
  } catch (error) {
    return { ...base, status: "broken" as const, issues: [error instanceof Error ? error.message : String(error)] };
  }
}
