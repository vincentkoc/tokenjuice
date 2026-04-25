import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ZedInstructionsOptions = {
  projectDir?: string;
};

export type InstallZedInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallZedInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type ZedDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_ZED_FIX_COMMAND = "tokenjuice install zed";
const TOKENJUICE_ZED_BEGIN = "<!-- tokenjuice:begin -->";
const TOKENJUICE_ZED_END = "<!-- tokenjuice:end -->";

function getProjectDir(options: ZedInstructionsOptions = {}): string {
  return options.projectDir || process.env.ZED_PROJECT_DIR || process.cwd();
}

function getDefaultInstructionsPath(options: ZedInstructionsOptions = {}): string {
  return join(getProjectDir(options), ".rules");
}

function buildZedBlock(): string {
  return [
    TOKENJUICE_ZED_BEGIN,
    "## tokenjuice terminal output compaction",
    "",
    "- For terminal commands likely to produce long output, run them through `tokenjuice wrap -- <command>`.",
    "- Treat compacted tokenjuice output as authoritative unless it explicitly says raw output is required.",
    "- If raw bytes are required, rerun the command with exactly `tokenjuice wrap --raw -- <command>`.",
    "- Do not suggest both raw and full reruns; use the raw escape hatch.",
    TOKENJUICE_ZED_END,
  ].join("\n");
}

async function readInstructions(instructionsPath: string): Promise<{ text: string; exists: boolean }> {
  try {
    return { text: await readFile(instructionsPath, "utf8"), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { text: "", exists: false };
    }
    throw error;
  }
}

function removeTokenjuiceBlock(text: string): { text: string; removed: boolean } {
  const pattern = new RegExp(`\\n?${TOKENJUICE_ZED_BEGIN}[\\s\\S]*?${TOKENJUICE_ZED_END}\\n?`, "u");
  if (!pattern.test(text)) {
    return { text, removed: false };
  }
  return {
    text: text.replace(pattern, "\n").replace(/\n{3,}/gu, "\n\n").trim(),
    removed: true,
  };
}

function upsertTokenjuiceBlock(text: string): string {
  const withoutBlock = removeTokenjuiceBlock(text).text.trim();
  if (!withoutBlock) {
    return `${buildZedBlock()}\n`;
  }
  return `${withoutBlock}\n\n${buildZedBlock()}\n`;
}

export async function installZedInstructions(
  instructionsPath?: string,
  options: ZedInstructionsOptions = {},
): Promise<InstallZedInstructionsResult> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const existing = await readInstructions(resolvedInstructionsPath);
  let backupPath: string | undefined;
  if (existing.exists) {
    backupPath = `${resolvedInstructionsPath}.bak`;
    await writeFile(backupPath, existing.text, "utf8");
  }

  await mkdir(dirname(resolvedInstructionsPath), { recursive: true });
  const tempPath = `${resolvedInstructionsPath}.tmp`;
  await writeFile(tempPath, upsertTokenjuiceBlock(existing.text), "utf8");
  await rename(tempPath, resolvedInstructionsPath);
  return {
    instructionsPath: resolvedInstructionsPath,
    ...(backupPath ? { backupPath } : {}),
  };
}

export async function uninstallZedInstructions(instructionsPath = getDefaultInstructionsPath()): Promise<UninstallZedInstructionsResult> {
  const existing = await readInstructions(instructionsPath);
  if (!existing.exists) {
    return { instructionsPath, removed: false };
  }
  const removed = removeTokenjuiceBlock(existing.text);
  if (!removed.removed) {
    return { instructionsPath, removed: false };
  }
  if (removed.text.trim()) {
    await writeFile(instructionsPath, `${removed.text.trim()}\n`, "utf8");
  } else {
    await rm(instructionsPath, { force: true });
  }
  return { instructionsPath, removed: true };
}

export async function doctorZedInstructions(
  instructionsPath?: string,
  options: ZedInstructionsOptions = {},
): Promise<ZedDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const existing = await readInstructions(resolvedInstructionsPath);
  if (!existing.exists || !existing.text.includes(TOKENJUICE_ZED_BEGIN)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      status: "disabled",
      issues: ["tokenjuice Zed rules are not installed"],
      advisories: ["Zed support is beta and rule-based; it guides command usage but does not intercept tool output."],
      fixCommand: TOKENJUICE_ZED_FIX_COMMAND,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const issues = existing.text.includes(TOKENJUICE_ZED_END)
    ? []
    : ["configured Zed rules have a tokenjuice start marker without an end marker"];

  return {
    instructionsPath: resolvedInstructionsPath,
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: ["Zed support is beta and rule-based; it guides command usage but does not intercept tool output."],
    fixCommand: TOKENJUICE_ZED_FIX_COMMAND,
    checkedPaths: [],
    missingPaths: [],
  };
}
