import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ContinueRuleOptions = {
  projectDir?: string;
};

export type InstallContinueRuleResult = {
  rulePath: string;
  backupPath?: string;
};

export type UninstallContinueRuleResult = {
  rulePath: string;
  removed: boolean;
};

export type ContinueDoctorReport = {
  rulePath: string;
  status: "ok" | "warn" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_CONTINUE_FIX_COMMAND = "tokenjuice install continue";
const TOKENJUICE_CONTINUE_RULE_MARKER = "tokenjuice terminal output compaction";

function getProjectDir(options: ContinueRuleOptions = {}): string {
  return options.projectDir || process.env.CONTINUE_PROJECT_DIR || process.cwd();
}

function getDefaultRulePath(options: ContinueRuleOptions = {}): string {
  return join(getProjectDir(options), ".continue", "rules", "tokenjuice.md");
}

function buildContinueRule(): string {
  return [
    "---",
    `name: ${TOKENJUICE_CONTINUE_RULE_MARKER}`,
    "---",
    "",
    "- When running terminal commands through Continue, prefer `tokenjuice wrap -- <command>` for commands likely to produce long output.",
    "- Treat compacted tokenjuice output as authoritative unless it explicitly says raw output is required.",
    "- If raw bytes are required, rerun the command with exactly `tokenjuice wrap --raw -- <command>`.",
    "- Do not suggest both raw and full reruns; use the raw escape hatch.",
    "",
  ].join("\n");
}

async function readRule(rulePath: string): Promise<{ text: string; exists: boolean }> {
  try {
    return { text: await readFile(rulePath, "utf8"), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { text: "", exists: false };
    }
    throw error;
  }
}

export async function installContinueRule(
  rulePath?: string,
  options: ContinueRuleOptions = {},
): Promise<InstallContinueRuleResult> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const existing = await readRule(resolvedRulePath);
  let backupPath: string | undefined;
  if (existing.exists) {
    backupPath = `${resolvedRulePath}.bak`;
    await writeFile(backupPath, existing.text, "utf8");
  }

  await mkdir(dirname(resolvedRulePath), { recursive: true });
  const tempPath = `${resolvedRulePath}.tmp`;
  await writeFile(tempPath, buildContinueRule(), "utf8");
  await rename(tempPath, resolvedRulePath);
  return {
    rulePath: resolvedRulePath,
    ...(backupPath ? { backupPath } : {}),
  };
}

export async function uninstallContinueRule(rulePath = getDefaultRulePath()): Promise<UninstallContinueRuleResult> {
  const existing = await readRule(rulePath);
  if (existing.exists) {
    await rm(rulePath, { force: true });
  }
  return { rulePath, removed: existing.exists };
}

export async function doctorContinueRule(
  rulePath?: string,
  options: ContinueRuleOptions = {},
): Promise<ContinueDoctorReport> {
  const resolvedRulePath = rulePath ?? getDefaultRulePath(options);
  const existing = await readRule(resolvedRulePath);
  if (!existing.exists) {
    return {
      rulePath: resolvedRulePath,
      status: "disabled",
      issues: ["tokenjuice Continue rule is not installed"],
      advisories: ["Continue support is beta and rule-based; it guides command usage but does not intercept tool output."],
      fixCommand: TOKENJUICE_CONTINUE_FIX_COMMAND,
      checkedPaths: [],
      missingPaths: [],
    };
  }

  const issues = existing.text.includes(TOKENJUICE_CONTINUE_RULE_MARKER)
    ? []
    : ["configured Continue rule file does not look like the tokenjuice rule"];

  return {
    rulePath: resolvedRulePath,
    status: issues.length > 0 ? "broken" : "ok",
    issues,
    advisories: ["Continue support is beta and rule-based; it guides command usage but does not intercept tool output."],
    fixCommand: TOKENJUICE_CONTINUE_FIX_COMMAND,
    checkedPaths: [],
    missingPaths: [],
  };
}
