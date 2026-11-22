import { join } from "node:path";

import {
  collectTokenjuiceGuidanceIssues,
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import { readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  type PathDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type KiroSteeringOptions = {
  projectDir?: string;
};

export type InstallKiroSteeringResult = {
  steeringPath: string;
  backupPath?: string;
};

export type UninstallKiroSteeringResult = {
  steeringPath: string;
  removed: boolean;
};

export type KiroDoctorReport = PathDoctorReport<"steeringPath">;

const TOKENJUICE_KIRO_FIX_COMMAND = "tokenjuice install kiro";
const TOKENJUICE_KIRO_STEERING_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_KIRO_ADVISORY = "Kiro support is beta and steering-based; it guides command usage but does not intercept tool output.";

function getProjectDir(options: KiroSteeringOptions = {}): string {
  return options.projectDir || process.env.KIRO_PROJECT_DIR || process.cwd();
}

function getDefaultSteeringPath(options: KiroSteeringOptions = {}): string {
  return join(getProjectDir(options), ".kiro", "steering", "tokenjuice.md");
}

const TOKENJUICE_KIRO_STEERING = [
  "---",
  "inclusion: always",
  "---",
  "",
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When running terminal commands through Kiro, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
  }),
  "",
].join("\n");

function hasAlwaysIncludedFrontmatter(text: string): boolean {
  const frontmatterStart = text.match(/^---\r?\n/u);
  if (!frontmatterStart) {
    return false;
  }
  const endIndex = text.search(/\r?\n---(?:\r?\n|$)/u);
  if (endIndex === -1) {
    return false;
  }
  const frontmatter = text.slice(frontmatterStart[0].length, endIndex);
  return frontmatter.split(/\r?\n/u).some((line) => line.trim() === "inclusion: always");
}

export async function installKiroSteering(
  steeringPath?: string,
  options: KiroSteeringOptions = {},
): Promise<InstallKiroSteeringResult> {
  const resolvedSteeringPath = steeringPath ?? getDefaultSteeringPath(options);
  const result = await writeInstructionFile(resolvedSteeringPath, TOKENJUICE_KIRO_STEERING);
  return {
    steeringPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallKiroSteering(
  steeringPath?: string,
  options: KiroSteeringOptions = {},
): Promise<UninstallKiroSteeringResult> {
  const resolvedSteeringPath = steeringPath ?? getDefaultSteeringPath(options);
  const existing = await readInstructionFile(resolvedSteeringPath);
  if (existing.exists && !existing.text.includes(TOKENJUICE_KIRO_STEERING_MARKER)) {
    return { steeringPath: resolvedSteeringPath, removed: false };
  }
  const result = existing.exists
    ? await removeInstructionFile(resolvedSteeringPath)
    : { filePath: resolvedSteeringPath, removed: false };
  return { steeringPath: result.filePath, removed: result.removed };
}

export async function doctorKiroSteering(
  steeringPath?: string,
  options: KiroSteeringOptions = {},
): Promise<KiroDoctorReport> {
  const resolvedSteeringPath = steeringPath ?? getDefaultSteeringPath(options);
  const existing = await readInstructionFile(resolvedSteeringPath);
  if (!existing.exists) {
    return {
      steeringPath: resolvedSteeringPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Kiro steering file is not installed"],
        advisory: TOKENJUICE_KIRO_ADVISORY,
        fixCommand: TOKENJUICE_KIRO_FIX_COMMAND,
      }),
    };
  }
  if (!existing.text.includes(TOKENJUICE_KIRO_STEERING_MARKER)) {
    return {
      steeringPath: resolvedSteeringPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Kiro steering file is not installed"],
        advisory: TOKENJUICE_KIRO_ADVISORY,
        fixCommand: TOKENJUICE_KIRO_FIX_COMMAND,
      }),
    };
  }

  const issues = collectTokenjuiceGuidanceIssues(existing.text, {
    configuredLabel: "Kiro steering file",
    singular: true,
    additionalRequired: [
      {
        requiredText: TOKENJUICE_KIRO_STEERING_MARKER,
        missingIssue: "configured Kiro steering file does not look like the tokenjuice steering file",
      },
    ],
  });
  if (!hasAlwaysIncludedFrontmatter(existing.text)) {
    issues.push("configured Kiro steering file is missing always-included front matter");
  }

  return {
    steeringPath: resolvedSteeringPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_KIRO_ADVISORY,
      fixCommand: TOKENJUICE_KIRO_FIX_COMMAND,
    }),
  };
}
