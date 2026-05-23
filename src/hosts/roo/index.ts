import { join } from "node:path";

import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
  installMarkerDelimitedBlock,
  uninstallMarkerDelimitedBlock,
} from "../shared/marker-instructions.js";
import {
  buildTokenjuiceGuidanceBullets,
  TOKENJUICE_FULL_COMMAND,
  TOKENJUICE_RAW_COMMAND,
  TOKENJUICE_WRAP_COMMAND,
} from "../shared/instruction-guidance.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";
import { collectGuidanceIssues, readInstructionFile } from "../shared/instruction-file.js";

export type RooInstructionsOptions = {
  projectDir?: string;
};

export type InstallRooInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallRooInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type RooDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_ROO_FIX_COMMAND = "tokenjuice install roo";
const TOKENJUICE_ROO_BEGIN = "<!-- tokenjuice:begin -->";
const TOKENJUICE_ROO_END = "<!-- tokenjuice:end -->";
const TOKENJUICE_ROO_ADVISORY =
  "Roo Code support is beta and rule-based; it guides command usage but does not intercept tool output.";

function getProjectDir(options: RooInstructionsOptions = {}): string {
  return options.projectDir || process.env.ROO_PROJECT_DIR || process.cwd();
}

function getDefaultInstructionsPath(options: RooInstructionsOptions = {}): string {
  return join(getProjectDir(options), ".roo", "rules", "tokenjuice.md");
}

const TOKENJUICE_ROO_BLOCK = [
  TOKENJUICE_ROO_BEGIN,
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- For Roo `execute_command` terminal commands likely to produce long output, run them through `tokenjuice wrap -- <command>`.",
  }),
  TOKENJUICE_ROO_END,
].join("\n");

const TOKENJUICE_ROO_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_ROO_BEGIN,
  endMarker: TOKENJUICE_ROO_END,
  block: TOKENJUICE_ROO_BLOCK,
};

function getTokenjuiceBlockText(text: string): string {
  const beginIndex = text.indexOf(TOKENJUICE_ROO_BEGIN);
  if (beginIndex === -1) {
    return "";
  }
  const endIndex = text.indexOf(TOKENJUICE_ROO_END, beginIndex + TOKENJUICE_ROO_BEGIN.length);
  if (endIndex === -1) {
    return text.slice(beginIndex);
  }
  return text.slice(beginIndex, endIndex + TOKENJUICE_ROO_END.length);
}

export async function installRooInstructions(
  instructionsPath?: string,
  options: RooInstructionsOptions = {},
): Promise<InstallRooInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const result = await installMarkerDelimitedBlock(resolvedInstructionsPath, TOKENJUICE_ROO_BLOCK_CONFIG);
  return {
    instructionsPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallRooInstructions(
  instructionsPath = getDefaultInstructionsPath(),
): Promise<UninstallRooInstructionsResult> {
  const result = await uninstallMarkerDelimitedBlock(instructionsPath, TOKENJUICE_ROO_BLOCK_CONFIG);
  return { instructionsPath: result.filePath, removed: result.removed };
}

export async function doctorRooInstructions(
  instructionsPath?: string,
  options: RooInstructionsOptions = {},
): Promise<RooDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const existing = await readInstructionFile(resolvedInstructionsPath);
  const markerState = inspectMarkerDelimitedBlock(existing.text, TOKENJUICE_ROO_BLOCK_CONFIG);
  if (!existing.exists || (!markerState.hasBegin && !markerState.hasEnd)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Roo Code rules are not installed"],
        advisory: TOKENJUICE_ROO_ADVISORY,
        fixCommand: TOKENJUICE_ROO_FIX_COMMAND,
      }),
    };
  }

  const issues = [
    ...collectMarkerDelimitedBlockIssues(markerState, {
      configuredLabel: "Roo Code rules",
      repairCommand: TOKENJUICE_ROO_FIX_COMMAND,
    }),
    ...collectGuidanceIssues(getTokenjuiceBlockText(existing.text), {
      required: [
        {
          requiredText: TOKENJUICE_WRAP_COMMAND,
          missingIssue: "configured Roo Code rules are missing tokenjuice wrap guidance",
        },
        {
          requiredText: TOKENJUICE_RAW_COMMAND,
          missingIssue: "configured Roo Code rules are missing the raw escape hatch",
        },
      ],
      forbidden: [
        {
          forbiddenText: TOKENJUICE_FULL_COMMAND,
          presentIssue: "configured Roo Code rules still suggest the full escape hatch",
        },
      ],
    }),
  ];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_ROO_ADVISORY,
      fixCommand: TOKENJUICE_ROO_FIX_COMMAND,
    }),
  };
}
