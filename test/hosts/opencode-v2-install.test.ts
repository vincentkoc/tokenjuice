import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli/main.js";
import { doctorOpenCodeV2Extension, installOpenCodeV2Extension, uninstallOpenCodeV2Extension } from "../../src/hosts/opencode/v2/index.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "tokenjuice-opencode-v2-"));
  vi.stubEnv("OPENCODE_CONFIG_DIR", root);
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

describe("OpenCode V2 plugin lifecycle", () => {
  it("installs a self-contained directory entrypoint, preserves V1 and uninstalls only its file", async () => {
    const v1 = join(root, "plugins", "tokenjuice.js");
    await mkdir(dirname(v1), { recursive: true });
    await writeFile(v1, "V1 preserved");
    const result = await installOpenCodeV2Extension({ local: true });
    expect(result.extensionPath).toBe(join(root, "plugins", "tokenjuice-v2", "index.js"));
    expect(await readFile(result.extensionPath, "utf8")).toContain("tokenjuice:opencode-v2");
    expect((await doctorOpenCodeV2Extension({ local: true })).status).toBe("ok");
    expect((await installOpenCodeV2Extension({ local: true })).backupPath).toBeUndefined();
    await writeFile(join(dirname(result.extensionPath), "notes.txt"), "preserved");
    expect((await uninstallOpenCodeV2Extension()).removed).toBe(true);
    expect(await readFile(v1, "utf8")).toBe("V1 preserved");
    expect(await readFile(join(dirname(result.extensionPath), "notes.txt"), "utf8")).toBe("preserved");
    expect((await doctorOpenCodeV2Extension()).status).toBe("disabled");
  });

  it("preserves foreign files and backs up refreshed owned source", async () => {
    const path = join(root, "plugins", "tokenjuice-v2", "index.js");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "foreign");
    await expect(installOpenCodeV2Extension({ local: true })).rejects.toThrow("unowned OpenCode V2 plugin");
    expect((await uninstallOpenCodeV2Extension()).removed).toBe(false);
    expect((await doctorOpenCodeV2Extension()).status).toBe("broken");
    await writeFile(path, "// tokenjuice:opencode-v2\nold owned source");
    expect((await doctorOpenCodeV2Extension({ local: true })).status).toBe("warn");
    const refreshed = await installOpenCodeV2Extension({ local: true });
    expect(await readFile(refreshed.backupPath!, "utf8")).toContain("old owned source");
  });

  it("registers JSON install, doctor and uninstall routes", async () => {
    const results = [];
    for (const operation of ["install", "doctor", "uninstall"]) {
      let output = "";
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
      expect(await main([operation, "opencode-v2", "--local", "--format", "json"])).toBe(0);
      spy.mockRestore();
      results.push(JSON.parse(output));
    }
    expect(results[0].extensionPath).toBe(join(root, "plugins", "tokenjuice-v2", "index.js"));
    expect(results[1].status).toBe("ok");
    expect(results[2].removed).toBe(true);
  });

  it.each(["file", "directory", "hardlink"])("rejects unsafe %s paths", async (kind) => {
    const path = join(root, "plugins", "tokenjuice-v2", "index.js");
    const target = join(root, "target");
    await writeFile(target, "preserved");
    await mkdir(dirname(path), { recursive: true });
    if (kind === "directory") {
      await rm(dirname(path), { recursive: true });
      await symlink(root, dirname(path), "dir");
    } else if (kind === "file") await symlink(target, path);
    else await link(target, path);
    await expect(installOpenCodeV2Extension({ local: true })).rejects.toThrow("unsafe OpenCode V2 plugin path");
    await expect(uninstallOpenCodeV2Extension()).rejects.toThrow("unsafe OpenCode V2 plugin path");
    expect((await doctorOpenCodeV2Extension()).status).toBe("broken");
    expect(await readFile(target, "utf8")).toBe("preserved");
  });
});
