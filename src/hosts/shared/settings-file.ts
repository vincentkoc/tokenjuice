import { constants, type Stats } from "node:fs";
import { link, lstat, mkdir, mkdtemp, open, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export type SettingsFile = {
  path: string;
  logicalPath: string;
  targetPath: string;
  data?: Buffer;
  metadata?: Stats;
};

function changed(file: SettingsFile): Error {
  return new Error(`settings changed while updating ${file.path}; retry after other settings edits finish`);
}

async function readTarget(targetPath: string): Promise<{ data: Buffer; metadata: Stats }> {
  const handle = await open(targetPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      throw new Error(`settings path is not a regular file: ${targetPath}`);
    }
    return { data: await handle.readFile(), metadata };
  } finally {
    await handle.close();
  }
}

function sameMetadata(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.uid === right.uid && left.gid === right.gid && left.size === right.size
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

async function assertUnchanged(file: SettingsFile): Promise<void> {
  try {
    if (!file.metadata) {
      try {
        await lstat(file.logicalPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT"
          && await realpath(dirname(file.logicalPath)) === dirname(file.targetPath)) {
          return;
        }
        throw error;
      }
      throw changed(file);
    }
    if (await realpath(file.logicalPath) !== file.targetPath) {
      throw changed(file);
    }
    const current = await readTarget(file.targetPath);
    if (!sameMetadata(file.metadata, current.metadata) || !file.data?.equals(current.data)) {
      throw changed(file);
    }
  } catch {
    throw changed(file);
  }
}

export async function readSettingsFile(path: string): Promise<SettingsFile> {
  const logicalPath = resolve(path);
  let targetPath: string;
  try {
    targetPath = await realpath(logicalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // A dangling settings link is not an absent configuration. Keep it intact.
      try {
        await lstat(logicalPath);
      } catch (missing) {
        if ((missing as NodeJS.ErrnoException).code === "ENOENT") {
          return { path, logicalPath, targetPath: logicalPath };
        }
        throw missing;
      }
    }
    throw error;
  }
  const file = { path, logicalPath, targetPath, ...await readTarget(targetPath) };
  await assertUnchanged(file);
  return file;
}

type StagedFile = { directory: string; path: string };

async function stageFile(parent: string, data: Buffer, metadata?: Stats): Promise<StagedFile> {
  const directory = await mkdtemp(join(parent, ".tokenjuice-settings-"));
  const path = join(directory, "write");
  try {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(data);
      if (metadata) {
        const staged = await handle.stat();
        if (staged.uid !== metadata.uid || staged.gid !== metadata.gid) {
          await handle.chown(metadata.uid, metadata.gid);
        }
        await handle.chmod(metadata.mode & 0o7777);
      }
    } finally {
      await handle.close();
    }
    return { directory, path };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function writeSettingsFile(
  original: SettingsFile,
  text: string,
  backup?: "replace" | "preserve",
): Promise<string | undefined> {
  let file = original;
  if (!file.metadata) {
    await mkdir(dirname(file.logicalPath), { recursive: true, mode: 0o700 });
    file = { ...file, targetPath: join(await realpath(dirname(file.logicalPath)), basename(file.logicalPath)) };
  }
  await assertUnchanged(file);
  const staged = await stageFile(dirname(file.targetPath), Buffer.from(text), file.metadata);
  let stagedBackup: StagedFile | undefined;
  try {
    let backupPath: string | undefined;
    if (backup && file.data) {
      const backupParent = await realpath(dirname(file.logicalPath));
      stagedBackup = await stageFile(backupParent, file.data, file.metadata);
      await assertUnchanged(file);
      if (await realpath(dirname(file.logicalPath)) !== backupParent) {
        throw changed(file);
      }
      for (let index = 0; ; index += 1) {
        const suffix = index === 0 ? ".bak" : `.bak.${index}`;
        const target = join(backupParent, `${basename(file.logicalPath)}${suffix}`);
        if (backup === "replace" && index === 0) {
          // A managed settings link may itself point through the usual backup.
          // Keep that chain intact and reserve a numbered backup instead.
          try {
            if (await realpath(target) === file.targetPath) {
              continue;
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
              throw error;
            }
          }
          await rename(stagedBackup.path, target);
        } else {
          try {
            await link(stagedBackup.path, target);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") {
              continue;
            }
            throw error;
          }
        }
        backupPath = `${file.path}${suffix}`;
        break;
      }
    }
    // Pin the resolved target instead of replacing the logical symlink. Recheck
    // edits and retargeting after staging; portable rename is not a cross-process CAS.
    await assertUnchanged(file);
    await rename(staged.path, file.targetPath);
    return backupPath;
  } finally {
    await rm(staged.directory, { recursive: true, force: true });
    if (stagedBackup) {
      await rm(stagedBackup.directory, { recursive: true, force: true });
    }
  }
}
