import { realpath } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { createCanonicalProjectSkillPaths, createSymlinkGuard, findExistingAncestor } from "../shared/path-ancestors.js";

import { createProjectDirResolver } from "../shared/project-root.js";

import { collectTokenjuiceGuidanceIssues, buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import {
  pathEntryExists,
  readInstructionFile,
  removeInstructionFile,
  writeInstructionFile,
} from "../shared/instruction-file.js";
import {
  type PathDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type BlackboxSkillOptions = {
  projectDir?: string;
};

export type InstallBlackboxSkillResult = {
  skillPath: string;
  backupPath?: string;
};

export type UninstallBlackboxSkillResult = {
  skillPath: string;
  removed: boolean;
};

export type BlackboxDoctorReport = PathDoctorReport<"skillPath"> & {
  hasTokenjuiceMarker: boolean;
  hasUnsafePathIssue: boolean;
};

const TOKENJUICE_BLACKBOX_FIX_COMMAND = "tokenjuice install blackbox";
const TOKENJUICE_BLACKBOX_OWNERSHIP_MARKER = "<!-- tokenjuice:blackbox skill -->";
const TOKENJUICE_BLACKBOX_SKILL_MARKER = "# tokenjuice terminal output compaction";
const TOKENJUICE_BLACKBOX_ADVISORY =
  "Blackbox support is beta and skill-based; Blackbox discovers .blackbox/skills/tokenjuice/SKILL.md in workspace sessions, but tokenjuice does not intercept shell output.";

const resolveProjectDir = createProjectDirResolver("BLACKBOX_PROJECT_DIR");

async function resolveCanonicalProjectDir(options: BlackboxSkillOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  await rejectSkillSymlink(projectDir);
  return realpath(projectDir).catch(() => projectDir);
}

async function resolveCanonicalInstructionPath(filePath: string): Promise<string> {
  const resolvedPath = resolve(filePath);
  const existingAncestor = await findExistingAncestor(dirname(resolvedPath));
  return join(existingAncestor.realPath, relative(existingAncestor.path, resolvedPath));
}

const rejectSkillSymlink = createSymlinkGuard(
  (filePath) => `cannot use Blackbox skill ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectSkillSymlink(`${filePath}.bak`);
  await rejectSkillSymlink(`${filePath}.tmp`);
}

const { getExpectedSkillPath, resolveSafeProjectSkillPath } = createCanonicalProjectSkillPaths(
  "Blackbox skill",
  ".blackbox/skills/tokenjuice/SKILL.md",
  rejectSkillSymlink,
);

async function getDefaultSkillPath(options: BlackboxSkillOptions = {}): Promise<string> {
  const projectDir = await resolveCanonicalProjectDir(options);
  return resolveSafeProjectSkillPath(getExpectedSkillPath(projectDir), projectDir, projectDir);
}

async function getDefaultAliasPath(options: BlackboxSkillOptions = {}): Promise<string> {
  return getExpectedSkillPath(await resolveProjectDir(options));
}

async function resolveSkillPath(skillPath?: string, options: BlackboxSkillOptions = {}): Promise<string> {
  if (skillPath) {
    const projectDir = await resolveCanonicalProjectDir(options);
    return resolveSafeProjectSkillPath(await resolveCanonicalInstructionPath(skillPath), projectDir, projectDir);
  }
  return getDefaultSkillPath(options);
}

const TOKENJUICE_BLACKBOX_SKILL = [
  "---",
  "name: tokenjuice",
  'description: "Use tokenjuice to compact noisy terminal output in Blackbox workspaces."',
  "---",
  "",
  TOKENJUICE_BLACKBOX_OWNERSHIP_MARKER,
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When Blackbox CLI runs terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
  }),
  "- Blackbox CLI discovers this reusable skill from `.blackbox/skills/tokenjuice/SKILL.md` and still owns shell execution and tool output delivery.",
  "",
].join("\n");

export async function installBlackboxSkill(
  skillPath?: string,
  options: BlackboxSkillOptions = {},
): Promise<InstallBlackboxSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  await rejectInstallSidecarSymlinks(resolvedSkillPath);
  const result = await writeInstructionFile(resolvedSkillPath, TOKENJUICE_BLACKBOX_SKILL);
  return {
    skillPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallBlackboxSkill(
  skillPath?: string,
  options: BlackboxSkillOptions = {},
): Promise<UninstallBlackboxSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (!existing.exists || !existing.text.includes(TOKENJUICE_BLACKBOX_OWNERSHIP_MARKER)) {
    return { skillPath: resolvedSkillPath, removed: false };
  }
  const result = await removeInstructionFile(resolvedSkillPath);
  return { skillPath: result.filePath, removed: result.removed };
}

export async function doctorBlackboxSkill(
  skillPath?: string,
  options: BlackboxSkillOptions = {},
): Promise<BlackboxDoctorReport> {
  let resolvedSkillPath: string;
  try {
    resolvedSkillPath = await resolveSkillPath(skillPath, options);
  } catch (error) {
    const aliasPath = skillPath ?? (await getDefaultAliasPath(options));
    if (!skillPath && !(await pathEntryExists(aliasPath))) {
      return {
        skillPath: aliasPath,
        hasTokenjuiceMarker: false,
        hasUnsafePathIssue: false,
        ...buildInstructionDoctorReportFields({
          status: "disabled",
          issues: ["tokenjuice Blackbox skill is not installed"],
          advisory: TOKENJUICE_BLACKBOX_ADVISORY,
          fixCommand: TOKENJUICE_BLACKBOX_FIX_COMMAND,
        }),
      };
    }
    return {
      skillPath: aliasPath,
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: true,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_BLACKBOX_ADVISORY,
        fixCommand: (error as Error).message.includes("outside") || (error as Error).message.includes("only installs")
          ? "use the project-local .blackbox/skills/tokenjuice/SKILL.md path, then run tokenjuice install blackbox"
          : "replace symlinked Blackbox skill paths with regular project files, then run tokenjuice install blackbox",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedSkillPath);
  if (!existing.exists) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Blackbox skill is not installed"],
        advisory: TOKENJUICE_BLACKBOX_ADVISORY,
        fixCommand: TOKENJUICE_BLACKBOX_FIX_COMMAND,
      }),
    };
  }

  const hasTokenjuiceMarker = existing.text.includes(TOKENJUICE_BLACKBOX_OWNERSHIP_MARKER);
  const issues = collectTokenjuiceGuidanceIssues(existing.text, {
    configuredLabel: "Blackbox skill",
    singular: true,
    additionalRequired: [
      {
        requiredText: "name: tokenjuice",
        missingIssue: "configured Blackbox skill is missing the required tokenjuice skill name",
      },
      {
        requiredText: "description:",
        missingIssue: "configured Blackbox skill is missing discovery frontmatter",
      },
      {
        requiredText: TOKENJUICE_BLACKBOX_OWNERSHIP_MARKER,
        missingIssue: "configured Blackbox skill is missing the tokenjuice ownership marker",
      },
      {
        requiredText: TOKENJUICE_BLACKBOX_SKILL_MARKER,
        missingIssue: "configured Blackbox skill does not look like the tokenjuice skill",
      },
    ],
    additionalRequiredAfter: [
      {
        requiredText: ".blackbox/skills/tokenjuice/SKILL.md",
        missingIssue: "configured Blackbox skill is missing workspace skill path guidance",
      },
    ],
  });

  return {
    skillPath: resolvedSkillPath,
    hasTokenjuiceMarker,
    hasUnsafePathIssue: false,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_BLACKBOX_ADVISORY,
      fixCommand: TOKENJUICE_BLACKBOX_FIX_COMMAND,
    }),
  };
}
