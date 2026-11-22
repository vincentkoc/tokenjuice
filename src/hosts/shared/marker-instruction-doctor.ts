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

export async function doctorMarkerStructure(
  instructionsPath: string,
  config: MarkerDelimitedBlockConfig,
  options: { configuredLabel: string; advisory: string; fixCommand: string },
): Promise<InstructionDoctorReportFields & { instructionsPath: string }> {
  const existing = await readInstructionFile(instructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, config);
  const disabled = !existing.exists || (!markerState.hasBegin && !markerState.hasEnd);
  const issues = disabled
    ? [`tokenjuice ${options.configuredLabel} are not installed`]
    : collectMarkerDelimitedBlockIssues(markerState, {
      configuredLabel: options.configuredLabel,
      repairCommand: options.fixCommand,
    });
  return {
    instructionsPath,
    ...buildInstructionDoctorReportFields({
      status: disabled ? "disabled" : instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: options.advisory,
      fixCommand: options.fixCommand,
    }),
  };
}

type MarkerInstructionDoctorOptions = {
  configuredLabel: string;
  advisory: string;
  fixCommand: string;
  malformedFixCommand: string;
  singular?: boolean;
  malformedMarkerIssue?: string;
  malformedIssueOnlyWithoutMarkerIssues?: boolean;
  guidanceOptions?: Omit<Parameters<typeof collectTokenjuiceGuidanceIssues>[1], "configuredLabel" | "singular">;
  repairOnMarkerIssues?: boolean;
};

export async function doctorMarkerInstructions(
  instructionsPath: string,
  config: MarkerDelimitedBlockConfig,
  options: MarkerInstructionDoctorOptions,
): Promise<InstructionDoctorReportFields & { instructionsPath: string }> {
  return { instructionsPath, ...(await inspectMarkerInstructionDoctor(instructionsPath, config, options)).report };
}

export async function inspectMarkerInstructionDoctor(
  instructionsPath: string,
  config: MarkerDelimitedBlockConfig,
  options: MarkerInstructionDoctorOptions,
): Promise<{ report: InstructionDoctorReportFields; hasTokenjuiceMarker: boolean }> {
  const { configuredLabel, advisory, fixCommand, malformedFixCommand, singular = false } = options;
  const existing = await readInstructionFile(instructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, config);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      hasTokenjuiceMarker: markerState.hasBegin || markerState.hasEnd,
      report: {
        ...buildInstructionDoctorReportFields({
          status: "disabled",
          issues: [`tokenjuice ${configuredLabel} ${singular ? "is" : "are"} not installed`],
          advisory,
          fixCommand,
        }),
      },
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
      ...options.guidanceOptions,
    }),
  ];

  return {
    hasTokenjuiceMarker: markerState.hasBegin || markerState.hasEnd,
    report: {
      ...buildInstructionDoctorReportFields({
        status: instructionDoctorStatusFromIssues(issues),
        issues,
        advisory,
        fixCommand: hasMalformedMarkers || (options.repairOnMarkerIssues && markerIssues.length > 0) ? malformedFixCommand : fixCommand,
      }),
    },
  };
}
