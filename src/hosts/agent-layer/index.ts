import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
  type InstructionDoctorReportFields,
} from "../shared/instruction-doctor.js";

export type AgentLayerInstructionsOptions = {
  projectDir?: string;
};

export type InstallAgentLayerInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
  syncCommand: string;
};

export type UninstallAgentLayerInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
  syncCommand: string;
};

export type AgentLayerDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AGENT_LAYER_FIX_COMMAND = "tokenjuice install agent-layer";
const TOKENJUICE_AGENT_LAYER_INIT_FIX_COMMAND = "al init && tokenjuice install agent-layer";
const TOKENJUICE_AGENT_LAYER_INSTRUCTIONS_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_AGENT_LAYER_ADVISORY =
  "Agent Layer support is beta and instruction-based; run `al init` before install and `al sync` after install so generated client files receive the guidance.";
const TOKENJUICE_AGENT_LAYER_UNINITIALIZED_ISSUE =
  "Agent Layer project is not initialized; run `al init` before installing tokenjuice instructions";
const AGENT_LAYER_REQUIRED_PROJECT_FILES = [".agent-layer/config.toml", ".agent-layer/al.version"] as const;

function getExplicitProjectDir(options: AgentLayerInstructionsOptions = {}): string | undefined {
  return options.projectDir || process.env.AGENT_LAYER_PROJECT_DIR;
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function findGitRoot(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    if (await hasGitMetadata(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function resolveProjectDir(options: AgentLayerInstructionsOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? process.cwd();
}

async function getDefaultInstructionsPath(options: AgentLayerInstructionsOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".agent-layer", "instructions", "tokenjuice.md");
}

async function getAgentLayerProjectState(projectDir: string): Promise<{
  checkedPaths: string[];
  missingPaths: string[];
}> {
  const checkedPaths = AGENT_LAYER_REQUIRED_PROJECT_FILES.map((file) => join(projectDir, file));
  const exists = await Promise.all(checkedPaths.map((path) => pathExists(path)));
  return {
    checkedPaths,
    missingPaths: checkedPaths.filter((_, index) => !exists[index]),
  };
}

async function assertInitializedAgentLayerProject(projectDir: string): Promise<void> {
  const projectState = await getAgentLayerProjectState(projectDir);
  if (projectState.missingPaths.length === 0) {
    return;
  }

  throw new Error(
    `cannot install Agent Layer instructions because ${projectDir} is not initialized for Agent Layer; run al init first, then rerun tokenjuice install agent-layer`,
  );
}

function withProjectState(
  fields: InstructionDoctorReportFields,
  projectState?: { checkedPaths: string[]; missingPaths: string[] },
): InstructionDoctorReportFields {
  if (!projectState) {
    return fields;
  }

  return {
    ...fields,
    checkedPaths: projectState.checkedPaths,
    missingPaths: projectState.missingPaths,
  };
}

const TOKENJUICE_AGENT_LAYER_INSTRUCTIONS = [
  "# tokenjuice terminal output compaction",
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When Agent Layer syncs these instructions into client configs, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for terminal commands likely to produce long output.`,
  }),
  "- After editing this source instruction file, run `al sync` so generated client files receive the updated guidance.",
  "",
].join("\n");

export async function installAgentLayerInstructions(
  instructionsPath?: string,
  options: AgentLayerInstructionsOptions = {},
): Promise<InstallAgentLayerInstructionsResult> {
  let resolvedInstructionsPath = instructionsPath;
  if (!resolvedInstructionsPath) {
    const projectDir = await resolveProjectDir(options);
    await assertInitializedAgentLayerProject(projectDir);
    resolvedInstructionsPath = join(projectDir, ".agent-layer", "instructions", "tokenjuice.md");
  }
  const existing = await readInstructionFile(resolvedInstructionsPath);
  if (existing.exists && existing.text === TOKENJUICE_AGENT_LAYER_INSTRUCTIONS) {
    return { instructionsPath: resolvedInstructionsPath, syncCommand: "al sync" };
  }

  const result = await writeInstructionFile(resolvedInstructionsPath, TOKENJUICE_AGENT_LAYER_INSTRUCTIONS);
  return {
    instructionsPath: result.filePath,
    syncCommand: "al sync",
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallAgentLayerInstructions(
  instructionsPath?: string,
  options: AgentLayerInstructionsOptions = {},
): Promise<UninstallAgentLayerInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? (await getDefaultInstructionsPath(options));
  const result = await removeInstructionFile(resolvedInstructionsPath);
  return { instructionsPath: result.filePath, removed: result.removed, syncCommand: "al sync" };
}

export async function doctorAgentLayerInstructions(
  instructionsPath?: string,
  options: AgentLayerInstructionsOptions = {},
): Promise<AgentLayerDoctorReport> {
  const projectDir = instructionsPath ? undefined : await resolveProjectDir(options);
  const projectState = projectDir ? await getAgentLayerProjectState(projectDir) : undefined;
  const resolvedInstructionsPath =
    instructionsPath ?? join(projectDir ?? (await resolveProjectDir(options)), ".agent-layer", "instructions", "tokenjuice.md");
  const isProjectInitialized = !projectState || projectState.missingPaths.length === 0;
  const fixCommand = isProjectInitialized ? TOKENJUICE_AGENT_LAYER_FIX_COMMAND : TOKENJUICE_AGENT_LAYER_INIT_FIX_COMMAND;
  const existing = await readInstructionFile(resolvedInstructionsPath);
  if (!existing.exists) {
    return {
      instructionsPath: resolvedInstructionsPath,
      ...withProjectState(
        buildInstructionDoctorReportFields({
          status: "disabled",
          issues: [
            "tokenjuice Agent Layer instructions are not installed",
            ...(isProjectInitialized ? [] : [TOKENJUICE_AGENT_LAYER_UNINITIALIZED_ISSUE]),
          ],
          advisory: TOKENJUICE_AGENT_LAYER_ADVISORY,
          fixCommand,
        }),
        projectState,
      ),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_AGENT_LAYER_INSTRUCTIONS_MARKER,
        missingIssue: "configured Agent Layer instructions do not look like the tokenjuice instructions",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Agent Layer instructions are missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Agent Layer instructions are missing the raw escape hatch",
      },
      {
        requiredText: "al sync",
        missingIssue: "configured Agent Layer instructions are missing sync guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Agent Layer instructions still suggest the full escape hatch",
      },
    ],
  });

  const allIssues = [...issues, ...(isProjectInitialized ? [] : [TOKENJUICE_AGENT_LAYER_UNINITIALIZED_ISSUE])];

  return {
    instructionsPath: resolvedInstructionsPath,
    ...withProjectState(
      buildInstructionDoctorReportFields({
        status: instructionDoctorStatusFromIssues(allIssues),
        issues: allIssues,
        advisory: TOKENJUICE_AGENT_LAYER_ADVISORY,
        fixCommand,
      }),
      projectState,
    ),
  };
}
