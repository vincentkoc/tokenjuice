import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAvanteInstructions,
  installAvanteInstructions,
  uninstallAvanteInstructions,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.AVANTE_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.AVANTE_PROJECT_DIR;
  } else {
    process.env.AVANTE_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-avante-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("avante instructions", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:begin -->/gu)?.length ?? 0;
  }

  it("installs a marker-delimited instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "avante.md");

    const result = await installAvanteInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).not.toContain("wrap --full");
  });

  it("preserves existing instructions and backs them up", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "avante.md");
    await installAvanteInstructions(instructionsPath);
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installAvanteInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:begin -->");
  });

  it("replaces stale tokenjuice instructions without duplicating the block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "avante.md");
    await writeFile(
      instructionsPath,
      [
        "# project instructions",
        "",
        "- keep this",
        "",
        "<!-- tokenjuice:begin -->",
        "stale tokenjuice block",
        "<!-- tokenjuice:end -->",
        "",
        "<!-- tokenjuice:begin -->",
        "another stale tokenjuice block",
        "<!-- tokenjuice:end -->",
      ].join("\n"),
      "utf8",
    );

    await installAvanteInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "avante.md");

    await installAvanteInstructions(instructionsPath);
    const installed = await doctorAvanteInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallAvanteInstructions(instructionsPath);
    const disabled = await doctorAvanteInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "avante.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorAvanteInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
  });

  it("leaves unrelated instructions untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "avante.md");
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const removed = await uninstallAvanteInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(instructions).toBe("# project instructions\n\n- keep this\n");
  });

  it("uses AVANTE_PROJECT_DIR for the default instructions file", async () => {
    const home = await createTempDir();
    process.env.AVANTE_PROJECT_DIR = home;

    const installed = await installAvanteInstructions();
    const expectedInstructionsPath = join(home, "avante.md");
    const doctor = await doctorAvanteInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default instructions file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.AVANTE_PROJECT_DIR = home;
    const instructionsPath = join(home, "avante.md");

    await installAvanteInstructions();
    await uninstallAvanteInstructions(instructionsPath);

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
