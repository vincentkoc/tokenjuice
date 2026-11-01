import { rename, rm, writeFile } from "node:fs/promises";

import { readInstructionFile, removeInstructionFile } from "./instruction-file.js";
import type { RemoveInstructionFileResult, WriteInstructionFileResult } from "./instruction-file.js";

async function chooseBackupSuffix(filePath: string): Promise<string> {
  const primaryBackup = await readInstructionFile(`${filePath}.bak`);
  if (!primaryBackup.exists) {
    return ".bak";
  }

  const secondaryBackup = await readInstructionFile(`${filePath}.tokenjuice.bak`);
  if (!secondaryBackup.exists) {
    return ".tokenjuice.bak";
  }

  for (let index = 1; ; index += 1) {
    const suffix = `.tokenjuice-${index}.bak`;
    const candidate = await readInstructionFile(`${filePath}${suffix}`);
    if (!candidate.exists) {
      return suffix;
    }
  }
}

export function createRestorableRuleCommands(config: {
  buildText: (options?: { restoreBackupSuffix?: string | undefined }) => string;
  isManagedText: (text: string) => boolean;
  readRestoreBackupSuffix: (text: string) => string | undefined;
  writeWithoutBackup: (filePath: string, options?: { restoreBackupSuffix?: string | undefined }) => Promise<void>;
  refusalMessage: (filePath: string) => string;
}) {
  async function install(filePath: string): Promise<WriteInstructionFileResult> {
    const existing = await readInstructionFile(filePath);
    if (existing.exists && config.isManagedText(existing.text)) {
      const restoreBackupSuffix = config.readRestoreBackupSuffix(existing.text);
      const expectedRule = config.buildText({ restoreBackupSuffix });
      if (existing.text === expectedRule) {
        return { filePath };
      }

      const backupPath = `${filePath}${await chooseBackupSuffix(filePath)}`;
      await writeFile(backupPath, existing.text, "utf8");
      await config.writeWithoutBackup(filePath, { restoreBackupSuffix });
      return { filePath, backupPath };
    }

    if (existing.exists) {
      const backupSuffix = await chooseBackupSuffix(filePath);
      const backupPath = `${filePath}${backupSuffix}`;
      await writeFile(backupPath, existing.text, "utf8");
      await config.writeWithoutBackup(filePath, { restoreBackupSuffix: backupSuffix });
      return { filePath, backupPath };
    }

    await config.writeWithoutBackup(filePath);
    return { filePath };
  }

  async function uninstall(filePath: string): Promise<RemoveInstructionFileResult> {
    const existing = await readInstructionFile(filePath);
    if (existing.exists && !config.isManagedText(existing.text)) {
      throw new Error(config.refusalMessage(filePath));
    }

    const restoreBackupSuffix = config.readRestoreBackupSuffix(existing.text);
    const backupPath = restoreBackupSuffix ? `${filePath}${restoreBackupSuffix}` : "";
    const backup = restoreBackupSuffix ? await readInstructionFile(backupPath) : { exists: false, text: "" };
    if (
      existing.exists
      && restoreBackupSuffix
      && backup.exists
      && !config.isManagedText(backup.text)
    ) {
      await rm(filePath, { force: true });
      await rename(backupPath, filePath);
      return { filePath, removed: true };
    }

    const result = await removeInstructionFile(filePath);
    return { filePath: result.filePath, removed: result.removed };
  }

  return { install, uninstall };
}
