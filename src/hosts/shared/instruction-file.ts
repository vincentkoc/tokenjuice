import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type InstructionFileSnapshot = {
  text: string;
  exists: boolean;
};

export type WriteInstructionFileResult = {
  filePath: string;
  backupPath?: string;
};

export type RemoveInstructionFileResult = {
  filePath: string;
  removed: boolean;
};

export type GuidanceIssueCheck = {
  requiredText: string;
  missingIssue: string;
};

export type ForbiddenGuidanceCheck = {
  forbiddenText: string;
  presentIssue: string;
};

export type GuidanceIssueOptions = {
  required: GuidanceIssueCheck[];
  forbidden?: ForbiddenGuidanceCheck[];
};

export async function readInstructionFile(filePath: string): Promise<InstructionFileSnapshot> {
  try {
    return { text: await readFile(filePath, "utf8"), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { text: "", exists: false };
    }
    throw error;
  }
}

async function instructionBackupPathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function chooseInstructionBackupPath(filePath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${filePath}.bak` : `${filePath}.bak.${index}`;
    if (!(await instructionBackupPathExists(candidate))) {
      return candidate;
    }
  }
}

export async function writeInstructionFile(filePath: string, text: string): Promise<WriteInstructionFileResult> {
  const existing = await readInstructionFile(filePath);
  await mkdir(dirname(filePath), { recursive: true });
  let backupPath: string | undefined;
  if (existing.exists) {
    backupPath = await chooseInstructionBackupPath(filePath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx" });
  }

  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, text, "utf8");
  await rename(tempPath, filePath);
  return {
    filePath,
    ...(backupPath ? { backupPath } : {}),
  };
}

export async function removeInstructionFile(filePath: string): Promise<RemoveInstructionFileResult> {
  const existing = await readInstructionFile(filePath);
  if (existing.exists) {
    await rm(filePath, { force: true });
  }
  return { filePath, removed: existing.exists };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function matchesForbiddenText(text: string, forbiddenText: string): boolean {
  if (text.includes(forbiddenText)) {
    return true;
  }

  const commandPlaceholder = "<command>";
  const placeholderIndex = forbiddenText.indexOf(commandPlaceholder);
  if (placeholderIndex === -1) {
    return false;
  }

  const prefix = forbiddenText.slice(0, placeholderIndex).trimEnd();
  const suffix = forbiddenText.slice(placeholderIndex + commandPlaceholder.length).trimStart();
  const commandPattern = new RegExp(`${escapeRegExp(prefix)}\\s+\\S+${escapeRegExp(suffix)}`, "u");
  return commandPattern.test(text);
}

export function collectGuidanceIssues(text: string, options: GuidanceIssueOptions): string[] {
  const issues: string[] = [];
  for (const check of options.required) {
    if (!text.includes(check.requiredText)) {
      issues.push(check.missingIssue);
    }
  }
  for (const check of options.forbidden ?? []) {
    if (matchesForbiddenText(text, check.forbiddenText)) {
      issues.push(check.presentIssue);
    }
  }
  return issues;
}
