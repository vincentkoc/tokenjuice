import { lstat, mkdir, mkdtemp, readFile, readlink, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { installClaudeCodeHook, uninstallClaudeCodeHook } from "../../src/hosts/claude-code/index.js";
import { installCodeBuddyHook, uninstallCodeBuddyHook } from "../../src/hosts/codebuddy/index.js";
import { installDroidHook, uninstallDroidHook } from "../../src/hosts/droid/index.js";

const directories: string[] = [];
const hosts = [
  { name: "Claude Code", install: installClaudeCodeHook, uninstall: uninstallClaudeCodeHook, marker: "claude-code-pre-tool-use" },
  { name: "CodeBuddy", install: installCodeBuddyHook, uninstall: uninstallCodeBuddyHook, marker: "codebuddy-pre-tool-use" },
  { name: "Droid", install: installDroidHook, uninstall: uninstallDroidHook, marker: "droid-post-tool-use" },
];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tokenjuice-settings-links-"));
  directories.push(directory);
  return directory;
}

describe.skipIf(process.platform === "win32")("symlinked host settings", () => {
  for (const host of hosts) {
    for (const kind of ["relative", "absolute"] as const) {
      it(`${host.name} preserves a ${kind} settings link through install and uninstall`, async () => {
        const directory = await fixture();
        const home = join(directory, "host");
        const managed = join(directory, "managed");
        await mkdir(home);
        await mkdir(managed);
        const settingsPath = join(home, "settings.json");
        const targetPath = join(managed, "settings.json");
        const baseline = { env: { EXAMPLE: "preserved" }, hooks: { SessionStart: [{ hooks: [{ command: "other-hook" }] }] } };
        await writeFile(targetPath, JSON.stringify(baseline), { mode: 0o640 });
        const before = await stat(targetPath);
        const linkTarget = kind === "relative" ? relative(home, targetPath) : targetPath;
        await symlink(linkTarget, settingsPath);
        const originalLink = await lstat(settingsPath);
        const options = { local: true, binaryPath: join(directory, "tokenjuice") };

        const installed = await host.install(settingsPath, options);
        expect(installed.backupPath).toBe(`${settingsPath}.bak`);
        expect(JSON.parse(await readFile(`${settingsPath}.bak`, "utf8"))).toEqual(baseline);
        expect((await stat(`${settingsPath}.bak`)).mode & 0o777).toBe(before.mode & 0o777);
        expect(await readFile(targetPath, "utf8")).toContain(host.marker);
        expect(await readFile(settingsPath, "utf8")).toBe(await readFile(targetPath, "utf8"));
        await host.install(settingsPath, options);
        expect((await readFile(targetPath, "utf8")).match(new RegExp(host.marker, "g"))).toHaveLength(1);
        await host.uninstall(settingsPath);

        expect(await readlink(settingsPath)).toBe(linkTarget);
        expect((await lstat(settingsPath)).ino).toBe(originalLink.ino);
        expect(JSON.parse(await readFile(targetPath, "utf8"))).toEqual(baseline);
        const after = await stat(targetPath);
        expect([after.mode & 0o777, after.uid, after.gid]).toEqual([before.mode & 0o777, before.uid, before.gid]);
        const names = await readdir(home);
        await host.uninstall(settingsPath);
        expect((await stat(targetPath)).ino).toBe(after.ino);
        expect(await readdir(home)).toEqual(names);
        expect(await readdir(managed)).toEqual(["settings.json"]);
      });
    }

    it(`${host.name} leaves a dangling settings link unchanged`, async () => {
      const directory = await fixture();
      const settingsPath = join(directory, "settings.json");
      await symlink("missing.json", settingsPath);
      await expect(host.install(settingsPath, { local: true, binaryPath: join(directory, "tokenjuice") })).rejects.toThrow("ENOENT");
      expect(await readlink(settingsPath)).toBe("missing.json");
      expect(await readdir(directory)).toEqual(["settings.json"]);
    });
  }
});
