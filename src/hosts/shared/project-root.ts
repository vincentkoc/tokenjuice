import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

export async function findGitRoot(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    if (await hasGitMetadata(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function createProjectDirResolver(environmentKey: string) {
  return async (options: { projectDir?: string } = {}): Promise<string> => {
    const explicitProjectDir = options.projectDir || process.env[environmentKey];
    if (explicitProjectDir) {
      return resolve(explicitProjectDir);
    }

    return (await findGitRoot(process.cwd())) ?? process.cwd();
  };
}
