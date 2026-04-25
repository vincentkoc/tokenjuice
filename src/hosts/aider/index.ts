import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type AiderConventionOptions = {
  projectDir?: string;
};

export type InstallAiderConventionResult = {
  conventionPath: string;
  backupPath?: string;
};

export type UninstallAiderConventionResult = {
  conventionPath: string;
  removed: boolean;
};

export type AiderDoctorReport = {
  conventionPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_AIDER_FIX_COMMAND = "tokenjuice install aider";
const TOKENJUICE_AIDER_MARKER = "tokenjuice terminal output compaction";

function getProjectDir(options: AiderConventionOptions = {}): string {
  return options.projectDir || process.env.AIDER_PROJECT_DIR || process.cwd();
}

function getDefaultConventionPath(options: AiderConventionOptions = {}): string {
  return join(getProjectDir(options), "CONVENTIONS.tokenjuice.md");
}

function buildAiderConvention(): string {
  return [
    `# ${TOKENJUICE_AIDER_MARKER}`,
    "",
    "- For terminal commands likely to produce long output, run them through `tokenjuice wrap -- <command>`.",
    "- Treat compacted tokenjuice output as authoritative unless it explicitly says raw output is required.",
    "- If raw bytes are required, rerun the command with exactly `tokenjuice wrap --raw -- <command>`.",
    "- Do not suggest both raw and full reruns; use the raw escape hatch.",
    "",
    "Load this file with `aider --read CONVENTIONS.tokenjuice.md` or add it to `.aider.conf.yml`.",
    "",
  ].join("\n");
}

async function readConvention(conventionPath: string): Promise<{ text: string; exists: boolean }> {
  try {
    return { text: await readFile(conventionPath, "utf8"), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { text: "", exists: false };
    }
    throw error;
  }
}

export async function installAiderConvention(
  conventionPath?: string,
  options: AiderConventionOptions = {},
): Promise<InstallAiderConventionResult> {
  const resolvedConventionPath = conventionPath ?? getDefaultConventionPath(options);
  const existing = await readConvention(resolvedConventionPath);
  let backupPath: string | undefined;
  if (existing.exists) {
    backupPath = `${resolvedConventionPath}.bak`;
    await writeFile(backupPath, existing.text, "utf8");
  }

  await mkdir(dirname(resolvedConventionPath), { recursive: true });
  const tempPath = `${resolvedConventionPath}.tmp`;
  await writeFile(tempPath, buildAiderConvention(), "utf8");
  await rename(tempPath, resolvedConventionPath);
  return {
    conventionPath: resolvedConventionPath,
    ...(backupPath ? { backupPath } : {}),
  };
}

export async function uninstallAiderConvention(conventionPath = getDefaultConventionPath()): Promise<UninstallAiderConventionResult> {
  const existing = await readConvention(conventionPath);
  if (existing.exists) {
    await rm(conventionPath, { force: true });
  }
  return { conventionPath, removed: existing.exists };
}

export async function doctorAiderConvention(
  conventionPath?: string,
  options: AiderConventionOptions = {},
): Promise<AiderDoctorReport> {
  const resolvedConventionPath = conventionPath ?? getDefaultConventionPath(options);
  const existing = await readConvention(resolvedConventionPath);
  if (!existing.exists) {
    return {
      conventionPath: resolvedConventionPath,
      status: "disabled",
      issues: ["tokenjuice Aider convention file is not installed"],
      advisories: ["Aider support is beta and convention-based; load it with aider --read CONVENTIONS.tokenjuice.md."],
      fixCommand: TOKENJUICE_AIDER_FIX_COMMAND,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const issues = existing.text.includes(TOKENJUICE_AIDER_MARKER)
    ? []
    : ["configured Aider convention file does not look like the tokenjuice convention"];

  return {
    conventionPath: resolvedConventionPath,
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: ["Aider support is beta and convention-based; load it with aider --read CONVENTIONS.tokenjuice.md."],
    fixCommand: TOKENJUICE_AIDER_FIX_COMMAND,
    checkedPaths: [],
    missingPaths: [],
  };
}
