import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorKiroSteering, installKiroSteering, uninstallKiroSteering } from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.KIRO_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.KIRO_PROJECT_DIR;
  } else {
    process.env.KIRO_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-kiro-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("kiro steering", () => {
  it("installs an always-included steering file", async () => {
    const home = await createTempDir();
    const steeringPath = join(home, ".kiro", "steering", "tokenjuice.md");

    const result = await installKiroSteering(steeringPath);
    const steering = await readFile(steeringPath, "utf8");

    expect(result.steeringPath).toBe(steeringPath);
    expect(result.backupPath).toBeUndefined();
    expect(steering).toContain("inclusion: always");
    expect(steering).toContain("tokenjuice terminal output compaction");
    expect(steering).toContain("terminal commands through Kiro");
    expect(steering).toContain("tokenjuice wrap -- <command>");
    expect(steering).toContain("tokenjuice wrap --raw -- <command>");
    expect(steering).not.toContain("wrap --full");
  });

  it("backs up an existing steering file before replacing it", async () => {
    const home = await createTempDir();
    const steeringPath = join(home, ".kiro", "steering", "tokenjuice.md");
    await installKiroSteering(steeringPath);
    await writeFile(steeringPath, "# local Kiro steering\n\n- keep this\n", "utf8");

    const result = await installKiroSteering(steeringPath);
    const steering = await readFile(steeringPath, "utf8");

    expect(result.backupPath).toBe(`${steeringPath}.bak`);
    await expect(readFile(`${steeringPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(steering).toContain("tokenjuice terminal output compaction");
    expect(steering).not.toContain("keep this");
  });

  it("reports installed and uninstalled steering health", async () => {
    const home = await createTempDir();
    const steeringPath = join(home, ".kiro", "steering", "tokenjuice.md");

    await installKiroSteering(steeringPath);
    const installed = await doctorKiroSteering(steeringPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("steering-based");

    const removed = await uninstallKiroSteering(steeringPath);
    const disabled = await doctorKiroSteering(steeringPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken steering missing always-included front matter", async () => {
    const home = await createTempDir();
    const steeringPath = join(home, ".kiro", "steering", "tokenjuice.md");
    await installKiroSteering(steeringPath);
    await writeFile(steeringPath, "# tokenjuice terminal output compaction\n\n- tokenjuice wrap -- <command>\n", "utf8");

    const doctor = await doctorKiroSteering(steeringPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Kiro steering file is missing always-included front matter");
  });

  it("reports markerless user-owned steering files as disabled", async () => {
    const home = await createTempDir();
    const steeringPath = join(home, ".kiro", "steering", "tokenjuice.md");
    await mkdir(join(home, ".kiro", "steering"), { recursive: true });
    await writeFile(steeringPath, "# user Kiro steering\n", "utf8");

    const doctor = await doctorKiroSteering(undefined, { projectDir: home });

    expect(doctor.status).toBe("disabled");
  });

  it("reports broken steering with inclusion text outside frontmatter", async () => {
    const home = await createTempDir();
    const steeringPath = join(home, ".kiro", "steering", "tokenjuice.md");
    await installKiroSteering(steeringPath);
    await writeFile(
      steeringPath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "inclusion: always",
        "",
        "- tokenjuice wrap -- <command>",
        "- tokenjuice wrap --raw -- <command>",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorKiroSteering(steeringPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Kiro steering file is missing always-included front matter");
  });

  it("accepts CRLF always-included frontmatter", async () => {
    const home = await createTempDir();
    const steeringPath = join(home, ".kiro", "steering", "tokenjuice.md");
    await installKiroSteering(steeringPath);
    await writeFile(
      steeringPath,
      [
        "---",
        "inclusion: always",
        "---",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- tokenjuice wrap -- <command>",
        "- tokenjuice wrap --raw -- <command>",
      ].join("\r\n"),
      "utf8",
    );

    const doctor = await doctorKiroSteering(steeringPath);

    expect(doctor.status).toBe("ok");
  });

  it("uses KIRO_PROJECT_DIR for the default steering file", async () => {
    const home = await createTempDir();
    process.env.KIRO_PROJECT_DIR = home;

    const installed = await installKiroSteering();
    const expectedSteeringPath = join(home, ".kiro", "steering", "tokenjuice.md");
    const doctor = await doctorKiroSteering();

    expect(installed.steeringPath).toBe(expectedSteeringPath);
    expect(doctor.steeringPath).toBe(expectedSteeringPath);
    expect(doctor.status).toBe("ok");
  });

  it("does not remove markerless user-owned steering files", async () => {
    const home = await createTempDir();
    const steeringPath = join(home, ".kiro", "steering", "tokenjuice.md");
    await mkdir(join(home, ".kiro", "steering"), { recursive: true });
    await writeFile(steeringPath, "# user Kiro steering\n", "utf8");

    const removed = await uninstallKiroSteering(undefined, { projectDir: home });

    expect(removed.steeringPath).toBe(steeringPath);
    expect(removed.removed).toBe(false);
    await expect(readFile(steeringPath, "utf8")).resolves.toBe("# user Kiro steering\n");
  });

  it("uses projectDir when uninstalling the default steering file", async () => {
    const home = await createTempDir();
    const expectedSteeringPath = join(home, ".kiro", "steering", "tokenjuice.md");

    await installKiroSteering(undefined, { projectDir: home });
    const removed = await uninstallKiroSteering(undefined, { projectDir: home });

    expect(removed.steeringPath).toBe(expectedSteeringPath);
    expect(removed.removed).toBe(true);
    await expect(access(expectedSteeringPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the default steering file when uninstalling", async () => {
    const home = await createTempDir();
    process.env.KIRO_PROJECT_DIR = home;
    const steeringPath = join(home, ".kiro", "steering", "tokenjuice.md");

    await installKiroSteering();
    await uninstallKiroSteering(steeringPath);

    await expect(access(steeringPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
