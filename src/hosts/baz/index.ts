import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type BazSkillOptions = {
  projectDir?: string;
};

export type InstallBazSkillResult = {
  skillPath: string;
  backupPath?: string;
};

export type UninstallBazSkillResult = {
  skillPath: string;
  removed: boolean;
};

export type BazDoctorReport = {
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

const TOKENJUICE_BAZ_FIX_COMMAND = "tokenjuice install baz";
const TOKENJUICE_BAZ_OWNERSHIP_MARKER = "<!-- tokenjuice:baz-skill -->";
const TOKENJUICE_BAZ_SKILL_MARKER = "# tokenjuice terminal output compaction";
const TOKENJUICE_BAZ_ADVISORY =
  "Baz support is beta and skill-based; Baz discovers Skill folders containing SKILL.md and converts them into AI Coding Guidelines, but tokenjuice does not intercept Baz review output.";

function isTokenjuiceBazSkillText(text: string): boolean {
  return text.includes(TOKENJUICE_BAZ_OWNERSHIP_MARKER);
}

function getExplicitProjectDir(options: BazSkillOptions = {}): string | undefined {
  return options.projectDir || process.env.BAZ_PROJECT_DIR;
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

async function resolveProjectDir(options: BazSkillOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

function isInsideOrEqual(parentDir: string, childPath: string): boolean {
  const relativePath = relative(parentDir, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function getExpectedSkillPath(projectDir: string): string {
  return join(projectDir, ".baz", "skills", "tokenjuice", "SKILL.md");
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

async function rejectSkillSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use Baz skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectSkillSymlink(`${filePath}.bak`);
  await rejectSkillSymlink(`${filePath}.tmp`);
}

async function rejectSymlinkPathComponents(filePath: string, projectDir: string): Promise<void> {
  const relativePath = relative(projectDir, filePath);
  const segments = relativePath.split(sep).filter(Boolean);
  let currentPath = projectDir;
  for (const segment of segments.slice(0, -1)) {
    currentPath = join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`cannot use Baz skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function resolveSafeProjectSkillPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  if (projectDir !== realProjectDir) {
    throw new Error(`cannot use Baz skill ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use Baz skill ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectSkillSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectSkillSymlink(resolvedPath);
  const expectedSkillPath = getExpectedSkillPath(projectDir);
  if (resolvedPath !== expectedSkillPath) {
    throw new Error(`cannot use Baz skill ${resolvedPath}; tokenjuice only installs the project-local .baz/skills/tokenjuice/SKILL.md skill`);
  }
  return resolvedPath;
}

async function getDefaultSkillPath(options: BazSkillOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectSkillPath(getExpectedSkillPath(projectDir), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: BazSkillOptions = {}): Promise<string> {
  return getExpectedSkillPath(await resolveProjectDir(options));
}

async function pathExistsWithoutReading(filePath: string): Promise<boolean> {
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

async function resolveSkillPath(skillPath?: string, options: BazSkillOptions = {}): Promise<string> {
  if (skillPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectSkillPath(skillPath, projectDir, realProjectDir);
  }
  return getDefaultSkillPath(options);
}

const TOKENJUICE_BAZ_SKILL = [
  "---",
  "name: tokenjuice",
  'description: "Use tokenjuice to compact noisy terminal output when Baz agents inspect a repository."',
  "---",
  "",
  TOKENJUICE_BAZ_OWNERSHIP_MARKER,
  "",
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When Baz agents run terminal commands likely to produce long output during review, fixer, or runtime inspection workflows, prefer `tokenjuice wrap -- <command>`.",
  }),
  "- Baz discovers this reusable skill from `.baz/skills/tokenjuice/SKILL.md` and still owns review, fixer, shell execution, and comment delivery.",
  "",
].join("\n");

export async function installBazSkill(skillPath?: string, options: BazSkillOptions = {}): Promise<InstallBazSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  await rejectInstallSidecarSymlinks(resolvedSkillPath);
  const result = await writeInstructionFile(resolvedSkillPath, TOKENJUICE_BAZ_SKILL);
  return {
    skillPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallBazSkill(
  skillPath?: string,
  options: BazSkillOptions = {},
): Promise<UninstallBazSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (!existing.exists || !isTokenjuiceBazSkillText(existing.text)) {
    return { skillPath: resolvedSkillPath, removed: false };
  }
  const result = await removeInstructionFile(resolvedSkillPath);
  return { skillPath: result.filePath, removed: result.removed };
}

export async function doctorBazSkill(skillPath?: string, options: BazSkillOptions = {}): Promise<BazDoctorReport> {
  let resolvedSkillPath: string;
  try {
    resolvedSkillPath = await resolveSkillPath(skillPath, options);
  } catch (error) {
    const aliasPath = skillPath ?? (await getDefaultAliasPath(options));
    if (!skillPath && !(await pathExistsWithoutReading(aliasPath))) {
      return {
        skillPath: aliasPath,
        hasTokenjuiceMarker: false,
        hasUnsafePathIssue: false,
        ...buildInstructionDoctorReportFields({
          status: "disabled",
          issues: ["tokenjuice Baz skill is not installed"],
          advisory: TOKENJUICE_BAZ_ADVISORY,
          fixCommand: TOKENJUICE_BAZ_FIX_COMMAND,
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
        advisory: TOKENJUICE_BAZ_ADVISORY,
        fixCommand: (error as Error).message.includes("outside") || (error as Error).message.includes("only installs")
          ? "use a project-local .baz/skills/tokenjuice/SKILL.md path, then run tokenjuice install baz"
          : "replace symlinked Baz skill with a regular project file, then run tokenjuice install baz",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedSkillPath);
  const hasTokenjuiceMarker = isTokenjuiceBazSkillText(existing.text);
  if (!existing.exists) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Baz skill is not installed"],
        advisory: TOKENJUICE_BAZ_ADVISORY,
        fixCommand: TOKENJUICE_BAZ_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_BAZ_OWNERSHIP_MARKER,
        missingIssue: "configured Baz skill is missing the tokenjuice ownership marker",
      },
      {
        requiredText: "name: tokenjuice",
        missingIssue: "configured Baz skill is missing the required tokenjuice skill name",
      },
      {
        requiredText: "description:",
        missingIssue: "configured Baz skill is missing discovery frontmatter",
      },
      {
        requiredText: TOKENJUICE_BAZ_SKILL_MARKER,
        missingIssue: "configured Baz skill does not look like the tokenjuice skill",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Baz skill is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Baz skill is missing the raw escape hatch",
      },
      {
        requiredText: ".baz/skills/tokenjuice/SKILL.md",
        missingIssue: "configured Baz skill is missing workspace skill path guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Baz skill still suggests the full escape hatch",
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
      advisory: TOKENJUICE_BAZ_ADVISORY,
      fixCommand: TOKENJUICE_BAZ_FIX_COMMAND,
    }),
  };
}
