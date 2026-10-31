import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
  type InstructionDoctorReportFields,
} from "./instruction-doctor.js";
import { readInstructionFile } from "./instruction-file.js";
import { collectTokenjuiceGuidanceIssues } from "./instruction-guidance.js";
import {
  collectMarkerDelimitedBlockIssues,
  getMarkerDelimitedBlockText,
  hasMalformedMarkerDelimitedBlock,
  inspectMarkerDelimitedBlock,
  type MarkerDelimitedBlockConfig,
} from "./marker-instructions.js";

export async function doctorMarkerInstructions(
  instructionsPath: string,
  config: MarkerDelimitedBlockConfig,
  options: {
    configuredLabel: string;
    advisory: string;
    fixCommand: string;
    malformedFixCommand: string;
    singular?: boolean;
    malformedMarkerIssue?: string;
    malformedIssueOnlyWithoutMarkerIssues?: boolean;
  },
): Promise<InstructionDoctorReportFields & { instructionsPath: string }> {
  const { configuredLabel, advisory, fixCommand, malformedFixCommand, singular = false } = options;
  const existing = await readInstructionFile(instructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, config);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: [`tokenjuice ${configuredLabel} ${singular ? "is" : "are"} not installed`],
        advisory,
        fixCommand,
      }),
    };
  }

  const markerIssues = collectMarkerDelimitedBlockIssues(markerState, {
    configuredLabel,
    repairCommand: fixCommand,
  });
  const hasMalformedMarkers = hasMalformedMarkerDelimitedBlock(existing.text, markerState.completeBlockCount, config);
  const issues = [
    ...markerIssues,
    ...(hasMalformedMarkers && (!options.malformedIssueOnlyWithoutMarkerIssues || markerIssues.length === 0) ? [
      options.malformedMarkerIssue ?? `configured ${configuredLabel} ${singular ? "has" : "have"} malformed tokenjuice markers`,
    ] : []),
    ...collectTokenjuiceGuidanceIssues(getMarkerDelimitedBlockText(existing.text, config), {
      configuredLabel,
      singular,
    }),
  ];

  return {
    instructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory,
      fixCommand: hasMalformedMarkers ? malformedFixCommand : fixCommand,
    }),
  };
}
