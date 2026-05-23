import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type StagewiseSkillOptions = {
  projectDir?: string;
};

export type InstallStagewiseSkillResult = {
  skillPath: string;
  backupPath?: string;
};

export type UninstallStagewiseSkillResult = {
  skillPath: string;
  removed: boolean;
};

export type StagewiseDoctorReport = {
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

const TOKENJUICE_STAGEWISE_FIX_COMMAND = "tokenjuice install stagewise";
const TOKENJUICE_STAGEWISE_OWNERSHIP_MARKER = "<!-- tokenjuice:stagewise skill -->";
const TOKENJUICE_STAGEWISE_SKILL_MARKER = "# tokenjuice terminal output compaction";
const TOKENJUICE_STAGEWISE_ADVISORY =
  "Stagewise support is beta and skill-based; Stagewise discovers .stagewise/skills/tokenjuice/SKILL.md in workspace sessions, but tokenjuice does not intercept shell output.";

function getExplicitProjectDir(options: StagewiseSkillOptions = {}): string | undefined {
  return options.projectDir || process.env.STAGEWISE_PROJECT_DIR;
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

async function resolveProjectDir(options: StagewiseSkillOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function resolveCanonicalProjectDir(options: StagewiseSkillOptions = {}): Promise<string> {
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
      throw new Error(`cannot use Stagewise skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
        throw new Error(`cannot use Stagewise skill ${filePath}; tokenjuice will not read or write through instruction symlinks`);
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
  return join(projectDir, ".stagewise", "skills", "tokenjuice", "SKILL.md");
}

async function resolveSafeProjectSkillPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = resolve(filePath);
  await rejectSkillSymlink(projectDir);
  await rejectSkillPathComponentSymlinks(resolvedPath, projectDir);
  const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
  if (!isInsideOrEqual(realProjectDir, realParentDir)) {
    throw new Error(
      `cannot use Stagewise skill ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
    );
  }

  await rejectSkillSymlink(resolvedPath);
  const expectedSkillPath = getExpectedSkillPath(projectDir);
  if (resolvedPath !== expectedSkillPath) {
    throw new Error(
      `cannot use Stagewise skill ${resolvedPath}; tokenjuice only installs the project-local .stagewise/skills/tokenjuice/SKILL.md file`,
    );
  }
  return resolvedPath;
}

async function getDefaultSkillPath(options: StagewiseSkillOptions = {}): Promise<string> {
  const projectDir = await resolveCanonicalProjectDir(options);
  return resolveSafeProjectSkillPath(getExpectedSkillPath(projectDir), projectDir, projectDir);
}

async function getDefaultAliasPath(options: StagewiseSkillOptions = {}): Promise<string> {
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

async function resolveSkillPath(skillPath?: string, options: StagewiseSkillOptions = {}): Promise<string> {
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
  if (/[:[\]{}]/u.test(value)) {
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

const TOKENJUICE_STAGEWISE_SKILL = [
  "---",
  "name: tokenjuice",
  'description: "Use tokenjuice to compact noisy terminal output in Stagewise workspaces."',
  "---",
  "",
  TOKENJUICE_STAGEWISE_OWNERSHIP_MARKER,
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When Stagewise agent runs terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
  }),
  "- Stagewise agent discovers this reusable skill from `.stagewise/skills/tokenjuice/SKILL.md` and still owns shell execution and tool output delivery.",
  "",
].join("\n");

export async function installStagewiseSkill(
  skillPath?: string,
  options: StagewiseSkillOptions = {},
): Promise<InstallStagewiseSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  await rejectInstallSidecarSymlinks(resolvedSkillPath);
  const result = await writeInstructionFile(resolvedSkillPath, TOKENJUICE_STAGEWISE_SKILL);
  return {
    skillPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallStagewiseSkill(
  skillPath?: string,
  options: StagewiseSkillOptions = {},
): Promise<UninstallStagewiseSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  const existing = await readInstructionFile(resolvedSkillPath);
  if (!existing.exists || !existing.text.includes(TOKENJUICE_STAGEWISE_OWNERSHIP_MARKER)) {
    return { skillPath: resolvedSkillPath, removed: false };
  }
  const result = await removeInstructionFile(resolvedSkillPath);
  return { skillPath: result.filePath, removed: result.removed };
}

export async function doctorStagewiseSkill(
  skillPath?: string,
  options: StagewiseSkillOptions = {},
): Promise<StagewiseDoctorReport> {
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
          issues: ["tokenjuice Stagewise skill is not installed"],
          advisory: TOKENJUICE_STAGEWISE_ADVISORY,
          fixCommand: TOKENJUICE_STAGEWISE_FIX_COMMAND,
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
        advisory: TOKENJUICE_STAGEWISE_ADVISORY,
        fixCommand: (error as Error).message.includes("outside") || (error as Error).message.includes("only installs")
          ? "use the project-local .stagewise/skills/tokenjuice/SKILL.md path, then run tokenjuice install stagewise"
          : "replace symlinked Stagewise skill paths with regular project files, then run tokenjuice install stagewise",
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
        issues: ["tokenjuice Stagewise skill is not installed"],
        advisory: TOKENJUICE_STAGEWISE_ADVISORY,
        fixCommand: TOKENJUICE_STAGEWISE_FIX_COMMAND,
      }),
    };
  }

  const hasTokenjuiceMarker = existing.text.includes(TOKENJUICE_STAGEWISE_OWNERSHIP_MARKER);
  const frontmatter = inspectSkillFrontmatter(existing.text);
  const issues = [
    ...(!frontmatter.hasValidYaml ? ["configured Stagewise skill has invalid discovery frontmatter"] : []),
    ...(!frontmatter.hasName ? ["configured Stagewise skill is missing the required tokenjuice skill name"] : []),
    ...(!frontmatter.hasDescription ? ["configured Stagewise skill is missing discovery frontmatter"] : []),
    ...collectGuidanceIssues(existing.text, {
      required: [
        {
          requiredText: TOKENJUICE_STAGEWISE_OWNERSHIP_MARKER,
          missingIssue: "configured Stagewise skill is missing the tokenjuice ownership marker",
        },
        {
          requiredText: TOKENJUICE_STAGEWISE_SKILL_MARKER,
          missingIssue: "configured Stagewise skill does not look like the tokenjuice skill",
        },
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Stagewise skill is missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Stagewise skill is missing the raw escape hatch",
        },
        {
          requiredText: ".stagewise/skills/tokenjuice/SKILL.md",
          missingIssue: "configured Stagewise skill is missing workspace skill path guidance",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Stagewise skill still suggests the full escape hatch",
        },
      ],
    }),
  ];

  return {
    skillPath: resolvedSkillPath,
    hasTokenjuiceMarker,
    hasUnsafePathIssue: false,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_STAGEWISE_ADVISORY,
      fixCommand: TOKENJUICE_STAGEWISE_FIX_COMMAND,
    }),
  };
}
