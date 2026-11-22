import { lstat, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { buildTokenjuiceGuidanceBullets } from "./instruction-guidance.js";
import { readSettingsFile, writeSettingsFile } from "./settings-file.js";

export type ManagedSkillSpec = {
  rootDir: string;
  relativePath: string;
  hostId: string;
  hostLabel: string;
  advisory: string;
  fixCommand: string;
};

function marker(spec: ManagedSkillSpec): string {
  return `<!-- tokenjuice:${spec.hostId} skill -->`;
}

export function buildManagedSkill(spec: ManagedSkillSpec): string {
  return ["---", "name: tokenjuice",
    `description: ${JSON.stringify(`Compact noisy terminal output when using ${spec.hostLabel}.`)}`,
    "---", "", marker(spec), "# tokenjuice terminal output compaction", "",
    "- Before wrapping a command, run `tokenjuice --version` inside the actual tool execution environment. In Bash, also check `command -v tokenjuice`.",
    "- If tokenjuice is unavailable there, report the missing dependency. A desktop installation does not establish availability inside a VM, container or remote shell.",
    ...buildTokenjuiceGuidanceBullets(),
    "- These instructions guide command selection; the host retains execution and approval decisions.", "",
  ].join("\n");
}

async function safePath(spec: ManagedSkillSpec): Promise<string> {
  const root = resolve(spec.rootDir);
  const path = resolve(root, spec.relativePath);
  const suffix = relative(root, path);
  if (!suffix || isAbsolute(suffix) || suffix.split(sep).includes("..") || !path.endsWith(`${sep}SKILL.md`)) {
    throw new Error("managed skill path must be a SKILL.md below its configured root");
  }
  let current = root;
  for (const component of ["", ...suffix.split(sep)]) {
    current = join(current, component);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink() || (current === path ? !stats.isFile() || stats.nlink !== 1 : !stats.isDirectory())) {
        throw new Error(`unsafe managed skill path: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  return path;
}

function owns(text: string, spec: ManagedSkillSpec): boolean {
  return text.split(/\r?\n/u).includes(marker(spec));
}

export async function installManagedSkill(spec: ManagedSkillSpec) {
  const skillPath = await safePath(spec);
  const file = await readSettingsFile(skillPath);
  const existing = file.data?.toString("utf8");
  if (existing !== undefined && !owns(existing, spec)) {
    throw new Error(`refusing to replace an unowned skill at ${skillPath}`);
  }
  const text = buildManagedSkill(spec);
  const backupPath = existing === text ? undefined : await writeSettingsFile(file, text, "preserve");
  return { skillPath, ...(backupPath ? { backupPath } : {}) };
}

export async function uninstallManagedSkill(spec: ManagedSkillSpec) {
  const skillPath = await safePath(spec);
  const file = await readSettingsFile(skillPath);
  if (!file.data || !owns(file.data.toString("utf8"), spec)) return { skillPath, removed: false };
  // Recheck file identity/content before removing the owned file; keep its directory and siblings.
  const current = await readSettingsFile(await safePath(spec));
  if (current.metadata?.ino !== file.metadata?.ino || current.metadata?.dev !== file.metadata?.dev
    || !current.data?.equals(file.data)) throw new Error(`skill changed while uninstalling ${skillPath}`);
  await unlink(skillPath);
  return { skillPath, removed: true };
}

export async function doctorManagedSkill(spec: ManagedSkillSpec) {
  const skillPath = resolve(spec.rootDir, spec.relativePath);
  const base = { skillPath, fixCommand: spec.fixCommand, advisories: [spec.advisory],
    checkedPaths: [skillPath], missingPaths: [] as string[] };
  try {
    const file = await readSettingsFile(await safePath(spec));
    if (!file.data) return { ...base, status: "disabled" as const,
      issues: [`tokenjuice ${spec.hostLabel} skill is not installed`], missingPaths: [skillPath] };
    const text = file.data.toString("utf8");
    if (!owns(text, spec)) return { ...base, status: "broken" as const, issues: ["skill path contains an unowned file; preserve or move it before installing"] };
    const issues = text === buildManagedSkill(spec) ? [] : ["managed skill differs from the current guidance; reinstall to refresh it"];
    return { ...base, status: issues.length ? "warn" as const : "ok" as const, issues };
  } catch (error) {
    return { ...base, status: "broken" as const, issues: [error instanceof Error ? error.message : String(error)] };
  }
}
