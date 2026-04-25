import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorZedInstructions,
  installZedInstructions,
  uninstallZedInstructions,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.ZED_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.ZED_PROJECT_DIR;
  } else {
    process.env.ZED_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-zed-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("zed rules", () => {
  it("installs a marker-delimited rule block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".rules");

    const result = await installZedInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).not.toContain("wrap --full");
  });

  it("preserves existing rules and backs them up", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".rules");
    await installZedInstructions(instructionsPath);
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installZedInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:begin -->");
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".rules");

    await installZedInstructions(instructionsPath);
    const installed = await doctorZedInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallZedInstructions(instructionsPath);
    const disabled = await doctorZedInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("uses ZED_PROJECT_DIR for the default rules file", async () => {
    const home = await createTempDir();
    process.env.ZED_PROJECT_DIR = home;

    const installed = await installZedInstructions();
    const expectedInstructionsPath = join(home, ".rules");
    const doctor = await doctorZedInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default rules file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.ZED_PROJECT_DIR = home;
    const instructionsPath = join(home, ".rules");

    await installZedInstructions();
    await uninstallZedInstructions(instructionsPath);

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
