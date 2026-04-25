import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type JunieInstructionsOptions = {
  projectDir?: string;
};

export type InstallJunieInstructionsResult = {
  instructionsPath: string;
  backupPath?: string;
};

export type UninstallJunieInstructionsResult = {
  instructionsPath: string;
  removed: boolean;
};

export type JunieDoctorReport = {
  instructionsPath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_JUNIE_FIX_COMMAND = "tokenjuice install junie";
const TOKENJUICE_JUNIE_BEGIN = "<!-- tokenjuice:begin -->";
const TOKENJUICE_JUNIE_END = "<!-- tokenjuice:end -->";

function getProjectDir(options: JunieInstructionsOptions = {}): string {
  return options.projectDir || process.env.JUNIE_PROJECT_DIR || process.cwd();
}

function getDefaultInstructionsPath(options: JunieInstructionsOptions = {}): string {
  return join(getProjectDir(options), ".junie", "AGENTS.md");
}

function buildJunieBlock(): string {
  return [
    TOKENJUICE_JUNIE_BEGIN,
    "## tokenjuice terminal output compaction",
    "",
    "- For terminal commands likely to produce long output, run them through `tokenjuice wrap -- <command>`.",
    "- Treat compacted tokenjuice output as authoritative unless it explicitly says raw output is required.",
    "- If raw bytes are required, rerun the command with exactly `tokenjuice wrap --raw -- <command>`.",
    "- Do not suggest both raw and full reruns; use the raw escape hatch.",
    TOKENJUICE_JUNIE_END,
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
  const pattern = new RegExp(`\\n?${TOKENJUICE_JUNIE_BEGIN}[\\s\\S]*?${TOKENJUICE_JUNIE_END}\\n?`, "u");
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
    return `${buildJunieBlock()}\n`;
  }
  return `${withoutBlock}\n\n${buildJunieBlock()}\n`;
}

export async function installJunieInstructions(
  instructionsPath?: string,
  options: JunieInstructionsOptions = {},
): Promise<InstallJunieInstructionsResult> {
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

export async function uninstallJunieInstructions(instructionsPath = getDefaultInstructionsPath()): Promise<UninstallJunieInstructionsResult> {
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

export async function doctorJunieInstructions(
  instructionsPath?: string,
  options: JunieInstructionsOptions = {},
): Promise<JunieDoctorReport> {
  const resolvedInstructionsPath = instructionsPath ?? getDefaultInstructionsPath(options);
  const existing = await readInstructions(resolvedInstructionsPath);
  if (!existing.exists || !existing.text.includes(TOKENJUICE_JUNIE_BEGIN)) {
    return {
      instructionsPath: resolvedInstructionsPath,
      status: "disabled",
      issues: ["tokenjuice Junie instructions are not installed"],
      advisories: ["Junie support is beta and instruction-based; it guides command usage but does not intercept tool output."],
      fixCommand: TOKENJUICE_JUNIE_FIX_COMMAND,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const issues = existing.text.includes(TOKENJUICE_JUNIE_END)
    ? []
    : ["configured Junie instructions have a tokenjuice start marker without an end marker"];

  return {
    instructionsPath: resolvedInstructionsPath,
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: ["Junie support is beta and instruction-based; it guides command usage but does not intercept tool output."],
    fixCommand: TOKENJUICE_JUNIE_FIX_COMMAND,
    checkedPaths: [],
    missingPaths: [],
  };
}
