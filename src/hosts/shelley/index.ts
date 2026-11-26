import { homedir } from "node:os";
import { join } from "node:path";
import { doctorManagedSkill, installManagedSkill, uninstallManagedSkill } from "../shared/managed-skill.js";

export type ShelleySkillOptions = { homeDir?: string };

function spec(options: ShelleySkillOptions = {}) {
  return {
    rootDir: join(options.homeDir ?? homedir(), ".config", "shelley"),
    relativePath: "tokenjuice/SKILL.md",
    hostId: "shelley", hostLabel: "Shelley",
    advisory: "Shelley support is a guidance skill. Doctor checks the file, not live skill discovery or execution. Shelley must run with the same home directory to discover this user skill.",
    fixCommand: "tokenjuice install shelley",
    wrapBullet: "- For terminal commands likely to produce long output, use `tokenjuice wrap --keep-failures -- <command>` so failed stdout, stderr and status remain intact.",
  };
}

export function installShelleySkill(options: ShelleySkillOptions = {}) {
  return installManagedSkill(spec(options));
}

export function doctorShelleySkill(options: ShelleySkillOptions = {}) {
  return doctorManagedSkill(spec(options));
}

export function uninstallShelleySkill(options: ShelleySkillOptions = {}) {
  return uninstallManagedSkill(spec(options));
}
