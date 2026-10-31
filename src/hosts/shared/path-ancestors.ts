import { realpath } from "node:fs/promises";
import { dirname } from "node:path";

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
