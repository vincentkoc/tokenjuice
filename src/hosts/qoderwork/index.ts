import { homedir } from "node:os";
import { doctorManagedSkill, installManagedSkill, uninstallManagedSkill } from "../shared/managed-skill.js";

export type QoderWorkSkillOptions = { homeDir?: string };

function spec(options: QoderWorkSkillOptions = {}) {
  return {
    rootDir: options.homeDir ?? homedir(),
    relativePath: ".qoderwork/skills/tokenjuice/SKILL.md",
    hostId: "qoderwork", hostLabel: "QoderWork",
    advisory: "QoderWork support is beta and skill-based. Doctor checks the file, not live skill discovery or execution. Verify tokenjuice inside the tool environment.",
    fixCommand: "tokenjuice install qoderwork",
  };
}

export function installQoderWorkSkill(options: QoderWorkSkillOptions = {}) {
  return installManagedSkill(spec(options));
}

export function doctorQoderWorkSkill(options: QoderWorkSkillOptions = {}) {
  return doctorManagedSkill(spec(options));
}

export function uninstallQoderWorkSkill(options: QoderWorkSkillOptions = {}) {
  return uninstallManagedSkill(spec(options));
}
