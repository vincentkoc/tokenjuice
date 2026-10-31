import { realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { findAvailableBackupPath, writeTextFileWithoutBackup } from "../shared/instruction-file.js";

import { createSymlinkGuard, rejectSymlinkPathComponents, isInsideOrEqual, realpathExistingAncestor } from "../shared/path-ancestors.js";

import { createProjectDirResolver } from "../shared/project-root.js";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type EcaSkillOptions = {
  projectDir?: string;
};

export type InstallEcaSkillResult = {
  skillPath: string;
  backupPath?: string;
};

export type UninstallEcaSkillResult = {
  skillPath: string;
  removed: boolean;
};

export type EcaDoctorReport = {
  skillPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_ECA_FIX_COMMAND = "tokenjuice install eca";
const TOKENJUICE_ECA_OWNERSHIP_MARKER = "<!-- tokenjuice:eca-skill -->";
const TOKENJUICE_ECA_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:eca-restore-backup=";
const TOKENJUICE_ECA_SKILL_MARKER = "# tokenjuice terminal output compaction";
const TOKENJUICE_ECA_FRONTMATTER = [
  "---",
  "name: tokenjuice",
  'description: "Use tokenjuice to compact noisy terminal output in ECA workspaces."',
  "---",
].join("\n");
const TOKENJUICE_ECA_ADVISORY =
  "ECA support is beta and skill-based; ECA discovers .eca/skills/tokenjuice/SKILL.md when loading project skills, but tokenjuice does not intercept shell output.";

function isTokenjuiceEcaSkillText(text: string): boolean {
  return text.includes(TOKENJUICE_ECA_OWNERSHIP_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/^<!-- tokenjuice:eca-restore-backup=(\.bak(?:\.\d+)?) -->$/mu);
  return match?.[1];
}

const resolveProjectDir = createProjectDirResolver("ECA_PROJECT_DIR");

function getExpectedSkillPath(projectDir: string): string {
  return join(projectDir, ".eca", "skills", "tokenjuice", "SKILL.md");
}

const rejectSkillSymlink = createSymlinkGuard(
  (filePath) => `cannot use eca skill ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectSkillSymlink(`${filePath}.bak`);
  await rejectSkillSymlink(`${filePath}.tmp`);
}

async function resolveSafeProjectSkillPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  if (projectDir !== realProjectDir) {
    throw new Error(`cannot use eca skill ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use eca skill ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectSkillSymlink(projectDir);
  await rejectSymlinkPathComponents(
    resolvedPath,
    projectDir,
    `cannot use eca skill ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`,
  );
  await rejectSkillSymlink(resolvedPath);
  const expectedSkillPath = getExpectedSkillPath(projectDir);
  if (resolvedPath !== expectedSkillPath) {
    throw new Error(`cannot use eca skill ${resolvedPath}; tokenjuice only installs the project-local .eca/skills/tokenjuice/SKILL.md skill`);
  }
  return resolvedPath;
}

async function getDefaultSkillPath(options: EcaSkillOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  // ECA docs list project .eca/skills as a native skill directory.
  return resolveSafeProjectSkillPath(getExpectedSkillPath(projectDir), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: EcaSkillOptions = {}): Promise<string> {
  return getExpectedSkillPath(await resolveProjectDir(options));
}

async function resolveSkillPath(skillPath?: string, options: EcaSkillOptions = {}): Promise<string> {
  if (skillPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectSkillPath(skillPath, projectDir, realProjectDir);
  }
  return getDefaultSkillPath(options);
}

function buildEcaSkill(
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): string {
  return [
    TOKENJUICE_ECA_FRONTMATTER,
    TOKENJUICE_ECA_OWNERSHIP_MARKER,
    ...(restoreBackupSuffix
      ? [`${TOKENJUICE_ECA_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix} -->`]
      : []),
    "",
    "# tokenjuice terminal output compaction",
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        "- When ECA runs terminal commands likely to produce long output through `eca__shell_command`, prefer `tokenjuice wrap -- <command>`.",
    }),
    "- ECA discovers this reusable skill from `.eca/skills/tokenjuice/SKILL.md` and still owns shell execution and tool output delivery.",
    "",
  ].join("\n");
}

export async function installEcaSkill(
  skillPath?: string,
  options: EcaSkillOptions = {},
): Promise<InstallEcaSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  await rejectInstallSidecarSymlinks(resolvedSkillPath);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (existing.exists && isTokenjuiceEcaSkillText(existing.text)) {
    const nextSkill = buildEcaSkill({ restoreBackupSuffix: readRestoreBackupSuffix(existing.text) });
    if (existing.text === nextSkill) {
      return { skillPath: resolvedSkillPath };
    }
    const result = await writeInstructionFile(resolvedSkillPath, nextSkill);
    return {
      skillPath: result.filePath,
      ...(result.backupPath ? { backupPath: result.backupPath } : {}),
    };
  }

  if (existing.exists) {
    const backupPath = await findAvailableBackupPath(resolvedSkillPath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx" });
    await writeTextFileWithoutBackup(
      resolvedSkillPath,
      buildEcaSkill({ restoreBackupSuffix: backupPath.slice(resolvedSkillPath.length) }),
    );
    return { skillPath: resolvedSkillPath, backupPath };
  }

  await writeTextFileWithoutBackup(resolvedSkillPath, buildEcaSkill());
  return { skillPath: resolvedSkillPath };
}

export async function uninstallEcaSkill(
  skillPath?: string,
  options: EcaSkillOptions = {},
): Promise<UninstallEcaSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (!existing.exists || !isTokenjuiceEcaSkillText(existing.text)) {
    return { skillPath: resolvedSkillPath, removed: false };
  }
  const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
  if (restoreBackupSuffix) {
    const backupPath = `${resolvedSkillPath}${restoreBackupSuffix}`;
    await rejectSkillSymlink(backupPath);
    const backup = await readInstructionFile(backupPath);
    if (backup.exists && !isTokenjuiceEcaSkillText(backup.text)) {
      await rm(resolvedSkillPath, { force: true });
      await rename(backupPath, resolvedSkillPath);
      return { skillPath: resolvedSkillPath, removed: true };
    }
  }
  const result = await removeInstructionFile(resolvedSkillPath);
  return { skillPath: result.filePath, removed: result.removed };
}

