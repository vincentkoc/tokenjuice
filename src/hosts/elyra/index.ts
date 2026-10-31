import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { collectGuidanceIssues, readInstructionFile } from "../shared/instruction-file.js";

import { createProjectInstructionPathResolver, createSymlinkGuard } from "../shared/path-ancestors.js";

import { createProjectDirResolver } from "../shared/project-root.js";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import {
  type PathDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

import { createRestorableSkillCommands } from "../shared/restorable-skill.js";

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

export type ElyraDoctorReport = PathDoctorReport<"skillPath"> & {
  hasTokenjuiceMarker: boolean;
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

const resolveProjectDir = createProjectDirResolver("ELYRA_PROJECT_DIR");

function getExpectedSkillPath(projectDir: string): string {
  return join(projectDir, ".elyra", "skills", "tokenjuice", "SKILL.md");
}

const rejectSkillSymlink = createSymlinkGuard(
  (filePath) => `cannot use elyra skill ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectSkillSymlink(`${filePath}.bak`);
  await rejectSkillSymlink(`${filePath}.tmp`);
}

const resolveProjectSkillPath = createProjectInstructionPathResolver(
  "elyra skill",
  rejectSkillSymlink,
);

async function resolveSafeProjectSkillPath(filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> {
  const resolvedPath = await resolveProjectSkillPath(filePath, projectDir, realProjectDir);
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

const skillCommands = createRestorableSkillCommands({
  buildSkill: buildElyraSkill,
  isManagedText: isTokenjuiceElyraSkillText,
  readRestoreBackupSuffix,
  rejectSkillSymlink,
  rejectInstallSidecarSymlinks,
});

export async function installElyraSkill(
  skillPath?: string,
  options: ElyraSkillOptions = {},
): Promise<InstallElyraSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  return skillCommands.install(resolvedSkillPath);
}

export async function uninstallElyraSkill(
  skillPath?: string,
  options: ElyraSkillOptions = {},
): Promise<UninstallElyraSkillResult> {
  const resolvedSkillPath = await resolveSkillPath(skillPath, options);
  return skillCommands.uninstall(resolvedSkillPath);
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
