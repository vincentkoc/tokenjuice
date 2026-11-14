import { homedir } from "node:os";
import { join } from "node:path";
import { doctorManagedSkill, installManagedSkill, uninstallManagedSkill } from "../shared/managed-skill.js";

export type MisterMorphSkillOptions = { homeDir?: string; stateDir?: string };

function spec(options: MisterMorphSkillOptions = {}) {
  return {
    rootDir: options.stateDir ?? (process.env.MISTER_MORPH_FILE_STATE_DIR || join(options.homeDir ?? homedir(), ".morph")),
    relativePath: "skills/tokenjuice/SKILL.md",
    hostId: "mister-morph", hostLabel: "Mister Morph",
    advisory: "Mister Morph support is a guidance skill. Doctor checks the file, not live skill discovery or execution. Enable Bash and select this skill with --skill tokenjuice or $tokenjuice. Custom skill roots require an explicit path.",
    fixCommand: "tokenjuice install mister-morph",
    wrapBullet: "- For terminal commands likely to produce long output, use `tokenjuice wrap --keep-failures -- <command>` so failed stdout, stderr and status remain intact.",
  };
}

export function installMisterMorphSkill(options: MisterMorphSkillOptions = {}) {
  return installManagedSkill(spec(options));
}

export function doctorMisterMorphSkill(options: MisterMorphSkillOptions = {}) {
  return doctorManagedSkill(spec(options));
}

export function uninstallMisterMorphSkill(options: MisterMorphSkillOptions = {}) {
  return uninstallManagedSkill(spec(options));
}
