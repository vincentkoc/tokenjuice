import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorRooInstructions,
  installRooInstructions,
  uninstallRooInstructions,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.ROO_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.ROO_PROJECT_DIR;
  } else {
    process.env.ROO_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-roo-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("roo rules", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:begin -->/gu)?.length ?? 0;
  }

  it("installs a marker-delimited workspace rule", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".roo", "rules", "tokenjuice.md");

    const result = await installRooInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("Roo `execute_command`");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).not.toContain("wrap --full");
  });

  it("preserves existing rules and backs them up", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".roo", "rules", "tokenjuice.md");
    await installRooInstructions(instructionsPath);
    await writeFile(instructionsPath, "# local Roo rule\n\n- keep this\n", "utf8");

    const result = await installRooInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:begin -->");
  });

  it("replaces stale tokenjuice blocks without duplicating them", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".roo", "rules", "tokenjuice.md");
    await mkdir(join(home, ".roo", "rules"), { recursive: true });
    await writeFile(
      instructionsPath,
      [
        "# project rules",
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

    await installRooInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".roo", "rules", "tokenjuice.md");

    await installRooInstructions(instructionsPath);
    const installed = await doctorRooInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallRooInstructions(instructionsPath);
    const disabled = await doctorRooInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".roo", "rules", "tokenjuice.md");
    await mkdir(join(home, ".roo", "rules"), { recursive: true });
    await writeFile(instructionsPath, "<!-- tokenjuice:begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorRooInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
  });

  it("reports stale tokenjuice guidance inside balanced rules blocks", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".roo", "rules", "tokenjuice.md");
    await mkdir(join(home, ".roo", "rules"), { recursive: true });
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:begin -->",
        "# tokenjuice terminal output compaction",
        "",
        "- For Roo commands, use `tokenjuice wrap --full -- <command>`.",
        "<!-- tokenjuice:end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorRooInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Roo Code rules are missing tokenjuice wrap guidance");
    expect(doctor.issues).toContain("configured Roo Code rules are missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Roo Code rules still suggest the full escape hatch");
  });

  it("uses ROO_PROJECT_DIR for the default rule file", async () => {
    const home = await createTempDir();
    process.env.ROO_PROJECT_DIR = home;

    const installed = await installRooInstructions();
    const expectedInstructionsPath = join(home, ".roo", "rules", "tokenjuice.md");
    const doctor = await doctorRooInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default rule file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.ROO_PROJECT_DIR = home;
    const instructionsPath = join(home, ".roo", "rules", "tokenjuice.md");

    await installRooInstructions();
    await uninstallRooInstructions(instructionsPath);

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
