import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorOpenWebUITool,
  installOpenWebUITool,
  uninstallOpenWebUITool,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.OPENWEBUI_PROJECT_DIR;
const hasPython3 = spawnSync("python3", ["--version"], { stdio: "ignore" }).status === 0;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.OPENWEBUI_PROJECT_DIR;
  } else {
    process.env.OPENWEBUI_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-openwebui-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("openwebui tool", () => {
  it("installs a Workspace Tool source that compacts provided output without shell execution", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");

    const result = await installOpenWebUITool(toolPath);
    const tool = await readFile(toolPath, "utf8");

    expect(result.toolPath).toBe(toolPath);
    expect(result.backupPath).toBeUndefined();
    expect(tool).toContain("tokenjuice compact terminal output");
    expect(tool).toContain("class Tools:");
    expect(tool).toContain("compact_terminal_output");
    expect(tool).toContain("[tokenjuice_bin, \"reduce-json\"]");
    expect(tool).toContain("The command string is metadata only; it is never executed by this tool.");
    expect(tool).not.toContain("shell=True");
    expect(tool).not.toContain("tokenjuice wrap -- <command>");
  });

  it.skipIf(!hasPython3)("writes Python source that parses", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");
    await installOpenWebUITool(toolPath);

    const compiled = spawnSync("python3", ["-m", "py_compile", toolPath], { encoding: "utf8" });

    expect(compiled.status, compiled.stderr || compiled.stdout).toBe(0);
  });

  it("backs up an existing tool source before replacing it", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");
    await installOpenWebUITool(toolPath);
    await writeFile(toolPath, "custom local tool\n", "utf8");

    const result = await installOpenWebUITool(toolPath);

    expect(result.backupPath).toBe(`${toolPath}.bak`);
    await expect(readFile(`${toolPath}.bak`, "utf8")).resolves.toBe("custom local tool\n");
    await expect(readFile(toolPath, "utf8")).resolves.toContain("reduce-json");
  });

  it("reports installed and uninstalled tool health", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");

    await installOpenWebUITool(toolPath);
    const installed = await doctorOpenWebUITool(toolPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("Workspace Tool source file");

    const removed = await uninstallOpenWebUITool(toolPath);
    const disabled = await doctorOpenWebUITool(toolPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken tool sources when required tokenjuice wiring is stale or unsafe", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");
    await mkdir(join(home, ".openwebui", "tools"), { recursive: true });
    await writeFile(
      toolPath,
      [
        "tokenjuice compact terminal output",
        "class Tools:",
        "    async def compact_terminal_output(self, command: str, output: str) -> str:",
        "        subprocess.run(command, shell=True)",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOpenWebUITool(toolPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Open WebUI tool source is missing tokenjuice reduce-json wiring");
    expect(doctor.issues).toContain("configured Open WebUI tool source enables shell=True");
  });

  it("removes an existing tool source without requiring tokenjuice content", async () => {
    const home = await createTempDir();
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");
    await mkdir(join(home, ".openwebui", "tools"), { recursive: true });
    await writeFile(toolPath, "custom local tool\n", "utf8");

    const removed = await uninstallOpenWebUITool(toolPath);

    expect(removed.removed).toBe(true);
    await expect(access(toolPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses OPENWEBUI_PROJECT_DIR for the default tool source", async () => {
    const home = await createTempDir();
    process.env.OPENWEBUI_PROJECT_DIR = home;

    const installed = await installOpenWebUITool();
    const expectedToolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");
    const doctor = await doctorOpenWebUITool();

    expect(installed.toolPath).toBe(expectedToolPath);
    expect(doctor.toolPath).toBe(expectedToolPath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default tool source file", async () => {
    const home = await createTempDir();
    process.env.OPENWEBUI_PROJECT_DIR = home;
    const toolPath = join(home, ".openwebui", "tools", "tokenjuice_compact.py");

    await installOpenWebUITool();
    await uninstallOpenWebUITool(toolPath);

    await expect(access(toolPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
