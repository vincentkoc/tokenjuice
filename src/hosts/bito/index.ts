import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
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
import {
  assertSafeInstructionBackupPath,
  collectGuidanceIssues,
  readInstructionFile,
  removeInstructionFile,
  writeInstructionFile,
} from "../shared/instruction-file.js";

export type BitoGuidelinesOptions = {
  projectDir?: string;
};

export type InstallBitoGuidelinesResult = {
  configPath: string;
  guidelinesPath: string;
  configBackupPath?: string;
  guidelinesBackupPath?: string;
};

export type UninstallBitoGuidelinesResult = {
  configPath: string;
  guidelinesPath: string;
  removed: boolean;
};

export type BitoDoctorReport = {
  configPath: string;
  guidelinesPath: string;
  hasTokenjuiceMarker: boolean;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_BITO_FIX_COMMAND = "tokenjuice install bito";
const TOKENJUICE_BITO_BEGIN = "# tokenjuice:bito begin";
const TOKENJUICE_BITO_END = "# tokenjuice:bito end";
const TOKENJUICE_BITO_GUIDELINES_MARKER = "# tokenjuice terminal output compaction";
const TOKENJUICE_BITO_GUIDELINES_RELATIVE_PATH = "./.bito/tokenjuice.md";
const TOKENJUICE_BITO_ADVISORY =
  "Bito support is beta and custom-guidelines based; Bito still owns PR review, analysis settings, tools, and comment delivery.";

function getExplicitProjectDir(options: BitoGuidelinesOptions = {}): string | undefined {
  return options.projectDir || process.env.BITO_PROJECT_DIR;
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

async function resolveProjectDir(options: BitoGuidelinesOptions = {}): Promise<string> {
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

async function rejectInstructionSymlink(filePath: string, label: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`cannot use Bito ${label} ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function rejectSymlinkPathComponents(filePath: string, projectDir: string, label: string): Promise<void> {
  const relativePath = relative(projectDir, filePath);
  const segments = relativePath.split(sep).filter(Boolean);
  let currentPath = projectDir;
  for (const segment of segments.slice(0, -1)) {
    currentPath = join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`cannot use Bito ${label} ${filePath}; tokenjuice will not read or write through instruction symlinks`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function resolveSafeProjectPath(filePath: string, projectDir: string, realProjectDir: string, label: string): Promise<string> {
  const resolvedPath = resolve(filePath);
  if (projectDir !== realProjectDir) {
    throw new Error(`cannot use Bito ${label} ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
  }
  await rejectInstructionSymlink(projectDir, label);
  await rejectSymlinkPathComponents(resolvedPath, projectDir, label);
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use Bito ${label} ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectInstructionSymlink(resolvedPath, label);
  return resolvedPath;
}

async function getProjectPaths(options: BitoGuidelinesOptions = {}): Promise<{ configPath: string; guidelinesPath: string }> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return {
    configPath: await resolveSafeProjectPath(join(projectDir, ".bito.yaml"), projectDir, realProjectDir, "config"),
    guidelinesPath: await resolveSafeProjectPath(join(projectDir, ".bito", "tokenjuice.md"), projectDir, realProjectDir, "guidelines"),
  };
}

async function getProjectAliasPaths(options: BitoGuidelinesOptions = {}): Promise<{ configPath: string; guidelinesPath: string }> {
  const projectDir = await resolveProjectDir(options);
  return {
    configPath: join(projectDir, ".bito.yaml"),
    guidelinesPath: join(projectDir, ".bito", "tokenjuice.md"),
  };
}

async function resolveSafeProjectPathIfAvailable(
  filePath: string,
  projectDir: string,
  realProjectDir: string,
  label: string,
): Promise<string | undefined> {
  try {
    return await resolveSafeProjectPath(filePath, projectDir, realProjectDir, label);
  } catch {
    return undefined;
  }
}

async function detectTokenjuiceMarkerEvidence(options: BitoGuidelinesOptions = {}): Promise<boolean> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  const configPath = await resolveSafeProjectPathIfAvailable(join(projectDir, ".bito.yaml"), projectDir, realProjectDir, "config");
  if (configPath) {
    const config = await readInstructionFile(configPath);
    const markerState = inspectMarkerDelimitedBlock(config.text, TOKENJUICE_BITO_CONFIG);
    if (config.exists && hasTokenjuiceConfigMarkers(config.text, markerState.completeBlockCount)) {
      return true;
    }
  }

  const guidelinesPath = await resolveSafeProjectPathIfAvailable(
    join(projectDir, ".bito", "tokenjuice.md"),
    projectDir,
    realProjectDir,
    "guidelines",
  );
  if (guidelinesPath) {
    const guidelines = await readInstructionFile(guidelinesPath);
    if (guidelines.exists && hasTokenjuiceGuidelinesMarker(guidelines.text)) {
      return true;
    }
  }
  return false;
}

