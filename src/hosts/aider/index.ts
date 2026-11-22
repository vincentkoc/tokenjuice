import { join } from "node:path";

import { collectTokenjuiceGuidanceIssues, buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import { readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  type PathDoctorReport,
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type AiderConventionOptions = {
  projectDir?: string;
};

export type InstallAiderConventionResult = {
  conventionPath: string;
  backupPath?: string;
};

export type UninstallAiderConventionResult = {
  conventionPath: string;
  removed: boolean;
};

export type AiderDoctorReport = PathDoctorReport<"conventionPath">;

const TOKENJUICE_AIDER_FIX_COMMAND = "tokenjuice install aider";
const TOKENJUICE_AIDER_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_AIDER_ADVISORY = "Aider support is beta and convention-based; load it with aider --read CONVENTIONS.tokenjuice.md.";

function getProjectDir(options: AiderConventionOptions = {}): string {
  return options.projectDir || process.env.AIDER_PROJECT_DIR || process.cwd();
}

function getDefaultConventionPath(options: AiderConventionOptions = {}): string {
  return join(getProjectDir(options), "CONVENTIONS.tokenjuice.md");
}

const TOKENJUICE_AIDER_CONVENTION = [
  `# ${TOKENJUICE_AIDER_MARKER}`,
  "",
  ...buildTokenjuiceGuidanceBullets(),
  "",
  "Load this file with `aider --read CONVENTIONS.tokenjuice.md` or add it to `.aider.conf.yml`.",
  "",
].join("\n");

export async function installAiderConvention(
  conventionPath?: string,
  options: AiderConventionOptions = {},
): Promise<InstallAiderConventionResult> {
  const resolvedConventionPath = conventionPath ?? getDefaultConventionPath(options);
  const result = await writeInstructionFile(resolvedConventionPath, TOKENJUICE_AIDER_CONVENTION);
  return {
    conventionPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAiderConvention(conventionPath = getDefaultConventionPath()): Promise<UninstallAiderConventionResult> {
  const result = await removeInstructionFile(conventionPath);
  return { conventionPath: result.filePath, removed: result.removed };
}

export async function doctorAiderConvention(
  conventionPath?: string,
  options: AiderConventionOptions = {},
): Promise<AiderDoctorReport> {
  const resolvedConventionPath = conventionPath ?? getDefaultConventionPath(options);
  const existing = await readInstructionFile(resolvedConventionPath);
  if (!existing.exists) {
    return {
      conventionPath: resolvedConventionPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Aider convention file is not installed"],
        advisory: TOKENJUICE_AIDER_ADVISORY,
        fixCommand: TOKENJUICE_AIDER_FIX_COMMAND,
      }),
    };
  }

  const issues = collectTokenjuiceGuidanceIssues(existing.text, {
    configuredLabel: "Aider convention file",
    singular: true,
    additionalRequired: [
      {
        requiredText: TOKENJUICE_AIDER_MARKER,
        missingIssue: "configured Aider convention file does not look like the tokenjuice convention",
      },
    ],
  });

  return {
    conventionPath: resolvedConventionPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_AIDER_ADVISORY,
      fixCommand: TOKENJUICE_AIDER_FIX_COMMAND,
    }),
  };
}
