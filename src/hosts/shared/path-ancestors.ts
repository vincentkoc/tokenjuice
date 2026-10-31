import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export async function realpathExistingAncestor(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
}

export async function findExistingAncestor(path: string): Promise<{ path: string; realPath: string }> {
  let current = path;
  while (true) {
    try {
      return { path: current, realPath: await realpath(current) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
}

export function isInsideOrEqual(parentDir: string, childPath: string): boolean {
  const relativePath = relative(parentDir, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export async function rejectSymlinkPathComponents(
  filePath: string,
  projectDir: string,
  errorMessage: string,
): Promise<void> {
  const relativePath = relative(projectDir, filePath);
  const segments = relativePath.split(sep).filter(Boolean);
  let currentPath = projectDir;
  for (const segment of segments.slice(0, -1)) {
    currentPath = join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new Error(errorMessage);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

export function createSymlinkGuard<Args extends unknown[] = []>(
  errorMessage: (filePath: string, ...args: Args) => string,
) {
  return async (filePath: string, ...args: Args): Promise<void> => {
    try {
      const stats = await lstat(filePath);
      if (stats.isSymbolicLink()) {
        throw new Error(errorMessage(filePath, ...args));
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  };
}

export function createProjectInstructionPathResolver(
  label: string,
  rejectSymlink: (filePath: string) => Promise<void>,
) {
  return async (filePath: string, projectDir: string, realProjectDir = projectDir): Promise<string> => {
    const resolvedPath = resolve(filePath);
    if (projectDir !== realProjectDir) {
      throw new Error(`cannot use ${label} ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`);
    }
    const realParentDir = await realpathExistingAncestor(dirname(resolvedPath));
    if (!isInsideOrEqual(realProjectDir, realParentDir)) {
      throw new Error(
        `cannot use ${label} ${resolvedPath}; tokenjuice will not write through instruction directories outside ${realProjectDir}`,
      );
    }

    await rejectSymlink(projectDir);
    await rejectSymlinkPathComponents(
      resolvedPath,
      projectDir,
      `cannot use ${label} ${resolvedPath}; tokenjuice will not read or write through instruction symlinks`,
    );
    await rejectSymlink(resolvedPath);
    return resolvedPath;
  };
}
