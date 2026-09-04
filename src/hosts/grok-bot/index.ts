import { constants } from "node:fs";
import { link, lstat, mkdir, mkdtemp, open, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { collectGuidanceIssues } from "../shared/instruction-file.js";

export type GrokBotRuleOptions = {
  projectDir?: string;
};

export type InstallGrokBotRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallGrokBotRuleResult = {
  rulePath: string;
  removed: boolean;
  restoredBackup: boolean;
};

export type GrokBotDoctorReport = {
  rulePath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_GROK_BOT_FIX_COMMAND = "tokenjuice install grok-bot";
const TOKENJUICE_GROK_BOT_OWNERSHIP_MARKER = "<!-- tokenjuice:grok-bot-rule -->";
const TOKENJUICE_GROK_BOT_RESTORE_MARKER_PREFIX = "<!-- tokenjuice:grok-bot-restore-backup=";
const TOKENJUICE_GROK_BOT_RULE_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_GROK_BOT_ADVISORY =
  "Grok Bot support is beta and rule-based; it uses the shipped .cursor/rules workspace surface to guide command usage but does not intercept or rewrite tool output.";

function getLeadingFrontmatterLines(text: string): string[] {
  const frontmatterStart = text.match(/^---\r?\n/u);
  if (!frontmatterStart) {
    return [];
  }
  const endIndex = text.search(/\r?\n---(?:\r?\n|$)/u);
  if (endIndex === -1) {
    return [];
  }
  return text.slice(frontmatterStart[0].length, endIndex).split(/\r?\n/u);
}

function inspectFrontmatter(text: string): {
  hasAlwaysApply: boolean;
  hasDescription: boolean;
  isValid: boolean;
} {
  const lines = getLeadingFrontmatterLines(text);
  const values = new Map<string, string>();
  let isValid = lines.length > 0;
  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(\S.*)$/u);
    const key = match?.[1];
    const value = match?.[2];
    if (!key || !value || values.has(key)) {
      isValid = false;
      continue;
    }
    values.set(key, value);
  }
  return {
    hasAlwaysApply: isValid && values.get("alwaysApply") === "true",
    hasDescription: isValid
      && values.get("description") === '"Use tokenjuice for noisy terminal output in Grok Bot workspaces."',
    isValid,
  };
}

