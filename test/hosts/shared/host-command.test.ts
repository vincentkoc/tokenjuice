import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildTokenjuiceHookCommand,
  parseTokenjuiceHookCommand,
} from "../../../src/hosts/shared/host-command.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = originalPath;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-host-command-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("buildTokenjuiceHookCommand", () => {
  it("pins Node for hosts that require a JavaScript launcher runtime", async () => {
    const home = await createTempDir();
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const installedCliPath = join(home, "lib", "tokenjuice", "dist", "cli", "main.js");
    const nodePath = join(home, "node");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await mkdir(dirname(installedCliPath), { recursive: true });
    await writeFile(installedCliPath, "#!/usr/bin/env node\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(nodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await symlink(installedCliPath, launcherPath);

    await expect(
      buildTokenjuiceHookCommand("codex-post-tool-use", "codex", {
        nodePath,
        pinNodeForJavaScriptLauncher: true,
      }),
    ).resolves.toBe(`${nodePath} ${launcherPath} codex-post-tool-use`);
  });
});

describe("parseTokenjuiceHookCommand", () => {
  it("separates the runtime, stable launcher, and subcommand", () => {
    expect(
      parseTokenjuiceHookCommand(
        "/opt/node/bin/node /usr/local/bin/tokenjuice codex-post-tool-use",
      ),
    ).toEqual({
      argv: [
        "/opt/node/bin/node",
        "/usr/local/bin/tokenjuice",
        "codex-post-tool-use",
      ],
      checkedPaths: [
        "/opt/node/bin/node",
        "/usr/local/bin/tokenjuice",
      ],
      runtimePath: "/opt/node/bin/node",
      launcherPath: "/usr/local/bin/tokenjuice",
      subcommand: "codex-post-tool-use",
    });
  });
});
