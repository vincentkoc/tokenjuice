import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { buildInstructionDoctorReportFields, type InstructionsDoctorReport } from "../shared/instruction-doctor.js";
import { buildTokenjuiceGuidanceBullets } from "../shared/instruction-guidance.js";
import type { RemoveInstructionFileResult, WriteInstructionFileResult } from "../shared/instruction-file.js";
import { inspectMarkerInstructionDoctor } from "../shared/marker-instruction-doctor.js";
import { createMarkerInstructionCommands } from "../shared/marker-instructions.js";
import { createProjectInstructionPathResolver, createSymlinkGuard } from "../shared/path-ancestors.js";
import { createProjectDirResolver } from "../shared/project-root.js";

export type FxInstructionsOptions = { projectDir?: string };
export type InstallFxInstructionsResult = WriteInstructionFileResult<"instructionsPath">;
export type UninstallFxInstructionsResult = RemoveInstructionFileResult<"instructionsPath">;
export type FxDoctorReport = InstructionsDoctorReport & { hasTokenjuiceMarker: boolean };

const FIX_COMMAND = "tokenjuice install fx";
const ADVISORY = "fx support is beta and instruction-based; it guides command usage through project AGENTS.md but does not intercept tool output.";
const resolveProjectDir = createProjectDirResolver("FX_PROJECT_DIR");
const rejectSymlink = createSymlinkGuard(
  (path) => `cannot use fx instructions ${path}; tokenjuice will not read or write through instruction symlinks`,
);
const resolveProjectPath = createProjectInstructionPathResolver("fx instructions", rejectSymlink);
const blockConfig = {
  beginMarker: "<!-- tokenjuice:fx begin -->",
  endMarker: "<!-- tokenjuice:fx end -->",
  preserveSurroundingText: true,
  block: [
    "<!-- tokenjuice:fx begin -->",
    "## tokenjuice terminal output compaction",
    "",
    ...buildTokenjuiceGuidanceBullets({
      wrapBullet: "- When running terminal commands through fx, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
    }),
    "- Use `tokenjuice wrap --keep-failures -- <command>` when failure output must remain complete.",
    "- Keep shell-state changes such as cd, export, source, and activation scripts in the native shell instead of wrapping them.",
    "<!-- tokenjuice:fx end -->",
  ].join("\n"),
};
const commands = createMarkerInstructionCommands("fx", blockConfig);

async function resolveInstructionsPath(path: string | undefined, options: FxInstructionsOptions): Promise<string> {
  const projectDir = await resolveProjectDir(options);
  const realProjectDir = await realpath(projectDir).catch(() => projectDir);
  return resolveProjectPath(path ?? join(projectDir, "AGENTS.md"), projectDir, realProjectDir);
}

export async function installFxInstructions(
  path?: string,
  options: FxInstructionsOptions = {},
): Promise<InstallFxInstructionsResult> {
  return commands.install(await resolveInstructionsPath(path, options));
}

export async function uninstallFxInstructions(
  path?: string,
  options: FxInstructionsOptions = {},
): Promise<UninstallFxInstructionsResult> {
  return commands.uninstall(await resolveInstructionsPath(path, options));
}

export async function doctorFxInstructions(
  path?: string,
  options: FxInstructionsOptions = {},
): Promise<FxDoctorReport> {
  let instructionsPath: string;
  try {
    instructionsPath = await resolveInstructionsPath(path, options);
  } catch (error) {
    return {
      instructionsPath: path ?? join(await resolveProjectDir(options), "AGENTS.md"),
      hasTokenjuiceMarker: false,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: [(error as Error).message],
        advisory: ADVISORY,
        fixCommand: "use a regular instruction file inside the fx project, then run tokenjuice install fx",
      }),
    };
  }
  const result = await inspectMarkerInstructionDoctor(instructionsPath, blockConfig, {
    configuredLabel: "fx instructions",
    advisory: ADVISORY,
    fixCommand: FIX_COMMAND,
    malformedFixCommand: "remove unmatched tokenjuice markers from AGENTS.md, then run tokenjuice install fx",
    malformedMarkerIssue: "configured fx instructions have unmatched tokenjuice markers",
  });
  return { instructionsPath, ...result.report, hasTokenjuiceMarker: result.hasTokenjuiceMarker };
}
