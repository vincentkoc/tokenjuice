import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type ElyraSkillOptions = {
  projectDir?: string;
};

export type InstallElyraSkillResult = {
  skillPath: string;
  backupPath?: string;
};

export type UninstallElyraSkillResult = {
  skillPath: string;
  removed: boolean;
};

export type ElyraDoctorReport = {
  skillPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_ELYRA_FIX_COMMAND = "tokenjuice install elyra";
const TOKENJUICE_ELYRA_OWNERSHIP_MARKER = "<!-- tokenjuice:elyra-skill -->";
const TOKENJUICE_ELYRA_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:elyra-restore-backup=";
const TOKENJUICE_ELYRA_SKILL_MARKER = "# tokenjuice terminal output compaction";
const TOKENJUICE_ELYRA_ADVISORY =
  "Elyra support is beta and skill-based; Elyra discovers .elyra/skills/tokenjuice/SKILL.md when loading project skills, but tokenjuice does not intercept shell output.";
const ELYRA_FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u;

function isTokenjuiceElyraSkillText(text: string): boolean {
  return text.includes(TOKENJUICE_ELYRA_OWNERSHIP_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/^<!-- tokenjuice:elyra-restore-backup=(\.bak(?:\.\d+)?) -->$/mu);
  return match?.[1];
}

function getExplicitProjectDir(options: ElyraSkillOptions = {}): string | undefined {
  return options.projectDir || process.env.ELYRA_PROJECT_DIR;
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

async function resolveProjectDir(options: ElyraSkillOptions = {}): Promise<string> {
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
  return join(projectDir, ".elyra", "skills", "tokenjuice", "SKILL.md");
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
      throw new Error(`cannot use elyra skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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

async function chooseElyraBackupPath(skillPath: string): Promise<string> {
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
        throw new Error(`cannot use elyra skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
    throw new Error(`cannot use elyra skill ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use elyra skill ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectSkillSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectSkillSymlink(resolvedPath);
  const expectedSkillPath = getExpectedSkillPath(projectDir);
  if (resolvedPath !== expectedSkillPath) {
    throw new Error(`cannot use elyra skill ${resolvedPath}; tokenjuice only installs the project-local .elyra/skills/tokenjuice/SKILL.md skill`);
  }
  return resolvedPath;
}

async function getDefaultSkillPath(options: ElyraSkillOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  // Elyra docs list project .elyra/skills as a native skill directory.
  return resolveSafeProjectSkillPath(getExpectedSkillPath(projectDir), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: ElyraSkillOptions = {}): Promise<string> {
  return getExpectedSkillPath(await resolveProjectDir(options));
}

async function resolveSkillPath(skillPath?: string, options: ElyraSkillOptions = {}): Promise<string> {
  if (skillPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectSkillPath(skillPath, projectDir, realProjectDir);
  }
  return getDefaultSkillPath(options);
}

function getLeadingFrontmatter(text: string): string | undefined {
  const textWithoutBom = text.startsWith("\uFEFF") ? text.slice(1) : text;
  return textWithoutBom.match(ELYRA_FRONTMATTER_PATTERN)?.[1];
}

function getFrontmatterField(frontmatter: string | undefined, fieldName: string): string | undefined {
  if (!frontmatter) {
    return undefined;
  }

  for (const line of frontmatter.split(/\r?\n/u)) {
    const match = line.match(new RegExp(`^${fieldName}[ \\t]*:[ \\t]*(.*)$`, "u"));
    if (match) {
      return match[1]?.trim();
    }
  }

  return undefined;
}

function stripInlineComment(value: string): string {
  return value.replace(/[ \t]+#.*$/u, "").trim();
}

function getInlineScalarValue(value: string | undefined): string | undefined {
  if (!value || value.startsWith("#")) {
    return undefined;
  }

  const unquotedValue = stripInlineComment(value);
  if (!unquotedValue || unquotedValue.startsWith("|") || unquotedValue.startsWith(">")) {
    return undefined;
  }

  const quotedValue = unquotedValue.match(/^"([^"\r\n]*)"$|^'([^'\r\n]*)'$/u);
  const scalarValue = (quotedValue?.[1] ?? quotedValue?.[2] ?? unquotedValue).trim();
  return scalarValue ? scalarValue : undefined;
}

function collectFrontmatterIssues(text: string): string[] {
  const frontmatter = getLeadingFrontmatter(text);
  const name = getInlineScalarValue(getFrontmatterField(frontmatter, "name"));
  const description = getInlineScalarValue(getFrontmatterField(frontmatter, "description"));
  return [
    ...(name === "tokenjuice"
      ? []
      : ["configured elyra skill is missing the required tokenjuice skill name"]),
    ...(description
      ? []
      : ["configured elyra skill is missing discovery frontmatter"]),
  ];
}

const TOKENJUICE_ELYRA_FRONTMATTER = [
  "---",
  "name: tokenjuice",
  'description: "Use tokenjuice to compact noisy terminal output in Elyra workspaces."',
  "---",
].join("\n");

function buildElyraSkill(
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): string {
  return [
    TOKENJUICE_ELYRA_FRONTMATTER,
    TOKENJUICE_ELYRA_OWNERSHIP_MARKER,
    ...(restoreBackupSuffix
      ? [`${TOKENJUICE_ELYRA_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix} -->`]
      : []),
    "",
    "# tokenjuice terminal output compaction",
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        "- When Elyra runs terminal commands likely to produce long output through its `bash` tool, prefer `tokenjuice wrap -- <command>`.",
    }),
    "- Elyra discovers this reusable skill from `.elyra/skills/tokenjuice/SKILL.md` and still owns shell execution and tool output delivery.",
    "",
  ].join("\n");
}

export async function installElyraSkill(
  skillPath?: string,
  options: ElyraSkillOptions = {},
): Promise<InstallElyraSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  await rejectInstallSidecarSymlinks(resolvedSkillPath);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (existing.exists && isTokenjuiceElyraSkillText(existing.text)) {
    const nextSkill = buildElyraSkill({ restoreBackupSuffix: readRestoreBackupSuffix(existing.text) });
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
    const backupPath = await chooseElyraBackupPath(resolvedSkillPath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx" });
    await writeTextFileWithoutBackup(
      resolvedSkillPath,
      buildElyraSkill({ restoreBackupSuffix: backupPath.slice(resolvedSkillPath.length) }),
    );
    return { skillPath: resolvedSkillPath, backupPath };
  }

  await writeTextFileWithoutBackup(resolvedSkillPath, buildElyraSkill());
  return { skillPath: resolvedSkillPath };
}

export async function uninstallElyraSkill(
  skillPath?: string,
  options: ElyraSkillOptions = {},
): Promise<UninstallElyraSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (!existing.exists || !isTokenjuiceElyraSkillText(existing.text)) {
    return { skillPath: resolvedSkillPath, removed: false };
  }
  const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
  if (restoreBackupSuffix) {
    const backupPath = `${resolvedSkillPath}${restoreBackupSuffix}`;
    await rejectSkillSymlink(backupPath);
    const backup = await readInstructionFile(backupPath);
    if (backup.exists && !isTokenjuiceElyraSkillText(backup.text)) {
      await rm(resolvedSkillPath, { force: true });
      await rename(backupPath, resolvedSkillPath);
      return { skillPath: resolvedSkillPath, removed: true };
    }
  }
  const result = await removeInstructionFile(resolvedSkillPath);
  return { skillPath: result.filePath, removed: result.removed };
}

export async function doctorElyraSkill(
  skillPath?: string,
  options: ElyraSkillOptions = {},
): Promise<ElyraDoctorReport> {
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
        advisory: TOKENJUICE_ELYRA_ADVISORY,
        fixCommand: (error as Error).message.includes("outside") || (error as Error).message.includes("only installs")
          ? "use a project-local .elyra/skills/tokenjuice/SKILL.md path, then run tokenjuice install elyra"
          : "replace symlinked elyra skill with a regular project file, then run tokenjuice install elyra",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedSkillPath);
  const hasTokenjuiceMarker = isTokenjuiceElyraSkillText(existing.text);
  if (!existing.exists) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice elyra skill is not installed"],
        advisory: TOKENJUICE_ELYRA_ADVISORY,
        fixCommand: TOKENJUICE_ELYRA_FIX_COMMAND,
      }),
    };
  }
  if (!hasTokenjuiceMarker) {
    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice elyra skill is not installed; existing skill file is not tokenjuice-managed"],
        advisory: TOKENJUICE_ELYRA_ADVISORY,
        fixCommand: TOKENJUICE_ELYRA_FIX_COMMAND,
      }),
    };
  }

  const issues = [
    ...collectFrontmatterIssues(existing.text),
    ...collectGuidanceIssues(existing.text, {
      required: [
        {
          requiredText: TOKENJUICE_ELYRA_OWNERSHIP_MARKER,
          missingIssue: "configured elyra skill is missing the tokenjuice ownership marker",
        },
        {
          requiredText: TOKENJUICE_ELYRA_SKILL_MARKER,
          missingIssue: "configured elyra skill does not look like the tokenjuice skill",
        },
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured elyra skill is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured elyra skill is missing the raw escape hatch",
        },
        {
          requiredText: ".elyra/skills/tokenjuice/SKILL.md",
          missingIssue: "configured elyra skill is missing workspace skill path guidance",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured elyra skill still suggests the full escape hatch",
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
      advisory: TOKENJUICE_ELYRA_ADVISORY,
      fixCommand: TOKENJUICE_ELYRA_FIX_COMMAND,
    }),
  };
}
