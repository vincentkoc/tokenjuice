import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { buildInstructionDoctorReportFields, instructionDoctorStatusFromIssues } from "../shared/instruction-doctor.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";

export type CrushSkillOptions = {
  projectDir?: string;
};

export type InstallCrushSkillResult = {
  skillPath: string;
  backupPath?: string;
};

export type UninstallCrushSkillResult = {
  skillPath: string;
  removed: boolean;
};

export type CrushDoctorReport = {
  skillPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_CRUSH_FIX_COMMAND = "tokenjuice install crush";
const TOKENJUICE_CRUSH_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_CRUSH_ADVISORY =
  "Crush support is beta and skill-based; it guides command usage but does not intercept or rewrite shell output.";
const TOKENJUICE_CRUSH_REINSTALL_BACKUP_SUFFIX = ".tokenjuice.bak";

function getProjectDir(options: CrushSkillOptions = {}): string {
  return options.projectDir || process.env.CRUSH_PROJECT_DIR || process.cwd();
}

function getDefaultSkillPath(options: CrushSkillOptions = {}): string {
  return join(getProjectDir(options), ".crush", "skills", "tokenjuice", "SKILL.md");
}

const TOKENJUICE_CRUSH_SKILL = [
  "---",
  "name: tokenjuice",
  "description: Use tokenjuice to compact noisy terminal command output while preserving a raw-output escape hatch.",
  "---",
  "",
  `# ${TOKENJUICE_CRUSH_MARKER}`,
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: "- When running terminal commands through Crush, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  "",
  "This skill is guidance-only. Do not rewrite commands that intentionally change Crush shell state, such as `cd`, `export`, `source`, shell option changes, or activation scripts.",
  "",
].join("\n");

async function writeCrushSkillWithoutBackup(skillPath: string): Promise<void> {
  await mkdir(dirname(skillPath), { recursive: true });
  const tempPath = `${skillPath}.tmp`;
  await writeFile(tempPath, TOKENJUICE_CRUSH_SKILL, "utf8");
  await rename(tempPath, skillPath);
}

function isTokenjuiceCrushSkillText(text: string): boolean {
  return text.includes(TOKENJUICE_CRUSH_MARKER)
    || text.includes(TOKENJUICE_WRAP_COMMAND)
    || text.includes(TOKENJUICE_RAW_COMMAND);
}

export async function installCrushSkill(
  skillPath?: string,
  options: CrushSkillOptions = {},
): Promise<InstallCrushSkillResult> {
  const resolvedSkillPath = skillPath ?? getDefaultSkillPath(options);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (existing.exists && isTokenjuiceCrushSkillText(existing.text)) {
    if (existing.text === TOKENJUICE_CRUSH_SKILL) {
      return { skillPath: resolvedSkillPath };
    }

    const primaryBackupPath = `${resolvedSkillPath}.bak`;
    const primaryBackup = await readInstructionFile(primaryBackupPath);
    const backupPath = primaryBackup.exists && !isTokenjuiceCrushSkillText(primaryBackup.text)
      ? `${resolvedSkillPath}${TOKENJUICE_CRUSH_REINSTALL_BACKUP_SUFFIX}`
      : primaryBackupPath;
    await writeFile(backupPath, existing.text, "utf8");
    await writeCrushSkillWithoutBackup(resolvedSkillPath);
    return { skillPath: resolvedSkillPath, backupPath };
  }

  const result = await writeInstructionFile(resolvedSkillPath, TOKENJUICE_CRUSH_SKILL);
  return {
    skillPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallCrushSkill(skillPath = getDefaultSkillPath()): Promise<UninstallCrushSkillResult> {
  const existing = await readInstructionFile(skillPath);
  if (!existing.exists || !isTokenjuiceCrushSkillText(existing.text)) {
    return { skillPath, removed: false };
  }

  const backupPath = `${skillPath}.bak`;
  const backup = await readInstructionFile(backupPath);
  if (backup.exists && !isTokenjuiceCrushSkillText(backup.text)) {
    await rm(skillPath, { force: true });
    await rename(backupPath, skillPath);
    return { skillPath, removed: true };
  }

  const result = await removeInstructionFile(skillPath);
  return { skillPath: result.filePath, removed: result.removed };
}

export async function doctorCrushSkill(
  skillPath?: string,
  options: CrushSkillOptions = {},
): Promise<CrushDoctorReport> {
  const resolvedSkillPath = skillPath ?? getDefaultSkillPath(options);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (!existing.exists) {
    return {
      skillPath: resolvedSkillPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Crush skill is not installed"],
        advisory: TOKENJUICE_CRUSH_ADVISORY,
        fixCommand: TOKENJUICE_CRUSH_FIX_COMMAND,
      }),
    };
  }
  if (!isTokenjuiceCrushSkillText(existing.text)) {
    return {
      skillPath: resolvedSkillPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Crush skill is not installed"],
        advisory: TOKENJUICE_CRUSH_ADVISORY,
        fixCommand: TOKENJUICE_CRUSH_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_CRUSH_MARKER,
        missingIssue: "configured Crush skill does not look like the tokenjuice skill",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Crush skill is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Crush skill is missing the raw escape hatch",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Crush skill still suggests the full escape hatch",
      },
    ],
  });

  return {
    skillPath: resolvedSkillPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_CRUSH_ADVISORY,
      fixCommand: TOKENJUICE_CRUSH_FIX_COMMAND,
    }),
  };
}
