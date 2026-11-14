import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** Remove a task-owned fixture tree, including native hosts' read-only caches. */
export async function removeReadOnlyFixture(root) {
  async function makeDirectoriesWritable(path) {
    let handle;
    try {
      // Open first: a separate stat would race with replacement of this entry.
      handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    } catch (error) {
      if (error.code === "ENOTDIR" || error.code === "ELOOP") return;
      throw error;
    }
    try {
      await handle.chmod(0o700);
    } finally {
      await handle.close();
    }
    for (const entry of await readdir(path)) await makeDirectoriesWritable(join(path, entry));
  }
  await makeDirectoriesWritable(root);
  await rm(root, { recursive: true, force: true });
}

export function createProcessRunner({ cwd, env }) {
  return async function run(command, args, timeout = 90_000) {
    return await new Promise((resolveResult, reject) => {
      const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`timed out running ${command}\n${stderr}\n${stdout}`));
      }, timeout);
      child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(`${command} exited ${code}\n${stderr}\n${stdout}`));
        else resolveResult({ stdout, stderr });
      });
    });
  };
}