function getExplicitProjectDir(options: GrokBotRuleOptions = {}): string | undefined {
  return options.projectDir || process.env.GROK_BOT_PROJECT_DIR;
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

async function resolveProjectDir(options: GrokBotRuleOptions = {}): Promise<string> {
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

async function rejectSymlink(filePath: string): Promise<void> {
  try {
    if ((await lstat(filePath)).isSymbolicLink()) {
      throw new Error(`cannot use Grok Bot rule ${filePath}; tokenjuice will not read or write through symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectHardlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isFile() && stats.nlink !== 1) {
      throw new Error(`cannot use Grok Bot rule ${filePath}; tokenjuice will not read or write hard-linked files`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectSymlinkPathComponents(filePath: string, projectDir: string): Promise<void> {
  const segments = relative(projectDir, filePath).split(sep).filter(Boolean);
  let currentPath = projectDir;
  for (const segment of segments.slice(0, -1)) {
    currentPath = join(currentPath, segment);
    try {
      if ((await lstat(currentPath)).isSymbolicLink()) {
        throw new Error(`cannot use Grok Bot rule ${filePath}; tokenjuice will not read or write through symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function resolveSafeRulePath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  if (projectDir !== realProjectDir) {
    throw new Error(`cannot use Grok Bot rule ${resolvedPath}; tokenjuice will not read or write through symlinks`);
  }
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(`cannot use Grok Bot rule ${resolvedPath}; tokenjuice will not write outside ${realProjectDir}`);
  }
  await rejectSymlink(projectDir);
  await rejectSymlinkPathComponents(resolvedPath, projectDir);
  await rejectSymlink(resolvedPath);
  await rejectHardlink(resolvedPath);
  try {
    return join(await realpath(dirname(resolvedPath)), basename(resolvedPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return resolvedPath;
    }
    throw error;
  }
}

async function getRulePathContext(
  rulePath: string | undefined,
  options: GrokBotRuleOptions,
): Promise<{ projectDir: string; realProjectDir: string; rulePath: string }> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return {
    projectDir,
    realProjectDir,
    rulePath: rulePath ?? join(projectDir, ".cursor", "rules", "tokenjuice.mdc"),
  };
}

async function getDefaultAliasPath(options: GrokBotRuleOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".cursor", "rules", "tokenjuice.mdc");
}

async function resolveRulePath(rulePath?: string, options: GrokBotRuleOptions = {}): Promise<string> {
  const context = await getRulePathContext(rulePath, options);
  return resolveSafeRulePath(context.rulePath, context.projectDir, context.realProjectDir);
}

async function prepareRulePathForInstall(
  rulePath?: string,
  options: GrokBotRuleOptions = {},
): Promise<string> {
  const context = await getRulePathContext(rulePath, options);
  const initiallyResolved = await resolveSafeRulePath(
    context.rulePath,
    context.projectDir,
    context.realProjectDir,
  );
  const relativeParent = relative(context.projectDir, dirname(initiallyResolved));
  if (relativeParent.startsWith("..") || isAbsolute(relativeParent)) {
    throw new Error(
      `cannot use Grok Bot rule ${initiallyResolved}; tokenjuice will not write outside ${context.realProjectDir}`,
    );
  }

  let current = context.projectDir;
  for (const segment of relativeParent.split(sep).filter(Boolean)) {
    current = join(current, segment);
    try {
      await mkdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
    const stats = await lstat(current);
    const realCurrent = await realpath(current);
    if (!stats.isDirectory() || stats.isSymbolicLink() || !isInsideOrEqual(context.realProjectDir, realCurrent)) {
      throw new Error(
        `cannot use Grok Bot rule ${initiallyResolved}; tokenjuice will not read or write through unsafe parent paths`,
      );
    }
  }

  return resolveSafeRulePath(initiallyResolved, context.projectDir, context.realProjectDir);
}

function buildGrokBotRule(restoreBackupSuffix?: string): string {
  return [
    "---",
    'description: "Use tokenjuice for noisy terminal output in Grok Bot workspaces."',
    "alwaysApply: true",
    "---",
    "",
    TOKENJUICE_GROK_BOT_OWNERSHIP_MARKER,
    ...(restoreBackupSuffix ? [`${TOKENJUICE_GROK_BOT_RESTORE_MARKER_PREFIX}${restoreBackupSuffix} -->`] : []),
    "",
    `# ${TOKENJUICE_GROK_BOT_RULE_MARKER}`,
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet:
        "- When running terminal commands through Grok Bot, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
    }),
    "- Grok Bot owns command execution and output delivery.",
    "- Tokenjuice does not install an interception hook or rewrite Grok Bot tool results.",
    "",
  ].join("\n");
}

function isTokenjuiceRule(text: string): boolean {
  return /^---\r?\n(?:[^\r\n]*\r?\n)*---\r?\n\r?\n<!-- tokenjuice:grok-bot-rule -->(?:\r?\n|$)/u.test(text);
}

type RestoreBackupReference =
  | { kind: "none" }
  | { kind: "valid"; suffix: string }
  | { kind: "invalid" };

function inspectRestoreBackupReference(text: string): RestoreBackupReference {
  const markerLines = text.split(/\r?\n/u).filter((line) => line.includes(TOKENJUICE_GROK_BOT_RESTORE_MARKER_PREFIX));
  if (markerLines.length === 0) {
    return { kind: "none" };
  }
  if (markerLines.length !== 1) {
    return { kind: "invalid" };
  }
  const match = markerLines[0]?.trim().match(
    /^<!-- tokenjuice:grok-bot-restore-backup=(\.bak(?:\.\d+)?) -->$/u,
  );
  return match?.[1] ? { kind: "valid", suffix: match[1] } : { kind: "invalid" };
}

type VerifiedRuleSnapshot = {
  exists: boolean;
  text: string;
  mode: number;
};

async function readVerifiedRule(filePath: string): Promise<VerifiedRuleSnapshot> {
  let file;
  try {
    const noFollowFlag = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
    file = await open(filePath, constants.O_RDONLY | noFollowFlag);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { exists: false, text: "", mode: 0o644 };
    }
    if (code === "ELOOP") {
      throw new Error(`cannot use Grok Bot rule ${filePath}; tokenjuice will not read or write through symlinks`);
    }
    throw error;
  }

  try {
    const fileStats = await file.stat();
    const pathStats = await lstat(filePath);
    if (
      !fileStats.isFile()
      || !pathStats.isFile()
      || pathStats.isSymbolicLink()
      || fileStats.dev !== pathStats.dev
      || fileStats.ino !== pathStats.ino
      || fileStats.nlink !== 1
      || pathStats.nlink !== 1
    ) {
      throw new Error(`cannot use Grok Bot rule ${filePath}; expected one regular, non-linked project file`);
    }
    return { exists: true, text: await file.readFile("utf8"), mode: fileStats.mode & 0o777 };
  } finally {
    await file.close();
  }
}

function snapshotsMatch(actual: VerifiedRuleSnapshot, expected: VerifiedRuleSnapshot): boolean {
  return actual.exists === expected.exists
    && actual.text === expected.text
    && (!actual.exists || actual.mode === expected.mode);
}

async function chooseBackupPath(filePath: string): Promise<string> {
  for (let suffix = 0; ; suffix += 1) {
    const candidate = suffix === 0 ? `${filePath}.bak` : `${filePath}.bak.${suffix}`;
    try {
      const stats = await lstat(candidate);
      if (stats.isSymbolicLink()) {
        throw new Error(`cannot write Grok Bot rule backup ${candidate}; tokenjuice will not write through symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return candidate;
      }
      throw error;
    }
  }
}

async function writeExclusiveFile(filePath: string, text: string, mode: number): Promise<void> {
  const noFollowFlag = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const file = await open(
    filePath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag,
    mode,
  );
  try {
    await file.writeFile(text, "utf8");
    await file.chmod(mode);
    const fileStats = await file.stat();
    const pathStats = await lstat(filePath);
    if (
      !fileStats.isFile()
      || !pathStats.isFile()
      || pathStats.isSymbolicLink()
      || fileStats.dev !== pathStats.dev
      || fileStats.ino !== pathStats.ino
      || fileStats.nlink !== 1
      || pathStats.nlink !== 1
    ) {
      throw new Error(`cannot safely write Grok Bot rule file ${filePath}; the path changed during the operation`);
    }
  } finally {
    await file.close();
  }
}

async function writeBackup(backupPath: string, snapshot: VerifiedRuleSnapshot): Promise<void> {
  await writeExclusiveFile(backupPath, snapshot.text, snapshot.mode);
}

async function publishClaimedRule(claimedPath: string, destinationPath: string, mode: number): Promise<boolean> {
  try {
    await link(claimedPath, destinationPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    try {
      const claimed = await readVerifiedRule(claimedPath);
      if (!claimed.exists) {
        throw new Error(`cannot recover Grok Bot rule from missing claimed file ${claimedPath}`);
      }
      await writeExclusiveFile(destinationPath, claimed.text, mode);
    } catch (copyError) {
      if ((copyError as NodeJS.ErrnoException).code === "EEXIST") {
        return false;
      }
      throw copyError;
    }
  }
  await rm(claimedPath, { force: true });
  return true;
}

async function preserveClaimedRule(claimedPath: string, filePath: string, mode: number): Promise<void> {
  for (let suffix = 0; ; suffix += 1) {
    const recoveryPath = suffix === 0
      ? `${filePath}.tokenjuice-recovery`
      : `${filePath}.tokenjuice-recovery.${suffix}`;
    if (await publishClaimedRule(claimedPath, recoveryPath, mode)) {
      return;
    }
  }
}

async function replaceRuleIfUnchanged(
  filePath: string,
  expected: VerifiedRuleSnapshot,
  nextText: string,
  nextMode = expected.mode,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempDir = await mkdtemp(join(dirname(filePath), ".tokenjuice-grok-bot-"));
  const nextPath = join(tempDir, "next");
  const claimedPath = join(tempDir, "claimed");
  let claimed = false;
  try {
    await writeExclusiveFile(nextPath, nextText, nextMode);
    if (!expected.exists) {
      try {
        await link(nextPath, filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new Error(`cannot safely install Grok Bot rule at ${filePath}; the file appeared during install`);
        }
        throw error;
      }
      return;
    }

    await rename(filePath, claimedPath);
    claimed = true;
    if (!snapshotsMatch(await readVerifiedRule(claimedPath), expected)) {
      throw new Error(`cannot safely update Grok Bot rule at ${filePath}; the file changed during the operation`);
    }
    try {
      await link(nextPath, filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(`cannot safely update Grok Bot rule at ${filePath}; another writer created the file`);
      }
      throw error;
    }
    await rm(claimedPath, { force: true });
    claimed = false;
  } finally {
    if (claimed) {
      if (!(await publishClaimedRule(claimedPath, filePath, expected.mode))) {
        await preserveClaimedRule(claimedPath, filePath, expected.mode);
      }
      claimed = false;
    }
    if (!claimed) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function removeRuleIfUnchanged(filePath: string, expected: VerifiedRuleSnapshot): Promise<void> {
  const tempDir = await mkdtemp(join(dirname(filePath), ".tokenjuice-grok-bot-remove-"));
  const claimedPath = join(tempDir, "claimed");
  let claimed = false;
  try {
    await rename(filePath, claimedPath);
    claimed = true;
    if (!snapshotsMatch(await readVerifiedRule(claimedPath), expected)) {
      throw new Error(`cannot safely remove Grok Bot rule at ${filePath}; the file changed during the operation`);
    }
    await rm(claimedPath, { force: true });
    claimed = false;
  } catch (error) {
    if (claimed) {
      if (!(await publishClaimedRule(claimedPath, filePath, expected.mode))) {
        await preserveClaimedRule(claimedPath, filePath, expected.mode);
      }
      claimed = false;
    }
    throw error;
  } finally {
    if (!claimed) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function restoreBackupIfUnchanged(
  filePath: string,
  expectedRule: VerifiedRuleSnapshot,
  backupPath: string,
  expectedBackup: VerifiedRuleSnapshot,
): Promise<void> {
  const tempDir = await mkdtemp(join(dirname(filePath), ".tokenjuice-grok-bot-restore-"));
  const claimedBackupPath = join(tempDir, "backup");
  let backupClaimed = false;
  try {
    await rename(backupPath, claimedBackupPath);
    backupClaimed = true;
    if (!snapshotsMatch(await readVerifiedRule(claimedBackupPath), expectedBackup)) {
      throw new Error(`cannot safely restore the original Grok Bot rule from ${backupPath}; the backup changed`);
    }
    await replaceRuleIfUnchanged(filePath, expectedRule, expectedBackup.text, expectedBackup.mode);
    await rm(claimedBackupPath, { force: true });
    backupClaimed = false;
  } catch (error) {
    if (backupClaimed) {
      if (!(await publishClaimedRule(claimedBackupPath, backupPath, expectedBackup.mode))) {
        await preserveClaimedRule(claimedBackupPath, backupPath, expectedBackup.mode);
      }
      backupClaimed = false;
    }
    throw error;
  } finally {
    if (!backupClaimed) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

export async function installGrokBotRule(
  rulePath?: string,
  options: GrokBotRuleOptions = {},
): Promise<InstallGrokBotRuleResult> {
  const resolvedRulePath = await prepareRulePathForInstall(rulePath, options);
  const existing = await readVerifiedRule(resolvedRulePath);
  const restoreBackupReference = isTokenjuiceRule(existing.text)
    ? inspectRestoreBackupReference(existing.text)
    : { kind: "none" as const };
  if (restoreBackupReference.kind === "invalid") {
    throw new Error(`cannot safely repair ${resolvedRulePath}; its restore backup marker is malformed or duplicated`);
  }
  const restoreBackupSuffix = restoreBackupReference.kind === "valid"
    ? restoreBackupReference.suffix
    : undefined;
  const expectedRule = buildGrokBotRule(restoreBackupSuffix);
  if (existing.exists && existing.text === expectedRule) {
    return { rulePath: resolvedRulePath };
  }

  let backupPath: string | undefined;
  let nextRule = expectedRule;
  if (existing.exists && !isTokenjuiceRule(existing.text)) {
    backupPath = await chooseBackupPath(resolvedRulePath);
    await writeBackup(backupPath, existing);
    nextRule = buildGrokBotRule(backupPath.slice(resolvedRulePath.length));
  }
  try {
    await replaceRuleIfUnchanged(resolvedRulePath, existing, nextRule);
  } catch (error) {
    if (backupPath) {
      await removeRuleIfUnchanged(backupPath, {
        exists: true,
        text: existing.text,
        mode: existing.mode,
      }).catch(() => undefined);
    }
    throw error;
  }
  return { rulePath: resolvedRulePath, ...(backupPath ? { backupPath } : {}) };
}

export async function uninstallGrokBotRule(
  rulePath?: string,
  options: GrokBotRuleOptions = {},
): Promise<UninstallGrokBotRuleResult> {
  const resolvedRulePath = await resolveRulePath(rulePath, options);
  const existing = await readVerifiedRule(resolvedRulePath);
  if (!existing.exists) {
    return { rulePath: resolvedRulePath, removed: false, restoredBackup: false };
  }
  if (!isTokenjuiceRule(existing.text)) {
    throw new Error(`refusing to remove ${resolvedRulePath}; it is not the tokenjuice Grok Bot rule`);
  }

  const restoreBackupReference = inspectRestoreBackupReference(existing.text);
  if (restoreBackupReference.kind === "invalid") {
    throw new Error(`cannot safely uninstall ${resolvedRulePath}; its restore backup marker is malformed or duplicated`);
  }
  if (restoreBackupReference.kind === "valid") {
    const backupPath = `${resolvedRulePath}${restoreBackupReference.suffix}`;
    const backup = await readVerifiedRule(backupPath);
    if (!backup.exists || isTokenjuiceRule(backup.text)) {
      throw new Error(`cannot restore the original Grok Bot rule from ${backupPath}; review the backup manually`);
    }
    await restoreBackupIfUnchanged(resolvedRulePath, existing, backupPath, backup);
    return { rulePath: resolvedRulePath, removed: true, restoredBackup: true };
  }

  await removeRuleIfUnchanged(resolvedRulePath, existing);
  return { rulePath: resolvedRulePath, removed: true, restoredBackup: false };
}

export async function doctorGrokBotRule(
  rulePath?: string,
  options: GrokBotRuleOptions = {},
): Promise<GrokBotDoctorReport> {
  let resolvedRulePath: string;
  try {
    resolvedRulePath = await resolveRulePath(rulePath, options);
  } catch (error) {
    return {
      rulePath: rulePath ?? (await getDefaultAliasPath(options)),
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_GROK_BOT_ADVISORY,
        fixCommand: TOKENJUICE_GROK_BOT_FIX_COMMAND,
      }),
    };
  }

  let existing: VerifiedRuleSnapshot;
  try {
    existing = await readVerifiedRule(resolvedRulePath);
  } catch (error) {
    return {
      rulePath: resolvedRulePath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_GROK_BOT_ADVISORY,
        fixCommand: TOKENJUICE_GROK_BOT_FIX_COMMAND,
      }),
    };
  }

  const hasTokenjuiceMarker = isTokenjuiceRule(existing.text);
  if (!existing.exists || !hasTokenjuiceMarker) {
    return {
      rulePath: resolvedRulePath,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: existing.exists
          ? ["tokenjuice Grok Bot rule is not installed; existing rule file is not tokenjuice-managed"]
          : ["tokenjuice Grok Bot rule is not installed"],
        advisory: TOKENJUICE_GROK_BOT_ADVISORY,
        fixCommand: TOKENJUICE_GROK_BOT_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_GROK_BOT_OWNERSHIP_MARKER,
        missingIssue: "configured Grok Bot rule is missing the tokenjuice ownership marker",
      },
      {
        requiredText: TOKENJUICE_GROK_BOT_RULE_MARKER,
        missingIssue: "configured Grok Bot rule does not look like the tokenjuice rule",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Grok Bot rule is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Grok Bot rule is missing the raw escape hatch",
      },
      {
        requiredText: "does not install an interception hook or rewrite Grok Bot tool results",
        missingIssue: "configured Grok Bot rule is missing the guidance-only boundary",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Grok Bot rule still suggests the full escape hatch",
      },
    ],
  });
  const frontmatter = inspectFrontmatter(existing.text);
  if (!frontmatter.isValid) {
    issues.unshift("configured Grok Bot rule has invalid or duplicate frontmatter");
  }
  if (!frontmatter.hasDescription) {
    issues.unshift("configured Grok Bot rule is missing description frontmatter");
  }
  if (!frontmatter.hasAlwaysApply) {
    issues.unshift("configured Grok Bot rule is missing alwaysApply frontmatter");
  }

  const restoreBackupReference = inspectRestoreBackupReference(existing.text);
  if (restoreBackupReference.kind === "invalid") {
    issues.push("configured Grok Bot rule has a malformed or duplicated restore backup marker");
  } else if (restoreBackupReference.kind === "valid") {
    const backupPath = `${resolvedRulePath}${restoreBackupReference.suffix}`;
    try {
      const backup = await readVerifiedRule(backupPath);
      if (!backup.exists) {
        issues.push(`configured Grok Bot rule references missing restore backup ${backupPath}`);
      } else if (isTokenjuiceRule(backup.text)) {
        issues.push(`configured Grok Bot rule restore backup ${backupPath} is tokenjuice-managed`);
      }
    } catch (error) {
      issues.push((error as Error).message);
    }
  }

  return {
    rulePath: resolvedRulePath,
    hasTokenjuiceMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_GROK_BOT_ADVISORY,
      fixCommand: TOKENJUICE_GROK_BOT_FIX_COMMAND,
    }),
  };
}
