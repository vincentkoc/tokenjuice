import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { readInstructionFile } from "../shared/instruction-file.js";

import { createProjectInstructionPathResolver, createSymlinkGuard } from "../shared/path-ancestors.js";


import { collectTokenjuiceGuidanceIssues, buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import {
  type PathDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

import { createRestorableSkillCommands } from "../shared/restorable-skill.js";

export type NanobotSkillOptions = {
  workspaceDir?: string;
};

export type InstallNanobotSkillResult = {
  skillPath: string;
  backupPath?: string;
};

export type UninstallNanobotSkillResult = {
  skillPath: string;
  removed: boolean;
};

export type NanobotDoctorReport = PathDoctorReport<"skillPath"> & {
  hasTokenjuiceMarker: boolean;
};

const TOKENJUICE_NANOBOT_FIX_COMMAND = "tokenjuice install nanobot";
const TOKENJUICE_NANOBOT_OWNERSHIP_MARKER = "<!-- tokenjuice:nanobot-skill -->";
const TOKENJUICE_NANOBOT_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:nanobot-restore-backup=";
const TOKENJUICE_NANOBOT_SKILL_MARKER = "# tokenjuice terminal output compaction";
const TOKENJUICE_NANOBOT_FRONTMATTER = [
  "---",
  "name: tokenjuice",
  'description: "Use tokenjuice to compact noisy terminal output in nanobot workspaces."',
  "---",
].join("\n");
const TOKENJUICE_NANOBOT_ADVISORY =
  "nanobot support is beta and skill-based; nanobot discovers skills/tokenjuice/SKILL.md when loading workspace skills, but tokenjuice does not intercept shell output.";

function isTokenjuiceNanobotSkillText(text: string): boolean {
  return text.includes(TOKENJUICE_NANOBOT_OWNERSHIP_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/^<!-- tokenjuice:nanobot-restore-backup=(\.bak(?:\.\d+)?) -->$/mu);
  return match?.[1];
}

async function resolveProjectDir(options: NanobotSkillOptions = {}): Promise<string> {
  return resolve(options.workspaceDir || process.env.NANOBOT_WORKSPACE || join(homedir(), ".nanobot", "workspace"));
}

function getExpectedSkillPath(projectDir: string): string {
  return join(projectDir, "skills", "tokenjuice", "SKILL.md");
}

const rejectSkillSymlink = createSymlinkGuard(
  (filePath) => `cannot use nanobot skill ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectSkillSymlink(`${filePath}.bak`);
  await rejectSkillSymlink(`${filePath}.tmp`);
}

const resolveProjectSkillPath = createProjectInstructionPathResolver(
  "nanobot skill",
  rejectSkillSymlink,
);

async function resolveSafeProjectSkillPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = await resolveProjectSkillPath(filePath, projectDir, realProjectDir);
  const expectedSkillPath = getExpectedSkillPath(projectDir);
  if (resolvedPath !== expectedSkillPath) {
    throw new Error(`cannot use nanobot skill ${resolvedPath}; tokenjuice only installs the workspace-local skills/tokenjuice/SKILL.md skill`);
  }
  return resolvedPath;
}

async function getDefaultSkillPath(options: NanobotSkillOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  // nanobot's SkillsLoader resolves skills relative to its configured workspace.
  return resolveSafeProjectSkillPath(getExpectedSkillPath(projectDir), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: NanobotSkillOptions = {}): Promise<string> {
  return getExpectedSkillPath(await resolveProjectDir(options));
}

async function resolveSkillPath(skillPath?: string, options: NanobotSkillOptions = {}): Promise<string> {
  if (skillPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectSkillPath(skillPath, projectDir, realProjectDir);
  }
  return getDefaultSkillPath(options);
}

function buildNanobotSkill(
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): string {
  return [
    TOKENJUICE_NANOBOT_FRONTMATTER,
    TOKENJUICE_NANOBOT_OWNERSHIP_MARKER,
    ...(restoreBackupSuffix
      ? [`${TOKENJUICE_NANOBOT_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix} -->`]
      : []),
    "",
    "# tokenjuice terminal output compaction",
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        "- When nanobot runs terminal commands likely to produce long output through `exec`, prefer `tokenjuice wrap -- <command>`.",
    }),
    "- Use `tokenjuice wrap --keep-failures -- <command>` to retain complete failure output.",
    "- Keep shell-state changes such as cd, export, source, and activation scripts in the native shell instead of wrapping them.",
    "- nanobot discovers this reusable skill from `skills/tokenjuice/SKILL.md` and still owns shell execution and tool output delivery.",
    "",
  ].join("\n");
}

const skillCommands = createRestorableSkillCommands({
  buildSkill: buildNanobotSkill,
  isManagedText: isTokenjuiceNanobotSkillText,
  readRestoreBackupSuffix,
  rejectSkillSymlink,
  rejectInstallSidecarSymlinks,
});

export async function installNanobotSkill(
  skillPath?: string,
  options: NanobotSkillOptions = {},
): Promise<InstallNanobotSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  return skillCommands.install(resolvedSkillPath);
}

export async function uninstallNanobotSkill(
  skillPath?: string,
  options: NanobotSkillOptions = {},
): Promise<UninstallNanobotSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  return skillCommands.uninstall(resolvedSkillPath);
}

export async function doctorNanobotSkill(
  skillPath?: string,
  options: NanobotSkillOptions = {},
): Promise<NanobotDoctorReport> {
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
        advisory: TOKENJUICE_NANOBOT_ADVISORY,
        fixCommand: (error as Error).message.includes("outside") || (error as Error).message.includes("only installs")
          ? "use a workspace-local skills/tokenjuice/SKILL.md path, then run tokenjuice install nanobot"
          : "replace symlinked nanobot skill with a regular project file, then run tokenjuice install nanobot",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedSkillPath);
  const hasTokenjuiceMarker = isTokenjuiceNanobotSkillText(existing.text);
  if (!existing.exists) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice nanobot skill is not installed"],
        advisory: TOKENJUICE_NANOBOT_ADVISORY,
        fixCommand: TOKENJUICE_NANOBOT_FIX_COMMAND,
      }),
    };
  }
  if (!hasTokenjuiceMarker) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice nanobot skill is not installed; existing skill file is not tokenjuice-managed"],
        advisory: TOKENJUICE_NANOBOT_ADVISORY,
        fixCommand: TOKENJUICE_NANOBOT_FIX_COMMAND,
      }),
    };
  }

  const issues = [
    ...(existing.text.startsWith(`${TOKENJUICE_NANOBOT_FRONTMATTER}\n`)
      ? []
      : ["configured nanobot skill is missing leading discovery frontmatter"]),
    ...collectTokenjuiceGuidanceIssues(existing.text, {
      configuredLabel: "nanobot skill",
      singular: true,
      additionalRequired: [
        {
          requiredText: TOKENJUICE_NANOBOT_OWNERSHIP_MARKER,
          missingIssue: "configured nanobot skill is missing the tokenjuice ownership marker",
        },
        {
          requiredText: "name: tokenjuice",
          missingIssue: "configured nanobot skill is missing the required tokenjuice skill name",
        },
        {
          requiredText: TOKENJUICE_NANOBOT_FRONTMATTER,
          missingIssue: "configured nanobot skill is missing discovery frontmatter",
        },
        {
          requiredText: TOKENJUICE_NANOBOT_SKILL_MARKER,
          missingIssue: "configured nanobot skill does not look like the tokenjuice skill",
        },
      ],
      additionalRequiredAfter: [
        {
          requiredText: "skills/tokenjuice/SKILL.md",
          missingIssue: "configured nanobot skill is missing workspace skill path guidance",
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
      advisory: TOKENJUICE_NANOBOT_ADVISORY,
      fixCommand: TOKENJUICE_NANOBOT_FIX_COMMAND,
    }),
  };
}
