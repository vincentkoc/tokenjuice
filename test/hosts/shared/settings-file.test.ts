import { lstat, mkdir, mkdtemp, readFile, readlink, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readSettingsFile, writeSettingsFile } from "../../../src/hosts/shared/settings-file.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tokenjuice-settings-file-"));
  directories.push(directory);
  return directory;
}

describe("settings snapshots", () => {
  it("creates absent settings privately without using a pre-existing .tmp sidecar", async () => {
    const directory = await fixture();
    const settingsPath = join(directory, "nested", "settings.json");
    const file = await readSettingsFile(settingsPath);
    await mkdir(join(directory, "nested"));
    await writeFile(`${settingsPath}.tmp`, "unrelated stage");
    expect(await writeSettingsFile(file, "{}\n", "replace")).toBeUndefined();
    expect(await readFile(`${settingsPath}.tmp`, "utf8")).toBe("unrelated stage");
    expect((await stat(settingsPath)).mode & 0o777).toBe(process.platform === "win32" ? 0o666 : 0o600);
    expect((await readdir(join(directory, "nested"))).sort()).toEqual(["settings.json", "settings.json.tmp"]);
  });

  it("refuses to overwrite settings edited after they were read", async () => {
    const directory = await fixture();
    const settingsPath = join(directory, "settings.json");
    await writeFile(settingsPath, "{}\n");
    const file = await readSettingsFile(settingsPath);
    await writeFile(settingsPath, '{"operator":true}\n');
    await expect(writeSettingsFile(file, '{"hook":true}\n', "replace")).rejects.toThrow("settings changed");
    expect(await readFile(settingsPath, "utf8")).toBe('{"operator":true}\n');
    expect(await readdir(directory)).toEqual(["settings.json"]);
  });

  it("rejects a stale snapshot after another update publishes", async () => {
    const directory = await fixture();
    const settingsPath = join(directory, "settings.json");
    await writeFile(settingsPath, "{}\n");
    const first = await readSettingsFile(settingsPath);
    const second = await readSettingsFile(settingsPath);
    await writeSettingsFile(first, '{"first":true}\n');
    await expect(writeSettingsFile(second, '{"second":true}\n')).rejects.toThrow("settings changed");
    expect(await readFile(settingsPath, "utf8")).toBe('{"first":true}\n');
  });

  it.skipIf(process.platform === "win32")("refuses a retargeted settings link without modifying either target", async () => {
    const directory = await fixture();
    const settingsPath = join(directory, "settings.json");
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    await writeFile(first, "{}\n");
    await writeFile(second, "{}\n");
    await symlink("first.json", settingsPath);
    const file = await readSettingsFile(settingsPath);
    await rm(settingsPath);
    await symlink("second.json", settingsPath);
    await expect(writeSettingsFile(file, '{"hook":true}\n')).rejects.toThrow("settings changed");
    expect(await readlink(settingsPath)).toBe("second.json");
    expect(await readFile(first, "utf8")).toBe("{}\n");
    expect(await readFile(second, "utf8")).toBe("{}\n");
  });

  it.skipIf(process.platform === "win32").each(["direct", "intermediate"])("keeps the %s backup path in the settings symlink chain", async (kind) => {
    const directory = await fixture();
    const settingsPath = join(directory, "settings.json");
    const backupPath = `${settingsPath}.bak`;
    const targetPath = kind === "direct" ? backupPath : join(directory, "managed.json");
    await writeFile(targetPath, "{}\n");
    if (kind === "intermediate") {
      await symlink("managed.json", backupPath);
    }
    await symlink("settings.json.bak", settingsPath);
    const file = await readSettingsFile(settingsPath);
    expect(await writeSettingsFile(file, '{"hook":true}\n', "replace")).toBe(`${backupPath}.1`);
    expect(await readlink(settingsPath)).toBe("settings.json.bak");
    expect((await lstat(backupPath)).isSymbolicLink()).toBe(kind === "intermediate");
    expect(await readFile(targetPath, "utf8")).toBe('{"hook":true}\n');
    expect(await readFile(`${backupPath}.1`, "utf8")).toBe("{}\n");
    const next = await readSettingsFile(settingsPath);
    expect(await writeSettingsFile(next, "{}\n", "replace")).toBe(`${backupPath}.2`);
    expect(await readFile(`${backupPath}.1`, "utf8")).toBe("{}\n");
    expect(await readFile(`${backupPath}.2`, "utf8")).toBe('{"hook":true}\n');
  });

  it.skipIf(process.platform === "win32")("does not follow backup symlinks when replacing or preserving backups", async () => {
    const directory = await fixture();
    const settingsPath = join(directory, "settings.json");
    const unrelated = join(directory, "unrelated");
    await writeFile(settingsPath, "{}\n", { mode: 0o600 });
    await writeFile(unrelated, "keep");
    await symlink("unrelated", `${settingsPath}.bak`);
    const first = await readSettingsFile(settingsPath);
    expect(await writeSettingsFile(first, '{"hook":true}\n', "preserve")).toBe(`${settingsPath}.bak.1`);
    expect((await lstat(`${settingsPath}.bak`)).isSymbolicLink()).toBe(true);
    const second = await readSettingsFile(settingsPath);
    await writeSettingsFile(second, "{}\n", "replace");
    expect((await lstat(`${settingsPath}.bak`)).isSymbolicLink()).toBe(false);
    expect(await readFile(unrelated, "utf8")).toBe("keep");
    expect(await readFile(`${settingsPath}.bak.1`, "utf8")).toBe("{}\n");
  });
});
