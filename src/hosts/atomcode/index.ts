import { doctorManagedSkill, installManagedSkill, uninstallManagedSkill } from "../shared/managed-skill.js";
import { createProjectDirResolver } from "../shared/project-root.js";

export type AtomCodeSkillOptions = { projectDir?: string };

const resolveProjectDir = createProjectDirResolver("ATOMCODE_PROJECT_DIR");

async function spec(options: AtomCodeSkillOptions) {
  return { rootDir: await resolveProjectDir(options), relativePath: ".atomcode/skills/tokenjuice/SKILL.md",
    hostId: "atomcode", hostLabel: "AtomCode",
    advisory: "AtomCode support is skill-based. Doctor checks the file, not native skill discovery or command execution.",
    fixCommand: "tokenjuice install atomcode",
    wrapBullet: "- For terminal commands likely to produce long output, use `tokenjuice wrap --keep-failures -- <command>` to preserve unsuccessful output." };
}

export async function installAtomCodeSkill(options: AtomCodeSkillOptions = {}) {
  return installManagedSkill(await spec(options));
}

export async function doctorAtomCodeSkill(options: AtomCodeSkillOptions = {}) {
  return doctorManagedSkill(await spec(options));
}

export async function uninstallAtomCodeSkill(options: AtomCodeSkillOptions = {}) {
  return uninstallManagedSkill(await spec(options));
}
