import { doctorManagedSkill, installManagedSkill, uninstallManagedSkill } from "../shared/managed-skill.js";

export type MuseCodeSkillOptions = { projectDir?: string };

function spec(options: MuseCodeSkillOptions = {}) {
  return {
    rootDir: options.projectDir ?? process.cwd(),
    relativePath: ".agents/skills/tokenjuice/SKILL.md",
    hostId: "muse-code", hostLabel: "Muse Code",
    advisory: "Muse Code support is beta and skill-based. Doctor checks the file, not native discovery or execution. Verify the skill and tokenjuice inside Muse Code.",
    wrapBullet: "- For terminal commands likely to produce long output, run `tokenjuice wrap --keep-failures -- <command>` so unsuccessful commands retain their output and exit status.",
    fixCommand: "tokenjuice install muse-code",
  };
}

export function installMuseCodeSkill(options: MuseCodeSkillOptions = {}) {
  return installManagedSkill(spec(options));
}

export function doctorMuseCodeSkill(options: MuseCodeSkillOptions = {}) {
  return doctorManagedSkill(spec(options));
}

export function uninstallMuseCodeSkill(options: MuseCodeSkillOptions = {}) {
  return uninstallManagedSkill(spec(options));
}
