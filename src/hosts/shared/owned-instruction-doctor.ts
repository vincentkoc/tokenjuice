import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
  type InstructionDoctorReportFields,
} from "./instruction-doctor.js";
import { readInstructionFile } from "./instruction-file.js";

export async function doctorOwnedInstructionFile(
  filePath: string,
  options: {
    isManagedText: (text: string) => boolean;
    missingIssue: string;
    unmanagedIssue: string;
    collectIssues: (text: string) => string[];
    advisory: string;
    fixCommand: string;
  },
): Promise<InstructionDoctorReportFields> {
  const existing = await readInstructionFile(filePath);
  const disabledIssue = !existing.exists
    ? options.missingIssue
    : !options.isManagedText(existing.text)
      ? options.unmanagedIssue
      : undefined;
  const issues = disabledIssue !== undefined ? [disabledIssue] : options.collectIssues(existing.text);
  return buildInstructionDoctorReportFields({
    status: disabledIssue !== undefined ? "disabled" : instructionDoctorStatusFromIssues(issues),
    issues,
    advisory: options.advisory,
    fixCommand: options.fixCommand,
  });
}
