import { homedir } from "node:os";
import { join } from "node:path";
import { doctorManagedSkill, installManagedSkill, uninstallManagedSkill } from "../shared/managed-skill.js";

export type PaimonSkillOptions = { homeDir?: string; configDir?: string };

function spec(options: PaimonSkillOptions = {}) {
  return {
    rootDir: options.configDir ?? (process.env.PAIMON_CONFIG_HOME || join(options.homeDir ?? homedir(), ".config", "paimon")),
    relativePath: "skills/tokenjuice/SKILL.md",
    hostId: "paimon", hostLabel: "Paimon",
    advisory: "Paimon support is a guidance skill. Doctor checks the file, not live skill discovery or execution. Explicit paths and project skills can shadow this user skill.",
    fixCommand: "tokenjuice install paimon",
    wrapBullet: "- For terminal commands likely to produce long output, use `tokenjuice wrap --keep-failures -- <command>` so failed stdout, stderr and status remain intact.",
  };
}

export function installPaimonSkill(options: PaimonSkillOptions = {}) {
  return installManagedSkill(spec(options));
}

export function doctorPaimonSkill(options: PaimonSkillOptions = {}) {
  return doctorManagedSkill(spec(options));
}

export function uninstallPaimonSkill(options: PaimonSkillOptions = {}) {
  return uninstallManagedSkill(spec(options));
}
