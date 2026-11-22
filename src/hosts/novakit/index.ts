import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { inspectMarkerInstructionDoctor } from "../shared/marker-instruction-doctor.js";
import { createProjectInstructionPathResolver, createSymlinkGuard } from "../shared/path-ancestors.js";

import { createProjectDirResolver } from "../shared/project-root.js";

import {
  createMarkerInstructionCommands,
} from "../shared/marker-instructions.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import {
  type InstructionsDoctorReport,
  buildInstructionDoctorReportFields,
} from "../shared/instruction-doctor.js";
import {
  type RemoveInstructionFileResult,
  type WriteInstructionFileResult,
} from "../shared/instruction-file.js";

export type NovaKitInstructionsOptions = {
  projectDir?: string;
};

export type InstallNovaKitInstructionsResult = WriteInstructionFileResult<"instructionsPath">;

export type UninstallNovaKitInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;

export type NovaKitDoctorReport = InstructionsDoctorReport & {
  hasTokenjuiceMarker: boolean;
};

const TOKENJUICE_NOVAKIT_FIX_COMMAND = "tokenjuice install novakit";
const TOKENJUICE_NOVAKIT_BEGIN = "<!-- tokenjuice:novakit begin -->";
const TOKENJUICE_NOVAKIT_END = "<!-- tokenjuice:novakit end -->";
const TOKENJUICE_NOVAKIT_ADVISORY =
  "NovaKit support is beta and instruction-based; NovaKit loads NOVAKIT.md context files, but tokenjuice does not intercept tool output.";

const resolveProjectDir = createProjectDirResolver("NOVAKIT_PROJECT_DIR");

const rejectInstructionSymlink = createSymlinkGuard(
  (filePath) => `cannot use NovaKit instructions ${filePath}; tokenjuice will not read or write through instruction symlinks`,
);

async function rejectInstallSidecarSymlinks(filePath: string): Promise<void> {
  await rejectInstructionSymlink(`${filePath}.bak`);
  await rejectInstructionSymlink(`${filePath}.tmp`);
}

const resolveSafeProjectInstructionsPath = createProjectInstructionPathResolver(
  "NovaKit instructions",
  rejectInstructionSymlink,
);

async function getDefaultInstructionsPath(options: NovaKitInstructionsOptions = {}): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveSafeProjectInstructionsPath(join(projectDir, "NOVAKIT.md"), projectDir, realProjectDir);
}

async function getDefaultAliasPath(options: NovaKitInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "NOVAKIT.md");
}

async function resolveInstructionsPath(instructionsPath?: string, options: NovaKitInstructionsOptions = {}): Promise<string> {
  if (instructionsPath) {
    const projectDir = await resolveProjectDir(options);
    const realProjectDir = await realpath(projectDir).catch(() => projectDir);
    return resolveSafeProjectInstructionsPath(instructionsPath, projectDir, realProjectDir);
  }
  return getDefaultInstructionsPath(options);
}

const TOKENJUICE_NOVAKIT_BLOCK = [
  TOKENJUICE_NOVAKIT_BEGIN,
  "## tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet:
      "- When running terminal commands through NovaKit, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
  }),
  "- NovaKit loads this NOVAKIT.md file as project context.",
  TOKENJUICE_NOVAKIT_END,
].join("\n");

const TOKENJUICE_NOVAKIT_BLOCK_CONFIG = {
  beginMarker: TOKENJUICE_NOVAKIT_BEGIN,
  endMarker: TOKENJUICE_NOVAKIT_END,
  block: TOKENJUICE_NOVAKIT_BLOCK,
  preserveSurroundingText: true,
};

const markerInstructions = createMarkerInstructionCommands("novakit", TOKENJUICE_NOVAKIT_BLOCK_CONFIG);

export async function installNovaKitInstructions(
  instructionsPath?: string,
  options: NovaKitInstructionsOptions = {},
): Promise<InstallNovaKitInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  await rejectInstallSidecarSymlinks(resolvedInstructionsPath);
  return markerInstructions.install(resolvedInstructionsPath);
}

export async function uninstallNovaKitInstructions(
  instructionsPath?: string,
  options: NovaKitInstructionsOptions = {},
): Promise<UninstallNovaKitInstructionsResult> {
  const resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  return markerInstructions.uninstall(resolvedInstructionsPath);
}

export async function doctorNovaKitInstructions(
  instructionsPath?: string,
  options: NovaKitInstructionsOptions = {},
): Promise<NovaKitDoctorReport> {
  let resolvedInstructionsPath: string;
  try {
    resolvedInstructionsPath = await resolveInstructionsPath(instructionsPath, options);
  } catch (error) {
    const aliasPath = instructionsPath ?? (await getDefaultAliasPath(options));
    return {
      instructionsPath: aliasPath,
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: TOKENJUICE_NOVAKIT_ADVISORY,
        fixCommand: (error as Error).message.includes("outside")
          ? "use a project-local NOVAKIT.md path, then run tokenjuice install novakit"
          : "replace symlinked NOVAKIT.md with a regular project file, then run tokenjuice install novakit",
      }),
    };
  }
  const { report, hasTokenjuiceMarker } = await inspectMarkerInstructionDoctor(
    resolvedInstructionsPath,
    TOKENJUICE_NOVAKIT_BLOCK_CONFIG,
    {
      configuredLabel: "NovaKit instructions",
      advisory: TOKENJUICE_NOVAKIT_ADVISORY,
      fixCommand: TOKENJUICE_NOVAKIT_FIX_COMMAND,
      malformedFixCommand: "remove unmatched tokenjuice markers from NOVAKIT.md, then run tokenjuice install novakit",
      malformedMarkerIssue: "configured NovaKit instructions have unmatched tokenjuice markers",
      repairOnMarkerIssues: true,
      guidanceOptions: {
        additionalRequired: [
          {
            requiredText: "tokenjuice terminal output compaction",
            missingIssue: "configured NovaKit instructions do not look like the tokenjuice instructions",
          },
        ],
        additionalRequiredAfter: [
          {
            requiredText: "NovaKit loads this NOVAKIT.md",
            missingIssue: "configured NovaKit instructions are missing NOVAKIT.md context guidance",
          },
        ],
      },
    },
  );
  return { instructionsPath: resolvedInstructionsPath, hasTokenjuiceMarker, ...report };
}
