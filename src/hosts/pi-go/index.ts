import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { collectGuidanceIssues, readInstructionFile } from "../shared/instruction-file.js";

import { createProjectInstructionPathResolver, createSymlinkGuard } from "../shared/path-ancestors.js";

import { createProjectDirResolver } from "../shared/project-root.js";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import {
  type PathDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

import { createRestorableSkillCommands } from "../shared/restorable-skill.js";

export type PiGoSkillOptions = {
  projectDir?: string;
};

export type InstallPiGoSkillResult = {
  skillPath: string;
  backupPath?: string;
};

export type UninstallPiGoSkillResult = {
  skillPath: string;
  removed: boolean;
};

export type PiGoDoctorReport = PathDoctorReport<"skillPath"> & {
  hasTokenjuiceMarker: boolean;
};

const TOKENJUICE_PI_GO_FIX_COMMAND = "tokenjuice install pi-go";
const TOKENJUICE_PI_GO_OWNERSHIP_MARKER = "<!-- tokenjuice:pi-go-skill -->";
const TOKENJUICE_PI_GO_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:pi-go-restore-backup=";
const TOKENJUICE_PI_GO_SKILL_MARKER = "# tokenjuice terminal output compaction";
const TOKENJUICE_PI_GO_FRONTMATTER = [
  "---",
  "name: tokenjuice",
  'description: "Use tokenjuice to compact noisy terminal output in pi-go workspaces."',
  "tools: bash",
  "---",
].join("\n");
const TOKENJUICE_PI_GO_ADVISORY =
  "pi-go support is beta and skill-based; pi-go discovers .pi/skills/tokenjuice/SKILL.md when loading project skills, but tokenjuice does not intercept shell output.";

function isTokenjuicePiGoSkillText(text: string): boolean {
  return text.includes(TOKENJUICE_PI_GO_OWNERSHIP_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/^<!-- tokenjuice:pi-go-restore-backup=(\.bak(?:\.\d+)?) -->$/mu);
  return match?.[1];
}

const resolveProjectDir = createProjectDirResolver("PI_GO_PROJECT_DIR");

function getExpectedSkillPath(projectDir: string): string {
  return join(projectDir, ".pi", "skills", "tokenjuice", "SKILL.md");
}

const rejectSkillSymlink = createSymlinkGuard(
  (filePath) => `cannot use pi-go skill ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectSkillSymlink(`${filePath}.bak`);
  await rejectSkillSymlink(`${filePath}.tmp`);
}

const resolveProjectSkillPath = createProjectInstructionPathResolver(
  "pi-go skill",
  rejectSkillSymlink,
);

async function resolveSafeProjectSkillPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = await resolveProjectSkillPath(filePath, projectDir, realProjectDir);
  const expectedSkillPath = getExpectedSkillPath(projectDir);
  if (resolvedPath !== expectedSkillPath) {
    throw new Error(`cannot use pi-go skill ${resolvedPath}; tokenjuice only installs the project-local .pi/skills/tokenjuice/SKILL.md skill`);
  }
  return resolvedPath;
}

async function getDefaultSkillPath(options: PiGoSkillOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  // pi-go's DefaultSkillDirsIn loader searches project .pi/skills.
  return resolveSafeProjectSkillPath(getExpectedSkillPath(projectDir), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: PiGoSkillOptions = {}): Promise<string> {
  return getExpectedSkillPath(await resolveProjectDir(options));
}

async function resolveSkillPath(skillPath?: string, options: PiGoSkillOptions = {}): Promise<string> {
  if (skillPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectSkillPath(skillPath, projectDir, realProjectDir);
  }
  return getDefaultSkillPath(options);
}

function buildPiGoSkill(
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): string {
  return [
    TOKENJUICE_PI_GO_FRONTMATTER,
    TOKENJUICE_PI_GO_OWNERSHIP_MARKER,
    ...(restoreBackupSuffix
      ? [`${TOKENJUICE_PI_GO_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix} -->`]
      : []),
    "",
    "# tokenjuice terminal output compaction",
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        "- When pi-go runs terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
    }),
    "- pi-go discovers this reusable skill from `.pi/skills/tokenjuice/SKILL.md` and still owns shell execution and tool output delivery.",
    "",
  ].join("\n");
}

const skillCommands = createRestorableSkillCommands({
  buildSkill: buildPiGoSkill,
  isManagedText: isTokenjuicePiGoSkillText,
  readRestoreBackupSuffix,
  rejectSkillSymlink,
  rejectInstallSidecarSymlinks,
});

export async function installPiGoSkill(
  skillPath?: string,
  options: PiGoSkillOptions = {},
): Promise<InstallPiGoSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  return skillCommands.install(resolvedSkillPath);
}

export async function uninstallPiGoSkill(
  skillPath?: string,
  options: PiGoSkillOptions = {},
): Promise<UninstallPiGoSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  return skillCommands.uninstall(resolvedSkillPath);
}

export async function doctorPiGoSkill(
  skillPath?: string,
  options: PiGoSkillOptions = {},
): Promise<PiGoDoctorReport> {
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
        advisory: TOKENJUICE_PI_GO_ADVISORY,
        fixCommand: (error as Error).message.includes("outside") || (error as Error).message.includes("only installs")
          ? "use a project-local .pi/skills/tokenjuice/SKILL.md path, then run tokenjuice install pi-go"
          : "replace symlinked pi-go skill with a regular project file, then run tokenjuice install pi-go",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedSkillPath);
  const hasTokenjuiceMarker = isTokenjuicePiGoSkillText(existing.text);
  if (!existing.exists) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice pi-go skill is not installed"],
        advisory: TOKENJUICE_PI_GO_ADVISORY,
        fixCommand: TOKENJUICE_PI_GO_FIX_COMMAND,
      }),
    };
  }
  if (!hasTokenjuiceMarker) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice pi-go skill is not installed; existing skill file is not tokenjuice-managed"],
        advisory: TOKENJUICE_PI_GO_ADVISORY,
        fixCommand: TOKENJUICE_PI_GO_FIX_COMMAND,
      }),
    };
  }

  const issues = [
    ...(existing.text.startsWith(`${TOKENJUICE_PI_GO_FRONTMATTER}\n`)
      ? []
      : ["configured pi-go skill is missing leading discovery frontmatter"]),
    ...collectGuidanceIssues(existing.text, {
      required: [
        {
          requiredText: TOKENJUICE_PI_GO_OWNERSHIP_MARKER,
          missingIssue: "configured pi-go skill is missing the tokenjuice ownership marker",
        },
        {
          requiredText: "name: tokenjuice",
          missingIssue: "configured pi-go skill is missing the required tokenjuice skill name",
        },
        {
          requiredText: TOKENJUICE_PI_GO_FRONTMATTER,
          missingIssue: "configured pi-go skill is missing discovery frontmatter",
        },
        {
          requiredText: TOKENJUICE_PI_GO_SKILL_MARKER,
          missingIssue: "configured pi-go skill does not look like the tokenjuice skill",
        },
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured pi-go skill is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured pi-go skill is missing the raw escape hatch",
        },
        {
          requiredText: "tools: bash",
          missingIssue: "configured pi-go skill is missing tool frontmatter",
        },
        {
          requiredText: ".pi/skills/tokenjuice/SKILL.md",
          missingIssue: "configured pi-go skill is missing workspace skill path guidance",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured pi-go skill still suggests the full escape hatch",
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
      advisory: TOKENJUICE_PI_GO_ADVISORY,
      fixCommand: TOKENJUICE_PI_GO_FIX_COMMAND,
    }),
  };
}
