import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAgentLayerInstructions,
  installAgentLayerInstructions,
  uninstallAgentLayerInstructions,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.AGENT_LAYER_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.AGENT_LAYER_PROJECT_DIR;
  } else {
    process.env.AGENT_LAYER_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-agent-layer-test-"));
  tempDirs.push(dir);
  return dir;
}

async function seedAgentLayerProject(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, ".agent-layer"), { recursive: true });
  await writeFile(join(projectDir, ".agent-layer", "config.toml"), "# Agent Layer test config\n", "utf8");
  await writeFile(join(projectDir, ".agent-layer", "al.version"), "0.9.1\n", "utf8");
}

describe("Agent Layer instructions", () => {
  it("installs Agent Layer source instructions with sync guidance", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".agent-layer", "instructions", "tokenjuice.md");

    const result = await installAgentLayerInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(result.syncCommand).toBe("al sync");
    expect(instructions).toContain("# tokenjuice terminal output compaction");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).toContain("al sync");
    expect(instructions).not.toContain("wrap --full");
  });

  it("backs up existing source instructions before replacing them", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".agent-layer", "instructions", "tokenjuice.md");
    await installAgentLayerInstructions(instructionsPath);
    await writeFile(instructionsPath, "custom local instructions\n", "utf8");

    const result = await installAgentLayerInstructions(instructionsPath);

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    expect(result.syncCommand).toBe("al sync");
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toBe("custom local instructions\n");
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("al sync");
  });

  it("does not overwrite an existing source instructions backup", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".agent-layer", "instructions", "tokenjuice.md");
    await mkdir(join(home, ".agent-layer", "instructions"), { recursive: true });
    await writeFile(instructionsPath, "custom local instructions\n", "utf8");
    await writeFile(`${instructionsPath}.bak`, "existing backup\n", "utf8");

    const result = await installAgentLayerInstructions(instructionsPath);

    expect(result.backupPath).toBe(`${instructionsPath}.bak.1`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toBe("existing backup\n");
    await expect(readFile(`${instructionsPath}.bak.1`, "utf8")).resolves.toBe("custom local instructions\n");
  });

  it("does not create a backup for an idempotent reinstall", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".agent-layer", "instructions", "tokenjuice.md");

    await installAgentLayerInstructions(instructionsPath);
    const result = await installAgentLayerInstructions(instructionsPath);

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(result.syncCommand).toBe("al sync");
    await expect(access(`${instructionsPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".agent-layer", "instructions", "tokenjuice.md");

    await installAgentLayerInstructions(instructionsPath);
    const installed = await doctorAgentLayerInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("instruction-based");
    expect(installed.advisories[0]).toContain("al sync");

    const removed = await uninstallAgentLayerInstructions(instructionsPath);
    const disabled = await doctorAgentLayerInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(removed.syncCommand).toBe("al sync");
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken instructions when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".agent-layer", "instructions", "tokenjuice.md");
    await mkdir(join(home, ".agent-layer", "instructions"), { recursive: true });
    await writeFile(
      instructionsPath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentLayerInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Agent Layer instructions are missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Agent Layer instructions are missing sync guidance");
    expect(doctor.issues).toContain("configured Agent Layer instructions still suggest the full escape hatch");
  });

  it("reports stale concrete full-output commands", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".agent-layer", "instructions", "tokenjuice.md");
    await mkdir(join(home, ".agent-layer", "instructions"), { recursive: true });
    await writeFile(
      instructionsPath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- After edits, run `al sync`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAgentLayerInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Agent Layer instructions still suggest the full escape hatch");
  });

  it("removes only the managed source instruction file", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, ".agent-layer", "instructions", "tokenjuice.md");
    const otherInstructionsPath = join(home, ".agent-layer", "instructions", "01-project.md");
    await mkdir(join(home, ".agent-layer", "instructions"), { recursive: true });
    await writeFile(instructionsPath, "custom local instructions\n", "utf8");
    await writeFile(otherInstructionsPath, "keep this\n", "utf8");

    const removed = await uninstallAgentLayerInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(removed.syncCommand).toBe("al sync");
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(otherInstructionsPath, "utf8")).resolves.toBe("keep this\n");
  });

  it("uses AGENT_LAYER_PROJECT_DIR for the default source instructions", async () => {
    const home = await createTempDir();
    await seedAgentLayerProject(home);
    process.env.AGENT_LAYER_PROJECT_DIR = home;

    const installed = await installAgentLayerInstructions();
    const expectedInstructionsPath = join(home, ".agent-layer", "instructions", "tokenjuice.md");
    const doctor = await doctorAgentLayerInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("refuses default install before Agent Layer initializes the project", async () => {
    const home = await createTempDir();
    process.env.AGENT_LAYER_PROJECT_DIR = home;

    await expect(installAgentLayerInstructions()).rejects.toThrow("run al init first");

    const doctor = await doctorAgentLayerInstructions();
    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("Agent Layer project is not initialized; run `al init` before installing tokenjuice instructions");
    expect(doctor.missingPaths).toEqual([
      join(home, ".agent-layer", "config.toml"),
      join(home, ".agent-layer", "al.version"),
    ]);
  });

  it("removes the default source instruction file", async () => {
    const home = await createTempDir();
    await seedAgentLayerProject(home);
    process.env.AGENT_LAYER_PROJECT_DIR = home;
    const instructionsPath = join(home, ".agent-layer", "instructions", "tokenjuice.md");

    await installAgentLayerInstructions();
    await uninstallAgentLayerInstructions();

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
