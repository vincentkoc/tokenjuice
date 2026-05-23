import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildTokenjuiceGuidanceBullets, TOKENJUICE_FULL_COMMAND, TOKENJUICE_RAW_COMMAND, TOKENJUICE_WRAP_COMMAND } from "../shared/instruction-guidance.js";
import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type PlandexConventionOptions = {
  projectDir?: string;
};

export type InstallPlandexConventionResult = {
  conventionPath: string;
  backupPath?: string;
};

export type UninstallPlandexConventionResult = {
  conventionPath: string;
  removed: boolean;
};

export type PlandexDoctorReport = {
  conventionPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_PLANDEX_FIX_COMMAND = "tokenjuice install plandex";
const TOKENJUICE_PLANDEX_MARKER = "tokenjuice terminal output compaction";
const TOKENJUICE_PLANDEX_ADVISORY = "Plandex support is beta and context-based; load it with plandex load PLANDEX.tokenjuice.md or @PLANDEX.tokenjuice.md in the REPL.";
const TOKENJUICE_PLANDEX_LOAD_COMMAND = "plandex load PLANDEX.tokenjuice.md";
const TOKENJUICE_PLANDEX_REINSTALL_BACKUP_SUFFIX = ".tokenjuice.bak";

function getExplicitProjectDir(options: PlandexConventionOptions = {}): string | undefined {
  return options.projectDir || process.env.PLANDEX_PROJECT_DIR;
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
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

async function resolveProjectDir(options: PlandexConventionOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? resolve(process.cwd());
}

async function getDefaultConventionPath(options: PlandexConventionOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), "PLANDEX.tokenjuice.md");
}

const TOKENJUICE_PLANDEX_CONVENTION = [
  `# ${TOKENJUICE_PLANDEX_MARKER}`,
  "",
  ...buildTokenjuiceGuidanceBullets({
    wrapBullet: `- When asking Plandex to run or propose terminal commands, prefer \`${TOKENJUICE_WRAP_COMMAND}\` for commands likely to produce long output.`,
  }),
  "",
  `Load this file with \`${TOKENJUICE_PLANDEX_LOAD_COMMAND}\` or \`@PLANDEX.tokenjuice.md\` in the Plandex REPL.`,
  "When loading noisy command output into context, compact it first: `tokenjuice wrap -- <command> | plandex load`.",
  "",
].join("\n");

function isTokenjuicePlandexConventionText(text: string): boolean {
  return text.includes(TOKENJUICE_PLANDEX_MARKER);
}

async function writePlandexConventionWithoutBackup(conventionPath: string): Promise<void> {
  await mkdir(dirname(conventionPath), { recursive: true });
  const tempPath = `${conventionPath}.tmp`;
  await writeFile(tempPath, TOKENJUICE_PLANDEX_CONVENTION, "utf8");
  await rename(tempPath, conventionPath);
}

export async function installPlandexConvention(
  conventionPath?: string,
  options: PlandexConventionOptions = {},
): Promise<InstallPlandexConventionResult> {
  const resolvedConventionPath = conventionPath ?? await getDefaultConventionPath(options);
  const existing = await readInstructionFile(resolvedConventionPath);
  if (existing.exists && isTokenjuicePlandexConventionText(existing.text)) {
    if (existing.text === TOKENJUICE_PLANDEX_CONVENTION) {
      return { conventionPath: resolvedConventionPath };
    }

    const primaryBackupPath = `${resolvedConventionPath}.bak`;
    const primaryBackup = await readInstructionFile(primaryBackupPath);
    const backupPath = primaryBackup.exists && !isTokenjuicePlandexConventionText(primaryBackup.text)
      ? `${resolvedConventionPath}${TOKENJUICE_PLANDEX_REINSTALL_BACKUP_SUFFIX}`
      : primaryBackupPath;
    await writeFile(backupPath, existing.text, "utf8");
    await writePlandexConventionWithoutBackup(resolvedConventionPath);
    return { conventionPath: resolvedConventionPath, backupPath };
  }

  const result = await writeInstructionFile(resolvedConventionPath, TOKENJUICE_PLANDEX_CONVENTION);
  return {
    conventionPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallPlandexConvention(
  conventionPath?: string,
  options: PlandexConventionOptions = {},
): Promise<UninstallPlandexConventionResult> {
  const resolvedConventionPath = conventionPath ?? await getDefaultConventionPath(options);
  const existing = await readInstructionFile(resolvedConventionPath);
  if (existing.exists && !isTokenjuicePlandexConventionText(existing.text)) {
    throw new Error(
      `refusing to remove ${resolvedConventionPath}; it does not look like the tokenjuice Plandex convention. Review and remove it manually, or reinstall tokenjuice plandex first.`,
    );
  }

  const backupPath = `${resolvedConventionPath}.bak`;
  const backup = await readInstructionFile(backupPath);
  if (existing.exists && backup.exists && !isTokenjuicePlandexConventionText(backup.text)) {
    await rm(resolvedConventionPath, { force: true });
    await rename(backupPath, resolvedConventionPath);
    return { conventionPath: resolvedConventionPath, removed: true };
  }

  const result = await removeInstructionFile(resolvedConventionPath);
  return { conventionPath: result.filePath, removed: result.removed };
}

export async function doctorPlandexConvention(
  conventionPath?: string,
  options: PlandexConventionOptions = {},
): Promise<PlandexDoctorReport> {
  const resolvedConventionPath = conventionPath ?? await getDefaultConventionPath(options);
  const existing = await readInstructionFile(resolvedConventionPath);
  if (!existing.exists) {
    return {
      conventionPath: resolvedConventionPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Plandex convention file is not installed"],
        advisory: TOKENJUICE_PLANDEX_ADVISORY,
        fixCommand: TOKENJUICE_PLANDEX_FIX_COMMAND,
      }),
    };
  }
  if (!isTokenjuicePlandexConventionText(existing.text)) {
    return {
      conventionPath: resolvedConventionPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Plandex convention file is not installed"],
        advisory: TOKENJUICE_PLANDEX_ADVISORY,
        fixCommand: TOKENJUICE_PLANDEX_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_PLANDEX_MARKER,
        missingIssue: "configured Plandex convention file does not look like the tokenjuice convention",
      },
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: "configured Plandex convention file is missing tokenjuice wrap guidance",
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: "configured Plandex convention file is missing the raw escape hatch",
      },
      {
        requiredText: TOKENJUICE_PLANDEX_LOAD_COMMAND,
        missingIssue: "configured Plandex convention file is missing Plandex load guidance",
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: "configured Plandex convention file still suggests the full escape hatch",
      },
    ],
  });

  return {
    conventionPath: resolvedConventionPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_PLANDEX_ADVISORY,
      fixCommand: TOKENJUICE_PLANDEX_FIX_COMMAND,
    }),
  };
}
