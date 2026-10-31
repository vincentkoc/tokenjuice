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

export type CoderAgentsSkillOptions = {
  projectDir?: string;
};

export type InstallCoderAgentsSkillResult = {
  skillPath: string;
  backupPath?: string;
};

export type UninstallCoderAgentsSkillResult = {
  skillPath: string;
  removed: boolean;
};

export type CoderAgentsDoctorReport = PathDoctorReport<"skillPath"> & {
  hasTokenjuiceMarker: boolean;
};

const TOKENJUICE_CODER_AGENTS_FIX_COMMAND = "tokenjuice install coder-agents";
const TOKENJUICE_CODER_AGENTS_OWNERSHIP_MARKER = "<!-- tokenjuice:coder-agents-skill -->";
const TOKENJUICE_CODER_AGENTS_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:coder-agents-restore-backup=";
const TOKENJUICE_CODER_AGENTS_SKILL_MARKER = "# tokenjuice terminal output compaction";
const TOKENJUICE_CODER_AGENTS_FRONTMATTER = [
  "---",
  "name: tokenjuice",
  'description: "Use tokenjuice to compact noisy terminal output in Coder Agents workspaces."',
  "---",
].join("\n");
const TOKENJUICE_CODER_AGENTS_ADVISORY =
  "Coder Agents support is beta and skill-based; Coder discovers .agents/skills/tokenjuice/SKILL.md in workspace-attached chats, but tokenjuice does not intercept shell output.";

function isTokenjuiceCoderAgentsSkillText(text: string): boolean {
  return text.includes(TOKENJUICE_CODER_AGENTS_OWNERSHIP_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/^<!-- tokenjuice:coder-agents-restore-backup=(\.bak(?:\.\d+)?) -->$/mu);
  return match?.[1];
}

const resolveProjectDir = createProjectDirResolver("CODER_AGENTS_PROJECT_DIR");

const rejectSkillSymlink = createSymlinkGuard(
  (filePath) => `cannot use Coder Agents skill ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectSkillSymlink(`${filePath}.bak`);
  await rejectSkillSymlink(`${filePath}.tmp`);
}

const resolveSafeProjectSkillPath = createProjectInstructionPathResolver(
  "Coder Agents skill",
  rejectSkillSymlink,
);

async function getDefaultSkillPath(options: CoderAgentsSkillOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectSkillPath(join(projectDir, ".agents", "skills", "tokenjuice", "SKILL.md"), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: CoderAgentsSkillOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".agents", "skills", "tokenjuice", "SKILL.md");
}

async function resolveSkillPath(skillPath?: string, options: CoderAgentsSkillOptions = {}): Promise<string> {
  if (skillPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectSkillPath(skillPath, projectDir, realProjectDir);
  }
  return getDefaultSkillPath(options);
}

function buildCoderAgentsSkill(
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): string {
  return [
    TOKENJUICE_CODER_AGENTS_FRONTMATTER,
    TOKENJUICE_CODER_AGENTS_OWNERSHIP_MARKER,
    ...(restoreBackupSuffix
      ? [`${TOKENJUICE_CODER_AGENTS_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix} -->`]
      : []),
    "",
    "# tokenjuice terminal output compaction",
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        "- When Coder Agents runs terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
    }),
    "- Coder Agents discovers this reusable skill from `.agents/skills/tokenjuice/SKILL.md` and still owns shell execution and tool output delivery.",
    "",
  ].join("\n");
}

const skillCommands = createRestorableSkillCommands({
  buildSkill: buildCoderAgentsSkill,
  isManagedText: isTokenjuiceCoderAgentsSkillText,
  readRestoreBackupSuffix,
  rejectSkillSymlink,
  rejectInstallSidecarSymlinks,
});

export async function installCoderAgentsSkill(
  skillPath?: string,
  options: CoderAgentsSkillOptions = {},
): Promise<InstallCoderAgentsSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  return skillCommands.install(resolvedSkillPath);
}

export async function uninstallCoderAgentsSkill(
  skillPath?: string,
  options: CoderAgentsSkillOptions = {},
): Promise<UninstallCoderAgentsSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  return skillCommands.uninstall(resolvedSkillPath);
}

export async function doctorCoderAgentsSkill(
  skillPath?: string,
  options: CoderAgentsSkillOptions = {},
): Promise<CoderAgentsDoctorReport> {
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
        advisory: TOKENJUICE_CODER_AGENTS_ADVISORY,
        fixCommand: (error as Error).message.includes("outside")
          ? "use a project-local .agents/skills/tokenjuice/SKILL.md path, then run tokenjuice install coder-agents"
          : "replace symlinked Coder Agents skill with a regular project file, then run tokenjuice install coder-agents",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedSkillPath);
  const hasTokenjuiceMarker = isTokenjuiceCoderAgentsSkillText(existing.text);
  if (!existing.exists) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Coder Agents skill is not installed"],
        advisory: TOKENJUICE_CODER_AGENTS_ADVISORY,
        fixCommand: TOKENJUICE_CODER_AGENTS_FIX_COMMAND,
      }),
    };
  }
  if (!hasTokenjuiceMarker) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Coder Agents skill is not installed; existing skill file is not tokenjuice-managed"],
        advisory: TOKENJUICE_CODER_AGENTS_ADVISORY,
        fixCommand: TOKENJUICE_CODER_AGENTS_FIX_COMMAND,
      }),
    };
  }

  const issues = [
    ...(existing.text.startsWith(`${TOKENJUICE_CODER_AGENTS_FRONTMATTER}\n`)
      ? []
      : ["configured Coder Agents skill is missing leading discovery frontmatter"]),
    ...collectGuidanceIssues(existing.text, {
      required: [
        {
          requiredText: TOKENJUICE_CODER_AGENTS_OWNERSHIP_MARKER,
          missingIssue: "configured Coder Agents skill is missing the tokenjuice ownership marker",
        },
        {
          requiredText: "name: tokenjuice",
          missingIssue: "configured Coder Agents skill is missing the required tokenjuice skill name",
        },
        {
          requiredText: TOKENJUICE_CODER_AGENTS_FRONTMATTER,
          missingIssue: "configured Coder Agents skill is missing discovery frontmatter",
        },
        {
          requiredText: TOKENJUICE_CODER_AGENTS_SKILL_MARKER,
          missingIssue: "configured Coder Agents skill does not look like the tokenjuice skill",
        },
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Coder Agents skill is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Coder Agents skill is missing the raw escape hatch",
        },
        {
          requiredText: ".agents/skills/tokenjuice/SKILL.md",
          missingIssue: "configured Coder Agents skill is missing workspace skill path guidance",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Coder Agents skill still suggests the full escape hatch",
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
      advisory: TOKENJUICE_CODER_AGENTS_ADVISORY,
      fixCommand: TOKENJUICE_CODER_AGENTS_FIX_COMMAND,
    }),
  };
}
