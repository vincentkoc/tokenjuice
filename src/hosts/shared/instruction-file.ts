import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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

export async function writeInstructionFile(filePath: string, text: string): Promise<WriteInstructionFileResult> {
  const existing = await readInstructionFile(filePath);
  let backupPath: string | undefined;
  if (existing.exists) {
    backupPath = `${filePath}.bak`;
    await writeFile(backupPath, existing.text, "utf8");
  }

  await mkdir(dirname(filePath), { recursive: true });
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
