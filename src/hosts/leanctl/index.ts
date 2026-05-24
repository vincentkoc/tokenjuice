import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type LeanCtlInstructionsOptions = {
  projectDir?: string;
};

export type InstallLeanCtlInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallLeanCtlInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type LeanCtlDoctorReport = {
  instructionsPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_LEANCTL_FIX_COMMAND = "tokenjuice install leanctl";
const TOKENJUICE_LEANCTL_OWNERSHIP_MARKER = "<!-- tokenjuice:leanctl-instructions -->";
const TOKENJUICE_LEANCTL_INSTRUCTIONS_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_LEANCTL_RESTORE_BACKUP_MARKER_PREFIX = "<!-- tokenjuice:leanctl-restore-backup=";
const TOKENJUICE_LEANCTL_ADVISORY =
  "LeanCTL support is beta and instruction-based; LeanCTL owns command execution, so tokenjuice writes guidance to .leanctl/instructions.md instead of intercepting tool output.";

function isTokenjuiceLeanCtlInstructionsText(text: string): boolean {
  return text.includes(TOKENJUICE_LEANCTL_OWNERSHIP_MARKER);
}

function readRestoreBackupSuffix(text: string): string | undefined {
  const match = text.match(/^<!-- tokenjuice:leanctl-restore-backup=(\.bak(?:\.\d+)?) -->$/mu);
  return match?.[1];
}

function getExplicitProjectDir(options: LeanCtlInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.LEANCTL_PROJECT_DIR;
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

async function resolveProjectDir(options: LeanCtlInstructionsOptions = {}): Promise<string> {
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

async function rejectInstructionSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use LeanCTL instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectInstructionSymlink(`${filePath}.bak`);
  await rejectInstructionSymlink(`${filePath}.tmp`);
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

async function chooseLeanCtlBackupPath(instructionsPath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${instructionsPath}.bak` : `${instructionsPath}.bak.${index}`;
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
        throw new Error(`cannot use LeanCTL instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function resolveSafeProjectInstructionsPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  if (projectDir !== realProjectDir) {
    throw new Error(`cannot use LeanCTL instructions ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use LeanCTL instructions ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectInstructionSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectInstructionSymlink(resolvedPath);
  return resolvedPath;
}

async function getDefaultInstructionsPath(options: LeanCtlInstructionsOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectInstructionsPath(join(projectDir, ".leanctl", "instructions.md"), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: LeanCtlInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".leanctl", "instructions.md");
}

async function resolveInstructionsPath(instructionsPath?: string, options: LeanCtlInstructionsOptions = {}): Promise<string> {
  if (instructionsPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectInstructionsPath(instructionsPath, projectDir, realProjectDir);
  }
  return getDefaultInstructionsPath(options);
}

function buildLeanCtlInstructions(
  { restoreBackupSuffix }: { restoreBackupSuffix?: string | undefined } = {},
): string {
  return [
    TOKENJUICE_LEANCTL_OWNERSHIP_MARKER,
    ...(restoreBackupSuffix ? [`${TOKENJUICE_LEANCTL_RESTORE_BACKUP_MARKER_PREFIX}${restoreBackupSuffix} -->`] : []),
    "",
    "# tokenjuice terminal output compaction",
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        "- When running terminal commands through LeanCTL, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
    }),
    "- LeanCTL loads this file from `.leanctl/instructions.md` as project instructions.",
    "",
  ].join("\n");
}

export async function installLeanCtlInstructions(
  instructionsPath?: string,
  options: LeanCtlInstructionsOptions = {},
): Promise<InstallLeanCtlInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  await rejectInstallSidecarSymlinks(resolvedInstructionsPath);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  if (existing.exists && isTokenjuiceLeanCtlInstructionsText(existing.text)) {
    const nextInstructions = buildLeanCtlInstructions({ restoreBackupSuffix: readRestoreBackupSuffix(existing.text) });
    if (existing.text === nextInstructions) {
      return { instructionsPath: resolvedInstructionsPath };
    }
    const result = await writeInstructionFile(resolvedInstructionsPath, nextInstructions);
    return {
      instructionsPath: result.filePath,
      ...(result.backupPath ? { backupPath: result.backupPath } : {}),
    };
  }

  if (existing.exists) {
    const backupPath = await chooseLeanCtlBackupPath(resolvedInstructionsPath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx" });
    await writeTextFileWithoutBackup(
      resolvedInstructionsPath,
      buildLeanCtlInstructions({ restoreBackupSuffix: backupPath.slice(resolvedInstructionsPath.length) }),
    );
    return { instructionsPath: resolvedInstructionsPath, backupPath };
  }

  await writeTextFileWithoutBackup(resolvedInstructionsPath, buildLeanCtlInstructions());
  return { instructionsPath: resolvedInstructionsPath };
}

export async function uninstallLeanCtlInstructions(
  instructionsPath?: string,
  options: LeanCtlInstructionsOptions = {},
): Promise<UninstallLeanCtlInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  if (!existing.exists || !isTokenjuiceLeanCtlInstructionsText(existing.text)) {
    return { instructionsPath: resolvedInstructionsPath, removed: false };
  }
  const restoreBackupSuffix = readRestoreBackupSuffix(existing.text);
  if (restoreBackupSuffix) {
    const backupPath = `${resolvedInstructionsPath}${restoreBackupSuffix}`;
    await rejectInstructionSymlink(backupPath);
    const backup = await readInstructionFile(backupPath);
    if (backup.exists && !isTokenjuiceLeanCtlInstructionsText(backup.text)) {
      await rm(resolvedInstructionsPath, { force: true });
      await rename(backupPath, resolvedInstructionsPath);
      return { instructionsPath: resolvedInstructionsPath, removed: true };
    }
  }
  const result = await removeInstructionFile(resolvedInstructionsPath);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorLeanCtlInstructions(
  instructionsPath?: string,
  options: LeanCtlInstructionsOptions = {},
): Promise<LeanCtlDoctorReport> {
  let resolvedInstructionsPath: string;
  try {
    resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  } catch (error) {
    const aliasPath = instructionsPath ?? (await getDefaultAliasPath(options));
    return {
      instructionsPath: aliasPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_LEANCTL_ADVISORY,
        fixCommand: (error as Error).message.includes("outside")
          ? "use a project-local .leanctl/instructions.md path, then run tokenjuice install leanctl"
          : "replace symlinked LeanCTL instructions with a regular project file, then run tokenjuice install leanctl",
      }),
    };
  }
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const hasTokenjuiceMarker = isTokenjuiceLeanCtlInstructionsText(existing.text);
  if (!existing.exists) {
    return {
      instructionsPath: resolvedInstructionsPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice LeanCTL instructions are not installed"],
        advisory: TOKENJUICE_LEANCTL_ADVISORY,
        fixCommand: TOKENJUICE_LEANCTL_FIX_COMMAND,
      }),
    };
  }
  if (!hasTokenjuiceMarker) {
    return {
      instructionsPath: resolvedInstructionsPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice LeanCTL instructions are not installed; existing instructions file is not tokenjuice-managed"],
        advisory: TOKENJUICE_LEANCTL_ADVISORY,
        fixCommand: TOKENJUICE_LEANCTL_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_LEANCTL_OWNERSHIP_MARKER,
        missingIssue: "configured LeanCTL instructions are missing the tokenjuice ownership marker",
      },
      {
        requiredText: TOKENJUICE_LEANCTL_INSTRUCTIONS_MARKER,
        missingIssue: "configured LeanCTL instructions do not look like the tokenjuice instructions",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured LeanCTL instructions are missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured LeanCTL instructions are missing the raw escape hatch",
      },
      {
        requiredText: ".leanctl/instructions.md",
        missingIssue: "configured LeanCTL instructions are missing project instruction path guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured LeanCTL instructions still suggest the full escape hatch",
      },
    ],
  });

  return {
    instructionsPath: resolvedInstructionsPath,
    hasTokenjuiceMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_LEANCTL_ADVISORY,
      fixCommand: TOKENJUICE_LEANCTL_FIX_COMMAND,
    }),
  };
}