export async function doctorEcaSkill(
  skillPath?: string,
  options: EcaSkillOptions = {},
): Promise<EcaDoctorReport> {
  let resolvedSkillPath: string;
  try {
    resolvedSkillPath = await resolveSkillPath(skillPath, options);
  } catch (error) {
    const aliasPath = skillPath ?? (await getDefaultAliasPath(options));
    return {
      skillPath: aliasPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_ECA_ADVISORY,
        fixCommand: (error as Error).message.includes("outside") || (error as Error).message.includes("only installs")
          ? "use a project-local .eca/skills/tokenjuice/SKILL.md path, then run tokenjuice install eca"
          : "replace symlinked eca skill with a regular project file, then run tokenjuice install eca",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedSkillPath);
  const hasTokenjuiceMarker = isTokenjuiceEcaSkillText(existing.text);
  if (!existing.exists) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice eca skill is not installed"],
        advisory: TOKENJUICE_ECA_ADVISORY,
        fixCommand: TOKENJUICE_ECA_FIX_COMMAND,
      }),
    };
  }
  if (!hasTokenjuiceMarker) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice eca skill is not installed; existing skill file is not tokenjuice-managed"],
        advisory: TOKENJUICE_ECA_ADVISORY,
        fixCommand: TOKENJUICE_ECA_FIX_COMMAND,
      }),
    };
  }

  const issues = [
    ...(existing.text.startsWith(`${TOKENJUICE_ECA_FRONTMATTER}\n`)
      ? []
      : ["configured eca skill is missing leading discovery frontmatter"]),
    ...collectGuidanceIssues(existing.text, {
      required: [
        {
          requiredText: TOKENJUICE_ECA_OWNERSHIP_MARKER,
          missingIssue: "configured eca skill is missing the tokenjuice ownership marker",
        },
        {
          requiredText: "name: tokenjuice",
          missingIssue: "configured eca skill is missing the required tokenjuice skill name",
        },
        {
          requiredText: TOKENJUICE_ECA_FRONTMATTER,
          missingIssue: "configured eca skill is missing discovery frontmatter",
        },
        {
          requiredText: TOKENJUICE_ECA_SKILL_MARKER,
          missingIssue: "configured eca skill does not look like the tokenjuice skill",
        },
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured eca skill is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured eca skill is missing the raw escape hatch",
        },
        {
          requiredText: ".eca/skills/tokenjuice/SKILL.md",
          missingIssue: "configured eca skill is missing workspace skill path guidance",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured eca skill still suggests the full escape hatch",
        },
      ],
    }),
  ];

  return {
    skillPath: resolvedSkillPath,
    hasTokenjuiceMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_ECA_ADVISORY,
      fixCommand: TOKENJUICE_ECA_FIX_COMMAND,
    }),
  };
}
