import { pathEntryExists, readInstructionFile } from "./instruction-file.js";
import { buildInstructionDoctorReportFields, instructionDoctorStatusFromIssues } from "./instruction-doctor.js";
import type { PathDoctorReport } from "./instruction-doctor.js";

export async function doctorProjectSkill(
  explicitSkillPath: string | undefined,
  config: {
    resolvePath: () => Promise<string>;
    getAliasPath: () => Promise<string>;
    missingIssue: string;
    ownershipMarker: string;
    advisory: string;
    fixCommand: string;
    pathFixCommand: (message: string) => string;
    collectIssues: (text: string) => string[];
  },
): Promise<PathDoctorReport<"skillPath"> & { hasTokenjuiceMarker: boolean; hasUnsafePathIssue: boolean }> {
  let resolvedSkillPath: string;
  try {
    resolvedSkillPath = await config.resolvePath();
  } catch (error) {
    const aliasPath = explicitSkillPath ?? (await config.getAliasPath());
    if (!explicitSkillPath && !(await pathEntryExists(aliasPath))) {
      return {
        skillPath: aliasPath,
        hasTokenjuiceMarker: false,
        hasUnsafePathIssue: false,
        ...buildInstructionDoctorReportFields({
          status: "disabled",
          issues: [config.missingIssue],
          advisory: config.advisory,
          fixCommand: config.fixCommand,
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
        advisory: config.advisory,
        fixCommand: config.pathFixCommand((error as Error).message),
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
        issues: [config.missingIssue],
        advisory: config.advisory,
        fixCommand: config.fixCommand,
      }),
    };
  }

  const hasTokenjuiceMarker = existing.text.includes(config.ownershipMarker);
  const issues = config.collectIssues(existing.text);

  return {
    skillPath: resolvedSkillPath,
    hasTokenjuiceMarker,
    hasUnsafePathIssue: false,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: config.advisory,
      fixCommand: config.fixCommand,
    }),
  };
}
