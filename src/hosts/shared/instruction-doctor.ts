export type InstructionDoctorStatus = "ok" | "broken" | "disabled";

export type InstructionDoctorReportFields = {
  status: InstructionDoctorStatus;
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

export function instructionDoctorStatusFromIssues(issues: readonly unknown[]): "ok" | "broken" {
  return issues.length > 0 ? "broken" : "ok";
}

export function buildInstructionDoctorReportFields(options: {
  status: InstructionDoctorStatus;
  issues?: string[];
  advisory: string;
  fixCommand: string;
}): InstructionDoctorReportFields {
  return {
    status: options.status,
    issues: options.issues ?? [],
    advisories: [options.advisory],
    fixCommand: options.fixCommand,
    checkedPaths: [],
    missingPaths: [],
  };
}
