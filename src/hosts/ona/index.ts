import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import { buildInstructionDoctorReportFields } from "../shared/instruction-doctor.js";
import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";

export type OnaSkillOptions = {
  projectDir?: string;
};

export type InstallOnaSkillResult = {
  skillPath: string;
  backupPath?: string;
  legacyInstructionsPath?: string;
  legacyRemoved?: boolean;
};

export type UninstallOnaSkillResult = {
  skillPath: string;
  removed: boolean;
  legacyInstructionsPath?: string;
  legacyRemoved?: boolean;
};

export type OnaInstructionsOptions = OnaSkillOptions;

export type InstallOnaInstructionsResult = InstallOnaSkillResult & {
  instructionsPath: string;
};

export type UninstallOnaInstructionsResult = UninstallOnaSkillResult & {
  instructionsPath: string;
};

export type OnaDoctorReport = {
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

const TOKENJUICE_ONA_FIX_COMMAND = "tokenjuice install ona";
const TOKENJUICE_ONA_OWNERSHIP_MARKER = "<!-- tokenjuice:ona skill -->";
const TOKENJUICE_ONA_SKILL_MARKER = "# tokenjuice terminal output compaction";
const TOKENJUICE_ONA_SKILL_PATH = ".ona/skills/tokenjuice/SKILL.md";
const TOKENJUICE_ONA_LEGACY_BEGIN = "<!-- tokenjuice:ona begin -->";
const TOKENJUICE_ONA_LEGACY_END = "<!-- tokenjuice:ona end -->";
const TOKENJUICE_ONA_ADVISORY =
  "Ona support is beta and skill-based; Ona discovers .ona/skills/tokenjuice/SKILL.md in workspace sessions, but tokenjuice does not intercept shell output.";
const TOKENJUICE_ONA_LEGACY_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_ONA_LEGACY_BEGIN,
  endMarker: TOKENJUICE_ONA_LEGACY_END,
  block: [TOKENJUICE_ONA_LEGACY_BEGIN, "# tokenjuice terminal output compaction", TOKENJUICE_ONA_LEGACY_END].join("\n"),
};

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function hasMalformedLegacyMarkerStructure(text: string, completeBlockCount: number): boolean {
  const beginCount = countMarker(text, TOKENJUICE_ONA_LEGACY_BEGIN);
  const endCount = countMarker(text, TOKENJUICE_ONA_LEGACY_END);
  return beginCount !== endCount || beginCount !== completeBlockCount || endCount !== completeBlockCount;
}

function getExplicitProjectDir(options: OnaSkillOptions = {}): string | undefined {
  return options.projectDir || process.env.ONA_PROJECT_DIR;
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

async function resolveProjectDir(options: OnaSkillOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function resolveCanonicalProjectDir(options: OnaSkillOptions = {}): Promise<string> {
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
      throw new Error(`cannot use Ona skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function isSymlink(filePath: string): Promise<boolean> {
  try {
    return (await lstat(filePath)).isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
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
        throw new Error(`cannot use Ona skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
  return join(projectDir, TOKENJUICE_ONA_SKILL_PATH);
}

async function resolveSafeProjectSkillPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  await rejectSkillSymlink(projectDir);
  await rejectSkillPathComponentSymlinks(resolvedPath, projectDir);
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(`cannot use Ona skill ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`);
  }

  await rejectSkillSymlink(resolvedPath);
  const expectedSkillPath = getExpectedSkillPath(projectDir);
  if (resolvedPath !== expectedSkillPath) {
    throw new Error(`cannot use Ona skill ${resolvedPath}; tokenjuice only installs the project-local ${TOKENJUICE_ONA_SKILL_PATH} file`);
  }
  return resolvedPath;
}

async function getDefaultSkillPath(options: OnaSkillOptions = {}): Promise<string> {
  const projectDir = await resolveCanonicalProjectDir(options);
  return resolveSafeProjectSkillPath(getExpectedSkillPath(projectDir), projectDir, projectDir);
}

async function getDefaultLegacyInstructionsPath(options: OnaSkillOptions = {}): Promise<string> {
  return join(await resolveCanonicalProjectDir(options), "AGENTS.md");
}

async function getDefaultAliasPath(options: OnaSkillOptions = {}): Promise<string> {
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

async function resolveSkillPath(skillPath?: string, options: OnaSkillOptions = {}): Promise<string> {
  if (skillPath) {
    const projectDir = await resolveCanonicalProjectDir(options);
    return resolveSafeProjectSkillPath(await resolveCanonicalInstructionPath(skillPath), projectDir, projectDir);
  }
  return getDefaultSkillPath(options);
}

function stripYamlComment(value: string): { value: string; isValid: boolean } {
  let quote: "\"" | "'" | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote === "\"") {
      if (char === "\\" && index + 1 < value.length) {
        index += 1;
        continue;
      }
      if (char === "\"") {
        quote = undefined;
      }
      continue;
    }
    if (quote === "'") {
      if (char === "'" && value[index + 1] === "'") {
        index += 1;
        continue;
      }
      if (char === "'") {
        quote = undefined;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || /\s/u.test(value[index - 1] ?? ""))) {
      return { value: value.slice(0, index).trim(), isValid: true };
    }
  }

  return { value: value.trim(), isValid: quote === undefined };
}

