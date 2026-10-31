import { rename, rm, writeFile } from "node:fs/promises";

import {
  findAvailableBackupPath,
  readInstructionFile,
  removeInstructionFile,
  writeInstructionFile,
  writeTextFileWithoutBackup,
  type RemoveInstructionFileResult,
  type WriteInstructionFileResult,
} from "./instruction-file.js";

type RestorableSkillConfig = {
  buildSkill: (options?: { restoreBackupSuffix?: string | undefined }) => string;
  isManagedText: (text: string) => boolean;
  readRestoreBackupSuffix: (text: string) => string | undefined;
  rejectSkillSymlink: (path: string) => Promise<void>;
  rejectInstallSidecarSymlinks: (path: string) => Promise<void>;
};

export function createRestorableSkillCommands(config: RestorableSkillConfig) {
  return {
    async install(skillPath: string): Promise<WriteInstructionFileResult<"skillPath">> {
      await config.rejectInstallSidecarSymlinks(skillPath);
      const existing = await readInstructionFile(skillPath);
      if (existing.exists && config.isManagedText(existing.text)) {
        const nextSkill = config.buildSkill({ restoreBackupSuffix: config.readRestoreBackupSuffix(existing.text) });
        if (existing.text === nextSkill) {
          return { skillPath };
        }
        const result = await writeInstructionFile(skillPath, nextSkill);
        return {
          skillPath: result.filePath,
          ...(result.backupPath ? { backupPath: result.backupPath } : {}),
        };
      }

      if (existing.exists) {
        const backupPath = await findAvailableBackupPath(skillPath);
        await writeFile(backupPath, existing.text, { encoding: "utf8", flag: "wx" });
        await writeTextFileWithoutBackup(
          skillPath,
          config.buildSkill({ restoreBackupSuffix: backupPath.slice(skillPath.length) }),
        );
        return { skillPath, backupPath };
      }

      await writeTextFileWithoutBackup(skillPath, config.buildSkill());
      return { skillPath };
    },
    async uninstall(skillPath: string): Promise<RemoveInstructionFileResult<"skillPath">> {
      const existing = await readInstructionFile(skillPath);
      if (!existing.exists || !config.isManagedText(existing.text)) {
        return { skillPath, removed: false };
      }
      const restoreBackupSuffix = config.readRestoreBackupSuffix(existing.text);
      if (restoreBackupSuffix) {
        const backupPath = `${skillPath}${restoreBackupSuffix}`;
        await config.rejectSkillSymlink(backupPath);
        const backup = await readInstructionFile(backupPath);
        if (backup.exists && !config.isManagedText(backup.text)) {
          await rm(skillPath, { force: true });
          await rename(backupPath, skillPath);
          return { skillPath, removed: true };
        }
      }
      const result = await removeInstructionFile(skillPath);
      return { skillPath: result.filePath, removed: result.removed };
    },
  };
}
