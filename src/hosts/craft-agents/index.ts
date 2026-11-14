import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { doctorManagedSkill, installManagedSkill, uninstallManagedSkill } from "../shared/managed-skill.js";

export type CraftAgentsSkillOptions = { workspaceDir?: string };

const FIX_COMMAND = "tokenjuice install craft-agents <workspace-dir>";
const ADVISORY = "Craft Agents support is skill-based. Doctor checks the selected workspace file, not native skill discovery or command execution.";

function selectedWorkspace(options: CraftAgentsSkillOptions): string | undefined {
  return options.workspaceDir ?? process.env.TOKENJUICE_CRAFT_WORKSPACE;
}

async function spec(options: CraftAgentsSkillOptions) {
  const selected = selectedWorkspace(options);
  if (!selected?.trim()) throw new Error("select an existing Craft Agents workspace directory: " + FIX_COMMAND);
  const rootDir = resolve(selected);
  const stats = await lstat(rootDir);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("Craft Agents workspace must be an existing, non-symlink directory");
  }
  return { rootDir, relativePath: "skills/tokenjuice/SKILL.md", hostId: "craft-agents",
    hostLabel: "Craft Agents", advisory: ADVISORY, fixCommand: FIX_COMMAND,
    wrapBullet: "- For terminal commands likely to produce long output, use `tokenjuice wrap --keep-failures -- <command>` to preserve unsuccessful output." };
}

export async function installCraftAgentsSkill(options: CraftAgentsSkillOptions = {}) {
  return installManagedSkill(await spec(options));
}

export async function doctorCraftAgentsSkill(options: CraftAgentsSkillOptions = {}) {
  if (!selectedWorkspace(options)?.trim()) {
    // There is no default workspace: aggregate doctor must not guess one.
    return { skillPath: "", status: "disabled" as const,
      issues: ["no Craft Agents workspace selected"], advisories: [ADVISORY],
      checkedPaths: [], missingPaths: [], fixCommand: FIX_COMMAND };
  }
  try {
    return await doctorManagedSkill(await spec(options));
  } catch (error) {
    return { skillPath: resolve(selectedWorkspace(options)!, "skills/tokenjuice/SKILL.md"),
      status: "broken" as const, issues: [error instanceof Error ? error.message : String(error)],
      advisories: [ADVISORY], checkedPaths: [join(resolve(selectedWorkspace(options)!), "skills/tokenjuice/SKILL.md")],
      missingPaths: [], fixCommand: FIX_COMMAND };
  }
}

export async function uninstallCraftAgentsSkill(options: CraftAgentsSkillOptions = {}) {
  return uninstallManagedSkill(await spec(options));
}
