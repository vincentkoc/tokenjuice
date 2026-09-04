import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inspectTokenjuiceHookCommand } from "../../../src/hosts/shared/hook-command-doctor.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-hook-command-doctor-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("inspectTokenjuiceHookCommand", () => {
  it("reports runtime and Homebrew package-version drift without executing the hook", async () => {
    const home = await createTempDir();
    const configuredNodePath = join(home, "old", "bin", "node");
    const expectedNodePath = join(home, "current", "bin", "node");
    const binDir = join(home, "opt", "homebrew", "bin");
    const cellarDir = join(home, "opt", "homebrew", "Cellar", "tokenjuice", "0.7.0", "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const resolvedLauncherPath = join(cellarDir, "tokenjuice");

    await mkdir(binDir, { recursive: true });
    await mkdir(cellarDir, { recursive: true });
    await mkdir(join(home, "old", "bin"), { recursive: true });
    await mkdir(join(home, "current", "bin"), { recursive: true });
    await writeFile(configuredNodePath, "#!/usr/bin/env bash\nexit 91\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(expectedNodePath, "#!/usr/bin/env bash\nexit 92\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(resolvedLauncherPath, "#!/usr/bin/env bash\nexit 93\n", { encoding: "utf8", mode: 0o755 });
    await symlink(resolvedLauncherPath, launcherPath);

    const report = await inspectTokenjuiceHookCommand({
      command: `${configuredNodePath} ${launcherPath} codex-post-tool-use`,
      expectedNodePath,
      expectedPackageVersion: "0.8.1",
    });

    expect(report.missingPaths).toEqual([]);
    expect(report.nonExecutablePaths).toEqual([]);
    expect(report.runtimeMismatch).toEqual({
      configuredPath: configuredNodePath,
      expectedPath: expectedNodePath,
    });
    expect(report.packageVersionMismatch).toEqual({
      launcherPath,
      resolvedPath: await realpath(resolvedLauncherPath),
      resolvedVersion: "0.7.0",
      expectedVersion: "0.8.1",
    });
  });

  it("distinguishes missing paths from present non-executable launchers", async () => {
    const home = await createTempDir();
    const launcherPath = join(home, "tokenjuice");
    const missingNodePath = join(home, "node");
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o644 });

    const report = await inspectTokenjuiceHookCommand({
      command: `${missingNodePath} ${launcherPath} codex-post-tool-use`,
      expectedNodePath: missingNodePath,
    });

    expect(report.missingPaths).toEqual([missingNodePath]);
    expect(report.nonExecutablePaths).toEqual([launcherPath]);
  });

  it("does not require execute permission for a Node-invoked JavaScript launcher", async () => {
    const home = await createTempDir();
    const nodePath = join(home, "bin", "node");
    const launcherPath = join(home, "bin", "tokenjuice");
    const scriptPath = join(home, "lib", "tokenjuice", "dist", "cli", "main.js");

    await mkdir(join(home, "bin"), { recursive: true });
    await mkdir(join(home, "lib", "tokenjuice", "dist", "cli"), { recursive: true });
    await writeFile(nodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(scriptPath, "console.log('tokenjuice');\n", { encoding: "utf8", mode: 0o644 });
    await symlink(scriptPath, launcherPath);

    const report = await inspectTokenjuiceHookCommand({
      command: `${nodePath} ${launcherPath} codex-post-tool-use`,
      expectedNodePath: nodePath,
    });

    expect(report.missingPaths).toEqual([]);
    expect(report.nonExecutablePaths).toEqual([]);
  });
});
