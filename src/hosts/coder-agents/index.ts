import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

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

export type CoderAgentsDoctorReport = {
  skillPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
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

function getExplicitProjectDir(options: CoderAgentsSkillOptions = {}): string | undefined {
  return options.projectDir || process.env.CODER_AGENTS_PROJECT_DIR;
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

async function resolveProjectDir(options: CoderAgentsSkillOptions = {}): Promise<string> {
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
      throw new Error(`cannot use Coder Agents skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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

async function chooseCoderAgentsBackupPath(skillPath: string): Promise<string> {
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
        throw new Error(`cannot use Coder Agents skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
    throw new Error(`cannot use Coder Agents skill ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use Coder Agents skill ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectSkillSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectSkillSymlink(resolvedPath);
  return resolvedPath;
}

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

export async function installCoderAgentsSkill(
  skillPath?: string,
  options: CoderAgentsSkillOptions = {},
): Promise<InstallCoderAgentsSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  await rejectInstallSidecarSymlinks(resolvedSkillPath);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (existing.exists && isTokenjuiceCoderAgentsSkillText(existing.text)) {
    const nextSkill = buildCoderAgentsSkill({ restoreBackupSuffix: readRestoreBackupSuffix(existing.text) });
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
    const backupPath = await chooseCoderAgentsBackupPath(resolvedSkillPath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx" });
    await writeTextFileWithoutBackup(
      resolvedSkillPath,
      buildCoderAgentsSkill({ restoreBackupSuffix: backupPath.slice(resolvedSkillPath.length) }),
    );
    return { skillPath: resolvedSkillPath, backupPath };
  }

  await writeTextFileWithoutBackup(resolvedSkillPath, buildCoderAgentsSkill());
  return { skillPath: resolvedSkillPath };
}

export async function uninstallCoderAgentsSkill(
  skillPath?: string,
  options: CoderAgentsSkillOptions = {},
): Promise<UninstallCoderAgentsSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (!existing.exists || !isTokenjuiceCoderAgentsSkillText(existing.text)) {
    return { skillPath: resolvedSkillPath, removed: false };
  }
  const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
  if (restoreBackupSuffix) {
    const backupPath = `${resolvedSkillPath}${restoreBackupSuffix}`;
    await rejectSkillSymlink(backupPath);
    const backup = await readInstructionFile(backupPath);
    if (backup.exists && !isTokenjuiceCoderAgentsSkillText(backup.text)) {
      await rm(resolvedSkillPath, { force: true });
      await rename(backupPath, resolvedSkillPath);
      return { skillPath: resolvedSkillPath, removed: true };
    }
  }
  const result = await removeInstructionFile(resolvedSkillPath);
  return { skillPath: result.filePath, removed: result.removed };
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
