import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
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

export type BlackboxDoctorReport = {
  skillPath: string;
  hasTokenjuiceMarker: boolean;
  hasUnsafePathIssue: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_BLACKBOX_FIX_COMMAND = "tokenjuice install blackbox";
const TOKENJUICE_BLACKBOX_OWNERSHIP_MARKER = "<!-- tokenjuice:blackbox skill -->";
const TOKENJUICE_BLACKBOX_SKILL_MARKER = "# tokenjuice terminal output compaction";
const TOKENJUICE_BLACKBOX_ADVISORY =
  "Blackbox support is beta and skill-based; Blackbox discovers .blackbox/skills/tokenjuice/SKILL.md in workspace sessions, but tokenjuice does not intercept shell output.";

function getExplicitProjectDir(options: BlackboxSkillOptions = {}): string | undefined {
  return options.projectDir || process.env.BLACKBOX_PROJECT_DIR;
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function findGitRoot(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    if (await hasGitMetadata(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function resolveProjectDir(options: BlackboxSkillOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function resolveCanonicalProjectDir(options: BlackboxSkillOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  await rejectSkillSymlink(projectDir);
  return realpath(projectDir).catch(() => projectDir);
}

function isInsideOrEqual(parentDir: string, childPath: string): boolean {
  const relativePath = relative(parentDir, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

async function realpathExistingAncestor(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
}

async function findExistingAncestor(path: string): Promise<{ path: string; realPath: string }> {
  let current = path;
  while (true) {
    try {
      return { path: current, realPath: await realpath(current) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
}

async function resolveCanonicalInstructionPath(filePath: string): Promise<string> {
  const resolvedPath = resolve(filePath);
  const existingAncestor = await findExistingAncestor(dirname(resolvedPath));
  return join(existingAncestor.realPath, relative(existingAncestor.path, resolvedPath));
}

async function rejectSkillSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use Blackbox skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectSkillPathComponentSymlinks(filePath: string, projectDir: string): Promise<void> {
  const relativePath = relative(projectDir, filePath);
  const segments = relativePath.split(sep).filter(Boolean);
  let currentPath = projectDir;
  for (const segment of segments.slice(0, -1)) {
    currentPath = join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`cannot use Blackbox skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectSkillSymlink(`${filePath}.bak`);
  await rejectSkillSymlink(`${filePath}.tmp`);
}

function getExpectedSkillPath(projectDir: string): string {
  return join(projectDir, ".blackbox", "skills", "tokenjuice", "SKILL.md");
}

async function resolveSafeProjectSkillPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  await rejectSkillSymlink(projectDir);
  await rejectSkillPathComponentSymlinks(resolvedPath, projectDir);
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use Blackbox skill ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectSkillSymlink(resolvedPath);
  const expectedSkillPath = getExpectedSkillPath(projectDir);
  if (resolvedPath !== expectedSkillPath) {
    throw new Error(
      `cannot use Blackbox skill ${resolvedPath}; tokenjuice only installs the project-local .blackbox/skills/tokenjuice/SKILL.md file`,
    );
  }
  return resolvedPath;
}

async function getDefaultSkillPath(options: BlackboxSkillOptions = {}): Promise<string> {
  const projectDir = await resolveCanonicalProjectDir(options);
  return resolveSafeProjectSkillPath(getExpectedSkillPath(projectDir), projectDir, projectDir);
}

async function getDefaultAliasPath(options: BlackboxSkillOptions = {}): Promise<string> {
  return getExpectedSkillPath(await resolveProjectDir(options));
}

async function skillArtifactExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
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
    if (!skillPath && !(await skillArtifactExists(aliasPath))) {
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
  const issues = collectGuidanceIssues(existing.text, {
    required: [
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
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Blackbox skill is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Blackbox skill is missing the raw escape hatch",
      },
      {
        requiredText: ".blackbox/skills/tokenjuice/SKILL.md",
        missingIssue: "configured Blackbox skill is missing workspace skill path guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Blackbox skill still suggests the full escape hatch",
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
