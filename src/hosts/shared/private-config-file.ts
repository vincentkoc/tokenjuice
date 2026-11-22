import { chmod, lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { InstructionFileSnapshot, WriteInstructionFileResult } from "./instruction-file.js";

async function getExistingFileMode(filePath: string, existing: InstructionFileSnapshot): Promise<number | undefined> {
  if (!existing.exists) {
    return undefined;
  }
  return (await lstat(filePath)).mode & 0o777;
}

async function writePrivateConfigAtomically(filePath: string, text: string, mode?: number): Promise<void> {
  const fileMode = mode ?? 0o600;
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const tempDir = await mkdtemp(join(dirname(filePath), ".tokenjuice-"));
  const tempPath = join(tempDir, "write");
  try {
    await writeFile(tempPath, text, { encoding: "utf8", flag: "wx", mode: fileMode });
    await chmod(tempPath, fileMode);
    await rename(tempPath, filePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function writePrivateConfigFile(
  filePath: string,
  text: string,
  existing: InstructionFileSnapshot,
  chooseBackupPath: (filePath: string) => Promise<string>,
): Promise<WriteInstructionFileResult<"configPath">> {
  const mode = await getExistingFileMode(filePath, existing);
  let backupPath: string | undefined;
  if (existing.exists) {
    backupPath = await chooseBackupPath(filePath);
    await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx", mode: mode ?? 0o600 });
    await chmod(backupPath, mode ?? 0o600);
  }
  await writePrivateConfigAtomically(filePath, text, mode);
  return {
    configPath: filePath,
    ...(backupPath ? { backupPath } : {}),
  };
}
