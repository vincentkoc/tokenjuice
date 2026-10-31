import { lstat, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import {
  isValidDoubleQuotedYamlScalar,
  parseSimpleYamlFrontmatter,
  stripYamlComment,
} from "../../core/simple-yaml-frontmatter.js";
import { createSymlinkGuard, rejectSymlinkPathComponents, isInsideOrEqual, realpathExistingAncestor, findExistingAncestor } from "../shared/path-ancestors.js";

import { createProjectDirResolver } from "../shared/project-root.js";

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

const resolveProjectDir = createProjectDirResolver("STAGEWISE_PROJECT_DIR");

async function resolveCanonicalProjectDir(options: StagewiseSkillOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  await rejectSkillSymlink(projectDir);
  return realpath(projectDir).catch(() => projectDir);
}

async function resolveCanonicalInstructionPath(filePath: string): Promise<string> {
  const resolvedPath = resolve(filePath);
  const existingAncestor = await findExistingAncestor(dirname(resolvedPath));
  return join(existingAncestor.realPath, relative(existingAncestor.path, resolvedPath));
}

const rejectSkillSymlink = createSymlinkGuard(
  (filePath) => `cannot use Stagewise skill ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

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
  await rejectSymlinkPathComponents(
    resolvedPath,
    projectDir,
    `cannot use Stagewise skill ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`,
  );
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
  const parsed = parseSimpleYamlFrontmatter(frontmatter, isValidSimpleYamlScalar);
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
