import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorJunieInstructions,
  installJunieInstructions,
  uninstallJunieInstructions,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.JUNIE_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.JUNIE_PROJECT_DIR;
  } else {
    process.env.JUNIE_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-junie-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("junie instructions", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:begin -->/gu)?.length ?? 0;
  }

  it("installs a marker-delimited instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".junie", "AGENTS.md");

    const result = await installJunieInstructions(instructionsPath);
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
    const instructionsPath = join(home, ".junie", "AGENTS.md");
    await installJunieInstructions(instructionsPath);
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installJunieInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:begin -->");
  });

  it("replaces stale tokenjuice instructions without duplicating the block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".junie", "AGENTS.md");
    await mkdir(join(home, ".junie"), { recursive: true });
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

    await installJunieInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".junie", "AGENTS.md");

    await installJunieInstructions(instructionsPath);
    const installed = await doctorJunieInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallJunieInstructions(instructionsPath);
    const disabled = await doctorJunieInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".junie", "AGENTS.md");
    await mkdir(join(home, ".junie"), { recursive: true });
    await writeFile(instructionsPath, "<!-- tokenjuice:begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorJunieInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
  });

  it("leaves unrelated instructions untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".junie", "AGENTS.md");
    await mkdir(join(home, ".junie"), { recursive: true });
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const removed = await uninstallJunieInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(instructions).toBe("# project instructions\n\n- keep this\n");
  });

  it("uses JUNIE_PROJECT_DIR for the default instructions file", async () => {
    const home = await createTempDir();
    process.env.JUNIE_PROJECT_DIR = home;

    const installed = await installJunieInstructions();
    const expectedInstructionsPath = join(home, ".junie", "AGENTS.md");
    const doctor = await doctorJunieInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default instructions file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.JUNIE_PROJECT_DIR = home;
    const instructionsPath = join(home, ".junie", "AGENTS.md");

    await installJunieInstructions();
    await uninstallJunieInstructions(instructionsPath);

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
