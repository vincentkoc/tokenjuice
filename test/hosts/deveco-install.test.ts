import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailableHookIntegrationNames } from "../../src/hosts/shared/hook-doctor.js";
import { main } from "../../src/cli/main.js";
import { doctorDevEcoExtension, installDevEcoExtension, uninstallDevEcoExtension } from "../../src/hosts/deveco/index.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "tokenjuice-deveco-"));
  vi.stubEnv("DEVECO_CONFIG_DIR", root);
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

describe("DevEco Code plugin lifecycle", () => {
  it("installs one self-contained plugin and leaves neighboring files intact", async () => {
    const neighbor = join(root, "plugins", "other.js");
    await mkdir(dirname(neighbor), { recursive: true });
    await writeFile(neighbor, "other plugin");
    const result = await installDevEcoExtension({ local: true });
    expect(result.extensionPath).toBe(join(root, "plugins", "tokenjuice.js"));
    expect(getAvailableHookIntegrationNames()).toContain("deveco");
    const source = await readFile(result.extensionPath, "utf8");
    expect(source).toContain("tokenjuice:deveco");
    expect(source).toContain("tool.execute.after");
    expect((await doctorDevEcoExtension({ local: true })).status).toBe("ok");
    expect((await installDevEcoExtension({ local: true })).backupPath).toBeUndefined();
    expect((await uninstallDevEcoExtension()).removed).toBe(true);
    expect(await readFile(neighbor, "utf8")).toBe("other plugin");
    const disabled = await doctorDevEcoExtension();
    expect(disabled.status).toBe("disabled");
    expect(disabled.missingPaths).toEqual([result.extensionPath]);
  });

  it("preserves foreign files and backs up refreshed owned source", async () => {
    const path = join(root, "plugins", "tokenjuice.js");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "foreign");
    await expect(installDevEcoExtension({ local: true })).rejects.toThrow("unowned DevEco Code plugin");
    expect((await uninstallDevEcoExtension()).removed).toBe(false);
    expect((await doctorDevEcoExtension()).status).toBe("broken");
    await writeFile(path, "// tokenjuice:deveco\nold owned source");
    expect((await doctorDevEcoExtension({ local: true })).status).toBe("warn");
    const refreshed = await installDevEcoExtension({ local: true });
    expect(await readFile(refreshed.backupPath!, "utf8")).toContain("old owned source");
  });

  it("registers JSON install, doctor and uninstall routes", async () => {
    const results = [];
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
      expect(await main([operation, "deveco", "--local", "--format", "json"])).toBe(0);
      spy.mockRestore();
      results.push(JSON.parse(output));
    }
    expect(results[0].extensionPath).toBe(join(root, "plugins", "tokenjuice.js"));
    expect(results[1].status).toBe("ok");
    expect(results[2].removed).toBe(true);
  });

  it.each(["file", "directory", "hardlink"])("rejects unsafe %s paths", async (kind) => {
    const path = join(root, "plugins", "tokenjuice.js");
    const target = join(root, "target");
    await writeFile(target, "preserved");
    await mkdir(dirname(path), { recursive: true });
    if (kind === "directory") {
      await rm(dirname(path), { recursive: true });
      await symlink(root, dirname(path), "dir");
    } else if (kind === "file") await symlink(target, path);
    else await link(target, path);
    await expect(installDevEcoExtension({ local: true })).rejects.toThrow("unsafe DevEco Code plugin path");
    await expect(uninstallDevEcoExtension()).rejects.toThrow("unsafe DevEco Code plugin path");
    expect((await doctorDevEcoExtension()).status).toBe("broken");
    expect(await readFile(target, "utf8")).toBe("preserved");
  });
});
