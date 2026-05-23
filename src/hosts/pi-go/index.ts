import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

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

export type PiGoDoctorReport = {
  skillPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
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

function getExplicitProjectDir(options: PiGoSkillOptions = {}): string | undefined {
  return options.projectDir || process.env.PI_GO_PROJECT_DIR;
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

async function resolveProjectDir(options: PiGoSkillOptions = {}): Promise<string> {
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
  return join(projectDir, ".pi", "skills", "tokenjuice", "SKILL.md");
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
      throw new Error(`cannot use pi-go skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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

async function backupPathExists(backupPath: string): Promise<boolean> {
  try {
    await lstat(backupPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function choosePiGoBackupPath(skillPath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${skillPath}.bak` : `${skillPath}.bak.${index}`;
    if (!(await backupPathExists(candidate))) {
      return candidate;
    }
  }
}

async function writeTextFileWithoutBackup(filePath: string, text: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, text, { encoding: "utf8", flag: "wx" });
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
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
        throw new Error(`cannot use pi-go skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
    throw new Error(`cannot use pi-go skill ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use pi-go skill ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectSkillSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectSkillSymlink(resolvedPath);
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

export async function installPiGoSkill(
  skillPath?: string,
  options: PiGoSkillOptions = {},
): Promise<InstallPiGoSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  await rejectInstallSidecarSymlinks(resolvedSkillPath);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (existing.exists && isTokenjuicePiGoSkillText(existing.text)) {
    const nextSkill = buildPiGoSkill({ restoreBackupSuffix: readRestoreBackupSuffix(existing.text) });
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
    const backupPath = await choosePiGoBackupPath(resolvedSkillPath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx" });
    await writeTextFileWithoutBackup(
      resolvedSkillPath,
      buildPiGoSkill({ restoreBackupSuffix: backupPath.slice(resolvedSkillPath.length) }),
    );
    return { skillPath: resolvedSkillPath, backupPath };
  }

  await writeTextFileWithoutBackup(resolvedSkillPath, buildPiGoSkill());
  return { skillPath: resolvedSkillPath };
}

export async function uninstallPiGoSkill(
  skillPath?: string,
  options: PiGoSkillOptions = {},
): Promise<UninstallPiGoSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (!existing.exists || !isTokenjuicePiGoSkillText(existing.text)) {
    return { skillPath: resolvedSkillPath, removed: false };
  }
  const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
  if (restoreBackupSuffix) {
    const backupPath = `${resolvedSkillPath}${restoreBackupSuffix}`;
    await rejectSkillSymlink(backupPath);
    const backup = await readInstructionFile(backupPath);
    if (backup.exists && !isTokenjuicePiGoSkillText(backup.text)) {
      await rm(resolvedSkillPath, { force: true });
      await rename(backupPath, resolvedSkillPath);
      return { skillPath: resolvedSkillPath, removed: true };
    }
  }
  const result = await removeInstructionFile(resolvedSkillPath);
  return { skillPath: result.filePath, removed: result.removed };
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
