import { realpath } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { doctorProjectSkill } from "../shared/project-skill-doctor.js";
import {
  isValidDoubleQuotedYamlScalar,
  parseSimpleYamlFrontmatter,
  stripYamlComment,
} from "../../core/simple-yaml-frontmatter.js";
import { createCanonicalProjectSkillPaths, createSymlinkGuard, findExistingAncestor } from "../shared/path-ancestors.js";

import { createProjectDirResolver } from "../shared/project-root.js";

import { collectTokenjuiceGuidanceIssues, buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import {
  readInstructionFile,
  removeInstructionFile,
  writeInstructionFile,
} from "../shared/instruction-file.js";
import {
  type PathDoctorReport,
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

export type StagewiseDoctorReport = PathDoctorReport<"skillPath"> & {
  hasTokenjuiceMarker: boolean;
  hasUnsafePathIssue: boolean;
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

const { getExpectedSkillPath, resolveSafeProjectSkillPath } = createCanonicalProjectSkillPaths(
  "Stagewise skill",
  ".stagewise/skills/tokenjuice/SKILL.md",
  rejectSkillSymlink,
);

async function getDefaultSkillPath(options: StagewiseSkillOptions = {}): Promise<string> {
  const projectDir = await resolveCanonicalProjectDir(options);
  return resolveSafeProjectSkillPath(getExpectedSkillPath(projectDir), projectDir, projectDir);
}

async function getDefaultAliasPath(options: StagewiseSkillOptions = {}): Promise<string> {
  return getExpectedSkillPath(await resolveProjectDir(options));
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
  return doctorProjectSkill(skillPath, {
    resolvePath: () => resolveSkillPath(skillPath, options),
    getAliasPath: () => getDefaultAliasPath(options),
    missingIssue: "tokenjuice Stagewise skill is not installed",
    ownershipMarker: TOKENJUICE_STAGEWISE_OWNERSHIP_MARKER,
    advisory: TOKENJUICE_STAGEWISE_ADVISORY,
    fixCommand: TOKENJUICE_STAGEWISE_FIX_COMMAND,
    pathFixCommand: (message) => message.includes("outside") || message.includes("only installs")
      ? "use the project-local .stagewise/skills/tokenjuice/SKILL.md path, then run tokenjuice install stagewise"
      : "replace symlinked Stagewise skill paths with regular project files, then run tokenjuice install stagewise",
    collectIssues: (text) => {
      const frontmatter = inspectSkillFrontmatter(text);
      return [
        ...(!frontmatter.hasValidYaml ? ["configured Stagewise skill has invalid discovery frontmatter"] : []),
        ...(!frontmatter.hasName ? ["configured Stagewise skill is missing the required tokenjuice skill name"] : []),
        ...(!frontmatter.hasDescription ? ["configured Stagewise skill is missing discovery frontmatter"] : []),
        ...collectTokenjuiceGuidanceIssues(text, {
          configuredLabel: "Stagewise skill",
          singular: true,
          additionalRequired: [
            {
              requiredText: TOKENJUICE_STAGEWISE_OWNERSHIP_MARKER,
              missingIssue: "configured Stagewise skill is missing the tokenjuice ownership marker",
            },
            {
              requiredText: TOKENJUICE_STAGEWISE_SKILL_MARKER,
              missingIssue: "configured Stagewise skill does not look like the tokenjuice skill",
            },
          ],
          additionalRequiredAfter: [
            {
              requiredText: ".stagewise/skills/tokenjuice/SKILL.md",
              missingIssue: "configured Stagewise skill is missing workspace skill path guidance",
            },
          ],
        }),
      ];
    },
  });
}
