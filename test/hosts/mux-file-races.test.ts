import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { installMuxHook, uninstallMuxHook } from "../../src/hosts/mux/index.js";

const race = vi.hoisted(() => ({ afterRead: undefined as ((path: string) => Promise<void>) | undefined }));

vi.mock("../../src/hosts/shared/settings-file.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/hosts/shared/settings-file.js")>();
  return {
    ...actual,
    readSettingsFile: async (path: string) => {
      const file = await actual.readSettingsFile(path);
      await race.afterRead?.(path);
      return file;
    },
  };
});

const directories: string[] = [];
const envKeys = ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "CURSOR_HOME", "PI_CODING_AGENT_DIR", "OPENCODE_CONFIG_DIR", "TOKENJUICE_CURSOR_SHELL", "SHELL", "HOME", "PATH", "MUX_PROJECT_DIR"] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tokenjuice-mux-race-"));
  directories.push(directory);
  const path = join(directory, ".mux", "tool_post");
  await mkdir(dirname(path));
  return path;
}

afterEach(async () => {
  race.afterRead = undefined;
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Mux hook snapshot updates", () => {
  it("preserves an edit made after the installer reads its snapshot", async () => {
    const path = await fixture();
    await writeFile(path, "#!/usr/bin/env bash\necho original\n");
    race.afterRead = async () => { await writeFile(path, "#!/usr/bin/env bash\necho concurrent\n"); };

    await expect(installMuxHook(path, { binaryPath: process.execPath })).rejects.toThrow("settings changed");
    expect(await readFile(path, "utf8")).toContain("echo concurrent");
    expect(await readdir(dirname(path))).toEqual(["tool_post"]);
  });

  it.each([false, true])("preserves concurrent edits during uninstall, custom hook: %s", async (custom) => {
    const path = await fixture();
    if (custom) {
      await writeFile(path, "#!/usr/bin/env bash\necho custom\n");
    }
    await installMuxHook(path, { binaryPath: process.execPath });
    race.afterRead = async () => { await writeFile(path, "#!/usr/bin/env bash\necho concurrent\n"); };

    await expect(uninstallMuxHook(path)).rejects.toThrow("settings changed");
    expect(await readFile(path, "utf8")).toContain("echo concurrent");
  });

  it.skipIf(process.platform === "win32")("refuses a hook replaced by a symlink after reading", async () => {
    const path = await fixture();
    const target = join(dirname(path), "other-script");
    await writeFile(path, "#!/usr/bin/env bash\necho original\n");
    await writeFile(target, "private target\n");
    race.afterRead = async () => { await rm(path); await symlink(target, path); };

    await expect(installMuxHook(path, { binaryPath: process.execPath })).rejects.toThrow("symlinked file");
    expect(await readFile(target, "utf8")).toBe("private target\n");
    expect((await readdir(dirname(path))).sort()).toEqual(["other-script", "tool_post"]);
  });
});
