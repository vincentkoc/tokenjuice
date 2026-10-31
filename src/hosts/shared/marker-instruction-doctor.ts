import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
  type InstructionDoctorReportFields,
} from "./instruction-doctor.js";
import { collectGuidanceIssues, readInstructionFile } from "./instruction-file.js";
import {
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "./instruction-guidance.js";
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
    ...(hasMalformedMarkers ? [
      options.malformedMarkerIssue ?? `configured ${configuredLabel} ${singular ? "has" : "have"} malformed tokenjuice markers`,
    ] : []),
    ...collectGuidanceIssues(getMarkerDelimitedBlockText(existing.text, config), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: `configured ${configuredLabel} ${singular ? "is" : "are"} missing tokenjuice wrap guidance`,
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: `configured ${configuredLabel} ${singular ? "is" : "are"} missing the raw escape hatch`,
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: `configured ${configuredLabel} still ${singular ? "suggests" : "suggest"} the full escape hatch`,
        },
      ],
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