function hasHexDigits(value: string, start: number, length: number): boolean {
  if (start + length > value.length) {
    return false;
  }
  return /^[0-9A-Fa-f]+$/u.test(value.slice(start, start + length));
}

function isValidDoubleQuotedYamlScalar(value: string): boolean {
  if (!value.startsWith("\"") || !value.endsWith("\"")) {
    return false;
  }
  for (let index = 1; index < value.length - 1; index += 1) {
    if (value[index] === "\"") {
      return false;
    }
    if (value[index] !== "\\") {
      continue;
    }
    const escape = value[index + 1];
    if (!escape) {
      return false;
    }
    if ("0abtnvfre\"/\\N_LP".includes(escape)) {
      index += 1;
      continue;
    }
    const hexLength = escape === "x" ? 2 : escape === "u" ? 4 : escape === "U" ? 8 : 0;
    if (hexLength === 0 || !hasHexDigits(value, index + 2, hexLength)) {
      return false;
    }
    index += 1 + hexLength;
  }
  return true;
}

function isValidSimpleYamlScalar(rawValue: string): boolean {
  const stripped = stripYamlComment(rawValue);
  if (!stripped.isValid) {
    return false;
  }
  const value = stripped.value;
  if (value === "") {
    return true;
  }
  if (value.startsWith("\"")) {
    return isValidDoubleQuotedYamlScalar(value);
  }
  if (value.startsWith("'")) {
    return /^'(?:''|[^'])*'$/u.test(value);
  }
  if (/[[\]{}]/u.test(value) || /:(?:$|[\s,[\]{}])/u.test(value)) {
    return false;
  }
  if (/^[-?:]\s/u.test(value)) {
    return false;
  }
  return !/^[@,&*!|>%`]/u.test(value);
}

function isYamlBlockScalarHeader(value: string): boolean {
  return /^[|>](?:[+-][1-9]?|[1-9][+-]?)?$/u.test(value);
}

function normalizeYamlScalar(value: string): string {
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1).replace(/\\(["\\])/gu, "$1");
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/gu, "'");
  }
  return value;
}

function parseSimpleYamlFrontmatter(frontmatter: string[]): { hasValidYaml: boolean; values: Map<string, string> } {
  const values = new Map<string, string>();
  for (let index = 0; index < frontmatter.length; index += 1) {
    const line = frontmatter[index] ?? "";
    const trimmedLine = line.trim();
    if (trimmedLine === "" || trimmedLine.startsWith("#")) {
      continue;
    }
    const match = /^\s*([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line);
    if (!match) {
      return { hasValidYaml: false, values };
    }
    const key = match[1] ?? "";
    if (values.has(key)) {
      return { hasValidYaml: false, values };
    }
    const rawValue = match[2] ?? "";
    const stripped = stripYamlComment(rawValue);
    if (!stripped.isValid) {
      return { hasValidYaml: false, values };
    }
    if (isYamlBlockScalarHeader(stripped.value)) {
      const blockLines: string[] = [];
      for (index += 1; index < frontmatter.length; index += 1) {
        const blockLine = frontmatter[index] ?? "";
        if (blockLine.trim() === "") {
          blockLines.push("");
          continue;
        }
        if (/^\s/u.test(blockLine)) {
          blockLines.push(blockLine.trimEnd());
          continue;
        }
        index -= 1;
        break;
      }
      values.set(key, blockLines.join("\n").trim());
      continue;
    }
    if (!isValidSimpleYamlScalar(rawValue)) {
      return { hasValidYaml: false, values };
    }
    values.set(key, normalizeYamlScalar(stripped.value));
  }
  return { hasValidYaml: true, values };
}

function inspectSkillFrontmatter(text: string): { hasName: boolean; hasDescription: boolean; hasValidYaml: boolean } {
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== "---") {
    return { hasName: false, hasDescription: false, hasValidYaml: false };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (endIndex < 0) {
    return { hasName: false, hasDescription: false, hasValidYaml: false };
  }

  const frontmatter = lines.slice(1, endIndex);
  const parsed = parseSimpleYamlFrontmatter(frontmatter);
  return {
    hasName: parsed.values.get("name") === "tokenjuice",
    hasDescription: (parsed.values.get("description") ?? "") !== "",
    hasValidYaml: parsed.hasValidYaml,
  };
}

const TOKENJUICE_ONA_SKILL = [
  "---",
  "name: tokenjuice",
  'description: "Use when Ona Agent is running terminal or shell commands, tests, builds, or log-heavy commands likely to produce long output; prefer tokenjuice wrap for compacted output."',
  "---",
  "",
  TOKENJUICE_ONA_OWNERSHIP_MARKER,
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When Ona Agent runs terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
  }),
  "- Ona Agent discovers this reusable skill from `.ona/skills/tokenjuice/SKILL.md` and still owns shell execution and tool output delivery.",
  "",
].join("\n");

async function inspectLegacyOnaInstructions(options: OnaSkillOptions = {}): Promise<{
  instructionsPath: string;
  hasLegacyBlock: boolean;
  issues: string[];
  unsafeIssues: string[];
}> {
  const instructionsPath = await getDefaultLegacyInstructionsPath(options);
  if (await isSymlink(instructionsPath)) {
    return { instructionsPath, hasLegacyBlock: false, issues: [], unsafeIssues: [] };
  }

  const existing = await readInstructionFile(instructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_ONA_LEGACY_BLOCK_CONFIG);
  const hasLegacyBlock = existing.exists && (markerState.hasBegin || markerState.hasEnd);
  if (!hasLegacyBlock) {
    return { instructionsPath, hasLegacyBlock: false, issues: [], unsafeIssues: [] };
  }
  const unsafeIssues = hasMalformedLegacyMarkerStructure(existing.text, markerState.completeBlockCount)
    ? [
        `configured legacy Ona instructions have malformed tokenjuice markers; remove the dangling marker manually, then rerun ${TOKENJUICE_ONA_FIX_COMMAND}`,
      ]
    : [];

  return {
    instructionsPath,
    hasLegacyBlock: true,
    issues: [
      ...collectMarkerDelimitedBlockIssues(markerState, {
        configuredLabel: "legacy Ona instructions",
        repairCommand: TOKENJUICE_ONA_FIX_COMMAND,
      }),
      ...unsafeIssues,
    ],
    unsafeIssues,
  };
}

async function uninstallLegacyOnaInstructions(options: OnaSkillOptions = {}): Promise<{
  instructionsPath: string;
  removed: boolean;
}> {
  const instructionsPath = await getDefaultLegacyInstructionsPath(options);
  if (await isSymlink(instructionsPath)) {
    return { instructionsPath, removed: false };
  }

  const legacy = await inspectLegacyOnaInstructions(options);
  if (legacy.unsafeIssues.length > 0) {
    throw new Error(
      `cannot safely migrate malformed tokenjuice markers in ${legacy.instructionsPath}; remove the dangling marker manually, then rerun tokenjuice install ona`,
    );
  }

  const result = await uninstallMarkerDelimitedBlock(instructionsPath, TOKENJUICE_ONA_LEGACY_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function installOnaSkill(skillPath?: string, options: OnaSkillOptions = {}): Promise<InstallOnaSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  const legacyBeforeInstall = await inspectLegacyOnaInstructions(options);
  if (legacyBeforeInstall.unsafeIssues.length > 0) {
    throw new Error(
      `cannot safely migrate malformed tokenjuice markers in ${legacyBeforeInstall.instructionsPath}; remove the dangling marker manually, then rerun tokenjuice install ona`,
    );
  }

  await rejectInstallSidecarSymlinks(resolvedSkillPath);
  const result = await writeInstructionFile(resolvedSkillPath, TOKENJUICE_ONA_SKILL);
  const legacy = await uninstallLegacyOnaInstructions(options);
  return {
    skillPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
    ...(legacy ? { legacyInstructionsPath: legacy.instructionsPath, legacyRemoved: legacy.removed } : {}),
  };
}

export async function uninstallOnaSkill(
  skillPath?: string,
  options: OnaSkillOptions = {},
): Promise<UninstallOnaSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  const legacyBeforeUninstall = await inspectLegacyOnaInstructions(options);
  if (legacyBeforeUninstall.unsafeIssues.length > 0) {
    throw new Error(
      `cannot safely migrate malformed tokenjuice markers in ${legacyBeforeUninstall.instructionsPath}; remove the dangling marker manually, then rerun tokenjuice uninstall ona`,
    );
  }

  const existing = await readInstructionFile(resolvedSkillPath);
  const skillRemoved = existing.exists && existing.text.includes(TOKENJUICE_ONA_OWNERSHIP_MARKER);
  const result = skillRemoved ? await removeInstructionFile(resolvedSkillPath) : { filePath: resolvedSkillPath, removed: false };
  const legacy = await uninstallLegacyOnaInstructions(options);
  return {
    skillPath: result.filePath,
    removed: skillRemoved || Boolean(legacy?.removed),
    ...(legacy ? { legacyInstructionsPath: legacy.instructionsPath, legacyRemoved: legacy.removed } : {}),
  };
}

export async function doctorOnaSkill(skillPath?: string, options: OnaSkillOptions = {}): Promise<OnaDoctorReport> {
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
          issues: ["tokenjuice Ona skill is not installed"],
          advisory: TOKENJUICE_ONA_ADVISORY,
          fixCommand: TOKENJUICE_ONA_FIX_COMMAND,
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
        advisory: TOKENJUICE_ONA_ADVISORY,
        fixCommand: "replace symlinked Ona skill with a regular project file, then run tokenjuice install ona",
      }),
    };
  }

  const existing = await readInstructionFile(resolvedSkillPath);
  if (!existing.exists) {
    const legacy = await inspectLegacyOnaInstructions(options);
    if (legacy.hasLegacyBlock) {
      const issues =
        legacy.issues.length > 0
          ? legacy.issues
          : [
              "legacy Ona AGENTS.md tokenjuice instructions are still installed; run tokenjuice install ona to migrate to .ona/skills/tokenjuice/SKILL.md or tokenjuice uninstall ona to remove them",
            ];
      return {
        skillPath: resolvedSkillPath,
        hasTokenjuiceMarker: true,
        hasUnsafePathIssue: false,
        status: legacy.issues.length > 0 ? "broken" : "warn",
        issues,
        advisories: [TOKENJUICE_ONA_ADVISORY],
        fixCommand: legacy.issues.length > 0 ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install ona" : TOKENJUICE_ONA_FIX_COMMAND,
        checkedPaths: [legacy.instructionsPath],
        missingPaths: [],
      };
    }

    return {
      skillPath: resolvedSkillPath,
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: false,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Ona skill is not installed"],
        advisory: TOKENJUICE_ONA_ADVISORY,
        fixCommand: TOKENJUICE_ONA_FIX_COMMAND,
      }),
    };
  }

  const hasTokenjuiceMarker = existing.text.includes(TOKENJUICE_ONA_OWNERSHIP_MARKER);
  const frontmatter = inspectSkillFrontmatter(existing.text);
  const legacy = await inspectLegacyOnaInstructions(options);
  const legacyIssues =
    legacy.hasLegacyBlock && legacy.issues.length === 0
      ? ["legacy Ona AGENTS.md tokenjuice instructions are still installed; run tokenjuice uninstall ona to remove duplicate always-loaded guidance"]
      : legacy.issues;
  const skillIssues = [
    ...(!frontmatter.hasValidYaml ? ["configured Ona skill has invalid discovery frontmatter"] : []),
    ...(!frontmatter.hasName ? ["configured Ona skill is missing the required tokenjuice skill name"] : []),
    ...(!frontmatter.hasDescription ? ["configured Ona skill is missing discovery frontmatter"] : []),
    ...collectGuidanceIssues(existing.text, {
      required: [
        {
          requiredText: TOKENJUICE_ONA_OWNERSHIP_MARKER,
          missingIssue: "configured Ona skill is missing the tokenjuice ownership marker",
        },
        {
          requiredText: TOKENJUICE_ONA_SKILL_MARKER,
          missingIssue: "configured Ona skill does not look like the tokenjuice skill",
        },
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Ona skill is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Ona skill is missing the raw escape hatch",
        },
        {
          requiredText: TOKENJUICE_ONA_SKILL_PATH,
          missingIssue: "configured Ona skill is missing workspace skill path guidance",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Ona skill still suggests the full escape hatch",
        },
      ],
    }),
  ];
  const issues = [
    ...legacyIssues,
    ...skillIssues,
  ];
  const status = skillIssues.length > 0 || legacy.issues.length > 0 ? "broken" : legacy.hasLegacyBlock ? "warn" : "ok";

  return {
    skillPath: resolvedSkillPath,
    hasTokenjuiceMarker: hasTokenjuiceMarker || legacy.hasLegacyBlock,
    hasUnsafePathIssue: false,
    status,
    issues,
    advisories: [TOKENJUICE_ONA_ADVISORY],
    fixCommand: legacy.hasLegacyBlock && legacy.issues.length > 0
      ? "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install ona"
      : TOKENJUICE_ONA_FIX_COMMAND,
    checkedPaths: legacy.hasLegacyBlock ? [legacy.instructionsPath] : [],
    missingPaths: [],
  };
}

export async function installOnaInstructions(
  instructionsPath?: string,
  options: OnaInstructionsOptions = {},
): Promise<InstallOnaInstructionsResult> {
  const resolvedOptions = instructionsPath ? { ...options, projectDir: dirname(resolve(instructionsPath)) } : options;
  const result = await installOnaSkill(undefined, resolvedOptions);
  return { ...result, instructionsPath: result.skillPath };
}

export async function uninstallOnaInstructions(
  instructionsPath?: string,
  options: OnaInstructionsOptions = {},
): Promise<UninstallOnaInstructionsResult> {
  const resolvedOptions = instructionsPath ? { ...options, projectDir: dirname(resolve(instructionsPath)) } : options;
  const result = await uninstallOnaSkill(undefined, resolvedOptions);
  return { ...result, instructionsPath: result.skillPath };
}

export async function doctorOnaInstructions(
  instructionsPath?: string,
  options: OnaInstructionsOptions = {},
): Promise<OnaDoctorReport & { instructionsPath: string }> {
  const resolvedOptions = instructionsPath ? { ...options, projectDir: dirname(resolve(instructionsPath)) } : options;
  const result = await doctorOnaSkill(undefined, resolvedOptions);
  return { ...result, instructionsPath: result.skillPath };
}