const TOKENJUICE_BITO_GUIDELINES = [
  TOKENJUICE_BITO_GUIDELINES_MARKER,
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When Bito review, chat, or tool workflows suggest terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
  }),
  "- Bito reads this file through `.bito.yaml` custom guidelines; Bito still owns PR review, tools, app settings, and comment delivery.",
  "",
].join("\n");

const TOKENJUICE_BITO_CONFIG_BLOCK = [
  TOKENJUICE_BITO_BEGIN,
  "custom_guidelines:",
  "  general:",
  '    - name: "Tokenjuice terminal output compaction"',
  `      path: "${TOKENJUICE_BITO_GUIDELINES_RELATIVE_PATH}"`,
  TOKENJUICE_BITO_END,
].join("\n");

const TOKENJUICE_BITO_CONFIG = {
  beginMarker: TOKENJUICE_BITO_BEGIN,
  endMarker: TOKENJUICE_BITO_END,
  block: TOKENJUICE_BITO_CONFIG_BLOCK,
};

function getTokenjuiceConfigBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_BITO_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_BITO_END, beginIndex + TOKENJUICE_BITO_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_BITO_END.length);
}

function removeTokenjuiceConfigBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_BITO_BEGIN);
  if (beginIndex === -1) {
    return text;
  }
  const endIndex = text.indexOf(TOKENJUICE_BITO_END, beginIndex + TOKENJUICE_BITO_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(0, beginIndex);
  }
  return `${text.slice(0, beginIndex)}${text.slice(endIndex + TOKENJUICE_BITO_END.length)}`;
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_BITO_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_BITO_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

function hasTokenjuiceConfigMarkers(text: string, completeBlockCount: number): boolean {
  return text.includes(TOKENJUICE_BITO_BEGIN) || text.includes(TOKENJUICE_BITO_END) || completeBlockCount > 0;
}

function hasTokenjuiceGuidelinesMarker(text: string): boolean {
  return text.includes(TOKENJUICE_BITO_GUIDELINES_MARKER);
}

function hasUserOwnedCustomGuidelines(text: string): boolean {
  return /^\s*(?:"custom_guidelines"|'custom_guidelines'|custom_guidelines)\s*:/mu.test(removeTokenjuiceConfigBlockText(text));
}

function collectBitoMarkerIssues(text: string, completeBlockCount: number): string[] {
  const beginCount = countMarker(text, TOKENJUICE_BITO_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_BITO_END);
  if (beginCount === 0 && endCount === 0) {
    return ["configured Bito config is missing tokenjuice markers"];
  }
  if (beginCount > 1 || endCount > 1 || completeBlockCount > 1) {
    return [`configured Bito config has multiple tokenjuice blocks; run ${TOKENJUICE_BITO_FIX_COMMAND} to repair`];
  }
  if (beginCount === 1 && endCount === 0) {
    return ["configured Bito config has a tokenjuice start marker without an end marker"];
  }
  if (beginCount === 0 && endCount === 1) {
    return ["configured Bito config has a tokenjuice end marker without a start marker"];
  }
  if (completeBlockCount !== 1) {
    return ["configured Bito config has tokenjuice markers in an unsupported order"];
  }
  return [];
}

