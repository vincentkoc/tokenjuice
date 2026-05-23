import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorOpenInterpreterInstructions,
  installOpenInterpreterInstructions,
  uninstallOpenInterpreterInstructions,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEX_HOME",
  "CONTINUE_PROJECT_DIR",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CRUSH_PROJECT_DIR",
  "CURSOR_HOME",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GROK_HOME",
  "HOME",
  "JUNIE_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
  "OPENWEBUI_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "QWEN_PROJECT_DIR",
  "ROO_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-open-interpreter-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("open-interpreter instructions", () => {
  it("installs a host-specific marker-delimited AGENTS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    const result = await installOpenInterpreterInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:open-interpreter begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("When running terminal commands through Open Interpreter");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).not.toContain("wrap --full");
  });

  it("coexists with other tokenjuice AGENTS.md blocks", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "# project instructions",
        "",
        "<!-- tokenjuice:begin -->",
        "## tokenjuice terminal output compaction",
        "- When running terminal commands through Amp, prefer `tokenjuice wrap -- <command>`.",
        "<!-- tokenjuice:end -->",
      ].join("\n"),
      "utf8",
    );

    await installOpenInterpreterInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("<!-- tokenjuice:begin -->");
    expect(instructions).toContain("When running terminal commands through Amp");
    expect(instructions).toContain("<!-- tokenjuice:open-interpreter begin -->");
    expect(instructions).toContain("When running terminal commands through Open Interpreter");
  });

  it("backs up existing project instructions before replacing its own block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installOpenInterpreterInstructions(instructionsPath);
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installOpenInterpreterInstructions(instructionsPath);

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("<!-- tokenjuice:open-interpreter begin -->");
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    await installOpenInterpreterInstructions(instructionsPath);
    const installed = await doctorOpenInterpreterInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallOpenInterpreterInstructions(instructionsPath);
    const disabled = await doctorOpenInterpreterInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken instructions with unmatched Open Interpreter tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:open-interpreter begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorOpenInterpreterInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken instructions when marker counts are malformed but guidance is present", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:open-interpreter begin -->",
        "<!-- tokenjuice:open-interpreter begin -->",
        "tokenjuice wrap -- <command>",
        "tokenjuice wrap --raw -- <command>",
        "<!-- tokenjuice:open-interpreter end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOpenInterpreterInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Open Interpreter instructions have malformed tokenjuice markers");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("uses OPEN_INTERPRETER_PROJECT_DIR for the default AGENTS.md path", async () => {
    const home = await createTempDir();
    process.env.OPEN_INTERPRETER_PROJECT_DIR = home;

    const installed = await installOpenInterpreterInstructions();
    const expectedInstructionsPath = join(home, "AGENTS.md");
    const doctor = await doctorOpenInterpreterInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("defaults to the git root AGENTS.md from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installOpenInterpreterInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, "AGENTS.md"));
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toContain("Open Interpreter");
  });

  it("keeps the root install target when repairing nested tokenjuice instructions", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(nestedDir, "AGENTS.md"),
      [
        "<!-- tokenjuice:open-interpreter begin -->",
        "stale tokenjuice wrap --full -- <command>",
        "<!-- tokenjuice:open-interpreter end -->",
      ].join("\n"),
      "utf8",
    );
    process.chdir(nestedDir);

    const installed = await installOpenInterpreterInstructions();
    const afterInstall = await doctorOpenInterpreterInstructions();
    const root = await realpath(home);
    const nested = await realpath(nestedDir);

    expect(installed.instructionsPaths).toEqual([
      join(root, "AGENTS.md"),
      join(nested, "AGENTS.md"),
    ]);
    expect(afterInstall.status).toBe("ok");
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toContain("Open Interpreter");
    await expect(readFile(join(nested, "AGENTS.md"), "utf8")).resolves.not.toContain("wrap --full");
  });

  it("reports nested-only tokenjuice instructions as missing root guidance", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await installOpenInterpreterInstructions(join(nestedDir, "AGENTS.md"));
    process.chdir(nestedDir);

    const doctor = await doctorOpenInterpreterInstructions();
    const root = await realpath(home);

    expect(doctor.status).toBe("warn");
    expect(doctor.instructionsPath).toBe(join(root, "AGENTS.md"));
    expect(doctor.issues).toContain("tokenjuice Open Interpreter root instructions are not installed, but nested tokenjuice instructions exist");
    expect(doctor.fixCommand).toBe("tokenjuice install open-interpreter");
  });

  it("reports broken nested tokenjuice instructions before missing root guidance", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(nestedDir, "AGENTS.md"),
      [
        "<!-- tokenjuice:open-interpreter begin -->",
        "tokenjuice wrap -- <command>",
        "tokenjuice wrap --full -- <command>",
        "<!-- tokenjuice:open-interpreter end -->",
      ].join("\n"),
      "utf8",
    );
    process.chdir(nestedDir);

    const doctor = await doctorOpenInterpreterInstructions();
    const nested = await realpath(nestedDir);

    expect(doctor.status).toBe("broken");
    expect(doctor.instructionsPath).toBe(join(nested, "AGENTS.md"));
    expect(doctor.issues).toContain("configured Open Interpreter instructions are missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Open Interpreter instructions still suggest the full escape hatch");
  });

  it("uses explicit projectDir as the AGENTS.md scan boundary", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    await installOpenInterpreterInstructions(undefined, { projectDir: home });
    await writeFile(
      join(nestedDir, "AGENTS.md"),
      [
        "<!-- tokenjuice:open-interpreter begin -->",
        "stale tokenjuice wrap --full -- <command>",
        "<!-- tokenjuice:open-interpreter end -->",
      ].join("\n"),
      "utf8",
    );
    process.chdir(nestedDir);

    const beforeRepair = await doctorOpenInterpreterInstructions(undefined, { projectDir: home });
    const repaired = await installOpenInterpreterInstructions(undefined, { projectDir: home });
    const afterRepair = await doctorOpenInterpreterInstructions(undefined, { projectDir: home });
    const removed = await uninstallOpenInterpreterInstructions(undefined, { projectDir: home });

    expect(beforeRepair.status).toBe("broken");
    expect(beforeRepair.instructionsPath).toBe(join(await realpath(nestedDir), "AGENTS.md"));
    expect(repaired.instructionsPaths).toEqual([
      join(home, "AGENTS.md"),
      join(await realpath(nestedDir), "AGENTS.md"),
    ]);
    expect(afterRepair.status).toBe("ok");
    expect(removed.removedPaths).toEqual([
      join(await realpath(nestedDir), "AGENTS.md"),
      join(await realpath(home), "AGENTS.md"),
    ]);
    await expect(access(join(home, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(nestedDir, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("scans explicit projectDir descendants when launched outside the project", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    await installOpenInterpreterInstructions(undefined, { projectDir: home });
    await writeFile(
      join(nestedDir, "AGENTS.md"),
      [
        "<!-- tokenjuice:open-interpreter begin -->",
        "stale tokenjuice wrap --full -- <command>",
        "<!-- tokenjuice:open-interpreter end -->",
      ].join("\n"),
      "utf8",
    );
    process.chdir(outside);

    const beforeRepair = await doctorOpenInterpreterInstructions(undefined, { projectDir: home });
    const repaired = await installOpenInterpreterInstructions(undefined, { projectDir: home });
    const afterRepair = await doctorOpenInterpreterInstructions(undefined, { projectDir: home });

    expect(beforeRepair.status).toBe("broken");
    expect(beforeRepair.instructionsPath).toBe(join(nestedDir, "AGENTS.md"));
    expect(repaired.instructionsPaths).toEqual([
      join(home, "AGENTS.md"),
      join(nestedDir, "AGENTS.md"),
    ]);
    expect(afterRepair.status).toBe("ok");
  });

  it("removes nested managed instructions when uninstalling from the git root", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await installOpenInterpreterInstructions(join(home, "AGENTS.md"));
    await installOpenInterpreterInstructions(join(nestedDir, "AGENTS.md"));
    process.chdir(home);

    const removed = await uninstallOpenInterpreterInstructions();

    expect(removed.removedPaths).toEqual([
      join(await realpath(home), "AGENTS.md"),
      join(await realpath(nestedDir), "AGENTS.md"),
    ]);
    await expect(access(join(home, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(nestedDir, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not uninstall managed instructions from nested git projects", async () => {
    const home = await createTempDir();
    const nestedRepoDir = join(home, "vendor", "tool");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(join(nestedRepoDir, ".git"), { recursive: true });
    await installOpenInterpreterInstructions(join(home, "AGENTS.md"));
    await installOpenInterpreterInstructions(join(nestedRepoDir, "AGENTS.md"));
    process.chdir(home);

    const removed = await uninstallOpenInterpreterInstructions();

    expect(removed.removedPaths).toEqual([
      join(await realpath(home), "AGENTS.md"),
    ]);
    await expect(access(join(home, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(nestedRepoDir, "AGENTS.md"), "utf8")).resolves.toContain("tokenjuice:open-interpreter begin");
  });

  it("reports descendant-only managed instructions from the git root", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await installOpenInterpreterInstructions(join(nestedDir, "AGENTS.md"));
    process.chdir(home);

    const doctor = await doctorOpenInterpreterInstructions();

    expect(doctor.status).toBe("warn");
    expect(doctor.instructionsPath).toBe(join(await realpath(home), "AGENTS.md"));
    expect(doctor.issues).toContain("tokenjuice Open Interpreter root instructions are not installed, but nested tokenjuice instructions exist");
  });

  it("reports broken descendant managed instructions from the git root", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(nestedDir, "AGENTS.md"),
      [
        "<!-- tokenjuice:open-interpreter begin -->",
        "tokenjuice wrap -- <command>",
        "tokenjuice wrap --full -- <command>",
        "<!-- tokenjuice:open-interpreter end -->",
      ].join("\n"),
      "utf8",
    );
    process.chdir(home);

    const doctor = await doctorOpenInterpreterInstructions();

    expect(doctor.status).toBe("broken");
    expect(doctor.instructionsPath).toBe(join(await realpath(nestedDir), "AGENTS.md"));
    expect(doctor.issues).toContain("configured Open Interpreter instructions are missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Open Interpreter instructions still suggest the full escape hatch");
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installOpenInterpreterInstructions(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["open-interpreter"].instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(report.integrations["open-interpreter"].status).toBe("ok");
  });

  it("does not scan descendant instructions during aggregate hook doctor", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(nestedDir, "AGENTS.md"),
      [
        "<!-- tokenjuice:open-interpreter begin -->",
        "stale tokenjuice wrap --full -- <command>",
        "<!-- tokenjuice:open-interpreter end -->",
      ].join("\n"),
      "utf8",
    );

    const direct = await doctorOpenInterpreterInstructions(undefined, { projectDir: home });
    const aggregate = await doctorInstalledHooks({ projectDir: home });

    expect(direct.status).toBe("broken");
    expect(aggregate.integrations["open-interpreter"].instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(aggregate.integrations["open-interpreter"].status).toBe("disabled");
  });
});
