import { doctorManagedSkill, installManagedSkill, uninstallManagedSkill } from "../shared/managed-skill.js";

export type MiniQSkillOptions = { projectDir?: string };

function spec(options: MiniQSkillOptions = {}) {
  return {
    rootDir: options.projectDir ?? process.cwd(),
    relativePath: ".miniq/skills/tokenjuice/SKILL.md",
    hostId: "miniq", hostLabel: "miniQ",
    advisory: "miniQ guidance skill: doctor checks the local file only. Verify the skill is enabled in miniQ and tokenjuice is available in its execution environment.",
    fixCommand: "tokenjuice install miniq",
  };
}

export function installMiniQSkill(options: MiniQSkillOptions = {}) {
  return installManagedSkill(spec(options));
}

export function doctorMiniQSkill(options: MiniQSkillOptions = {}) {
  return doctorManagedSkill(spec(options));
}

export function uninstallMiniQSkill(options: MiniQSkillOptions = {}) {
  return uninstallManagedSkill(spec(options));
}
