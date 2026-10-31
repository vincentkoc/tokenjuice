import { homedir } from "node:os";
import { doctorManagedSkill, installManagedSkill, uninstallManagedSkill } from "../shared/managed-skill.js";

export type QwenWorkSkillOptions = { homeDir?: string };

function spec(options: QwenWorkSkillOptions = {}) {
  return {
    rootDir: options.homeDir ?? homedir(),
    relativePath: ".qwenwork/skills/tokenjuice/SKILL.md",
    hostId: "qwenwork", hostLabel: "QwenWork",
    advisory: "QwenWork support is beta and skill-based. Doctor checks the file, not live skill discovery or execution. Verify tokenjuice inside the tool environment.",
    fixCommand: "tokenjuice install qwenwork",
  };
}

export function installQwenWorkSkill(options: QwenWorkSkillOptions = {}) {
  return installManagedSkill(spec(options));
}

export function doctorQwenWorkSkill(options: QwenWorkSkillOptions = {}) {
  return doctorManagedSkill(spec(options));
}

export function uninstallQwenWorkSkill(options: QwenWorkSkillOptions = {}) {
  return uninstallManagedSkill(spec(options));
}