export async function installBitoGuidelines(options: BitoGuidelinesOptions = {}): Promise<InstallBitoGuidelinesResult> {
  const paths = await getProjectPaths(options);
  const existingConfig = await readInstructionFile(paths.configPath);
  const markerState = inspectMarkerDelimitedBlock(existingConfig.text, TOKENJUICE_BITO_CONFIG);
  if (existingConfig.exists && hasMalformedMarkerStructure(existingConfig.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely repair malformed tokenjuice Bito markers in ${paths.configPath}; remove the dangling marker manually, then rerun tokenjuice install bito`,
    );
  }
  if (existingConfig.exists && hasUserOwnedCustomGuidelines(existingConfig.text)) {
    throw new Error(
      `cannot install Bito guidance because ${paths.configPath} already defines custom_guidelines; add ${TOKENJUICE_BITO_GUIDELINES_RELATIVE_PATH} manually or remove the custom_guidelines block, then rerun tokenjuice install bito`,
    );
  }

  await assertSafeInstructionBackupPath(paths.configPath);
  await assertSafeInstructionBackupPath(paths.guidelinesPath);
  const guidelines = await writeInstructionFile(paths.guidelinesPath, TOKENJUICE_BITO_GUIDELINES);
  const config = await installMarkerDelimitedBlock(paths.configPath, TOKENJUICE_BITO_CONFIG);
  return {
    configPath: config.filePath,
    guidelinesPath: guidelines.filePath,
    ...(config.backupPath ? { configBackupPath: config.backupPath } : {}),
    ...(guidelines.backupPath ? { guidelinesBackupPath: guidelines.backupPath } : {}),
  };
}

export async function uninstallBitoGuidelines(options: BitoGuidelinesOptions = {}): Promise<UninstallBitoGuidelinesResult> {
  const paths = await getProjectPaths(options);
  const existingConfig = await readInstructionFile(paths.configPath);
  const markerState = inspectMarkerDelimitedBlock(existingConfig.text, TOKENJUICE_BITO_CONFIG);
  if (existingConfig.exists && hasMalformedMarkerStructure(existingConfig.text, markerState.completeBlockCount)) {
    throw new Error(
      `cannot safely uninstall malformed tokenjuice Bito markers in ${paths.configPath}; remove the dangling marker manually, then rerun tokenjuice uninstall bito`,
    );
  }

  const config = await uninstallMarkerDelimitedBlock(paths.configPath, TOKENJUICE_BITO_CONFIG);
  const existingGuidelines = await readInstructionFile(paths.guidelinesPath);
  const guidelines = existingGuidelines.exists && hasTokenjuiceGuidelinesMarker(existingGuidelines.text)
    ? await removeInstructionFile(paths.guidelinesPath)
    : { filePath: paths.guidelinesPath, removed: false };
  return { configPath: paths.configPath, guidelinesPath: paths.guidelinesPath, removed: config.removed || guidelines.removed };
}

export async function doctorBitoGuidelines(options: BitoGuidelinesOptions = {}): Promise<BitoDoctorReport> {
  let paths: { configPath: string; guidelinesPath: string };
  try {
    paths = await getProjectPaths(options);
  } catch (error) {
    const aliases = await getProjectAliasPaths(options);
    const hasTokenjuiceMarker = await detectTokenjuiceMarkerEvidence(options).catch(() => false);
    return {
      ...aliases,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_BITO_ADVISORY,
        fixCommand: "replace symlinked Bito files with regular project files, then run tokenjuice install bito",
      }),
    };
  }

  const config = await readInstructionFile(paths.configPath);
  const guidelines = await readInstructionFile(paths.guidelinesPath);
  const markerState = inspectMarkerDelimitedBlock(config.text, TOKENJUICE_BITO_CONFIG);
  const hasConfigMarkers = config.exists && hasTokenjuiceConfigMarkers(config.text, markerState.completeBlockCount);
  const hasGuidelinesMarker = guidelines.exists && hasTokenjuiceGuidelinesMarker(guidelines.text);
  const hasTokenjuiceMarker = hasConfigMarkers || hasGuidelinesMarker;
  if (!hasConfigMarkers && !hasGuidelinesMarker) {
    return {
      ...paths,
      hasTokenjuiceMarker,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Bito custom guidelines are not installed"],
        advisory: TOKENJUICE_BITO_ADVISORY,
        fixCommand: TOKENJUICE_BITO_FIX_COMMAND,
      }),
    };
  }

  const markerIssues = config.exists
    ? collectBitoMarkerIssues(config.text, markerState.completeBlockCount)
    : ["configured Bito config is missing .bito.yaml"];
  const configIssues = collectGuidanceIssues(getTokenjuiceConfigBlockText(config.text), {
    required: [
      {
        requiredText: "custom_guidelines:",
        missingIssue: "configured Bito config is missing custom_guidelines",
      },
      {
        requiredText: TOKENJUICE_BITO_GUIDELINES_RELATIVE_PATH,
        missingIssue: "configured Bito config is missing the tokenjuice guidelines path",
      },
    ],
  });
  const guidelinesIssues = guidelines.exists
    ? collectGuidanceIssues(guidelines.text, {
        required: [
          {
            requiredText: TOKENJUICE_BITO_GUIDELINES_MARKER,
            missingIssue: "configured Bito guidelines do not look like the tokenjuice guidelines",
          },
          {
            requiredText: TOKENJUICE_WRAP_COMMAND,
            missingIssue: "configured Bito guidelines are missing tokenjuice wrap guidance",
          },
          {
            requiredText: TOKENJUICE_RAW_COMMAND,
            missingIssue: "configured Bito guidelines are missing the raw escape hatch",
          },
        ],
        forbidden: [
          {
            forbiddenText: TOKENJUICE_FULL_COMMAND,
            presentIssue: "configured Bito guidelines still suggest the full escape hatch",
          },
        ],
      })
    : ["configured Bito guidelines file is missing"];
  const issues = [...markerIssues, ...configIssues, ...guidelinesIssues];

  return {
    ...paths,
    hasTokenjuiceMarker,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_BITO_ADVISORY,
      fixCommand: hasMalformedMarkerStructure(config.text, markerState.completeBlockCount)
        ? "remove unmatched tokenjuice markers from .bito.yaml, then run tokenjuice install bito"
        : TOKENJUICE_BITO_FIX_COMMAND,
    }),
  };
}
