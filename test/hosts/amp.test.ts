import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAmpInstructions,
  doctorInstalledHooks,
  installAmpInstructions,
  uninstallAmpInstructions,
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
  "CURSOR_HOME",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "HOME",
  "JUNIE_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "QWEN_PROJECT_DIR",
  "ROO_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-amp-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("amp instructions", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:begin -->/gu)?.length ?? 0;
  }

  it("installs a marker-delimited AGENTS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    const result = await installAmpInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    expect(instructions).toContain("tokenjuice wrap --raw -- <command>");
    expect(instructions).not.toContain("wrap --full");
  });

  it("preserves existing AGENTS.md content and backs it up", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installAmpInstructions(instructionsPath);
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installAmpInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:begin -->");
  });

  it("replaces stale tokenjuice instructions without duplicating the block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
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

    await installAmpInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    await installAmpInstructions(instructionsPath);
    const installed = await doctorAmpInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallAmpInstructions(instructionsPath);
    const disabled = await doctorAmpInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorAmpInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
  });

  it("refuses to auto-repair unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "# project instructions",
        "",
        "- keep before",
        "<!-- tokenjuice:begin -->",
        "- stale but not marked anymore",
        "- keep after",
      ].join("\n"),
      "utf8",
    );

    const beforeRepair = await doctorAmpInstructions(instructionsPath);

    expect(beforeRepair.status).toBe("broken");
    expect(beforeRepair.fixCommand).toContain("remove unmatched tokenjuice markers");
    await expect(installAmpInstructions(instructionsPath)).rejects.toThrow("cannot safely repair malformed tokenjuice markers");
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("- keep after");
  });

  it("refuses to auto-repair mixed complete and dangling tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:begin -->",
        "valid-looking block",
        "<!-- tokenjuice:end -->",
        "- keep this",
        "<!-- tokenjuice:begin -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAmpInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
    await expect(installAmpInstructions(instructionsPath)).rejects.toThrow("cannot safely repair malformed tokenjuice markers");
  });

  it("reports a healthy tokenjuice block with extra dangling markers as broken", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installAmpInstructions(instructionsPath);
    const healthyInstructions = await readFile(instructionsPath, "utf8");
    await writeFile(instructionsPath, `${healthyInstructions}\n<!-- tokenjuice:begin -->\n`, "utf8");

    const doctor = await doctorAmpInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Amp instructions have unmatched tokenjuice markers");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("refuses to uninstall mixed complete and dangling tokenjuice markers without partial mutation", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "# project instructions",
        "",
        "<!-- tokenjuice:begin -->",
        "valid-looking block",
        "<!-- tokenjuice:end -->",
        "- keep this",
        "<!-- tokenjuice:begin -->",
      ].join("\n"),
      "utf8",
    );

    await expect(uninstallAmpInstructions(instructionsPath)).rejects.toThrow("cannot safely uninstall malformed tokenjuice markers");
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("valid-looking block");
    expect(instructions).toContain("<!-- tokenjuice:begin -->");
    expect(instructions).toContain("<!-- tokenjuice:end -->");
  });

  it("reports broken instructions when the tokenjuice block is stale", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- old guidance says to run tokenjuice wrap --full -- <command>.",
        "<!-- tokenjuice:end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAmpInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Amp instructions are missing tokenjuice wrap guidance");
    expect(doctor.issues).toContain("configured Amp instructions are missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Amp instructions still suggest the full escape hatch");
  });

  it("keeps tokenjuice install amp as the repair command for duplicate complete blocks", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:begin -->",
        "first block",
        "<!-- tokenjuice:end -->",
        "<!-- tokenjuice:begin -->",
        "second block",
        "<!-- tokenjuice:end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAmpInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.fixCommand).toBe("tokenjuice install amp");
  });

  it("leaves unrelated AGENTS.md content untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const removed = await uninstallAmpInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(instructions).toBe("# project instructions\n\n- keep this\n");
  });

  it("uses AMP_PROJECT_DIR for the default instructions file", async () => {
    const home = await createTempDir();
    process.env.AMP_PROJECT_DIR = home;

    const installed = await installAmpInstructions();
    const expectedInstructionsPath = join(home, "AGENTS.md");
    const doctor = await doctorAmpInstructions();

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.instructionsPath).toBe(expectedInstructionsPath);
    expect(doctor.status).toBe("ok");
  });

  it("preserves Amp fallback files instead of shadowing them with AGENTS.md", async () => {
    const home = await createTempDir();
    const fallbackPath = join(home, "AGENT.md");
    await writeFile(fallbackPath, "# existing Amp guidance\n", "utf8");
    process.env.AMP_PROJECT_DIR = home;

    const installed = await installAmpInstructions();
    const doctor = await doctorAmpInstructions();

    expect(installed.instructionsPath).toBe(fallbackPath);
    expect(doctor.instructionsPath).toBe(fallbackPath);
    expect(await readFile(fallbackPath, "utf8")).toContain("# existing Amp guidance");
    await expect(access(join(home, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("passes projectDir through aggregate hook doctor", async () => {
    const home = await createTempDir();
    const configHome = join(home, "home");
    await mkdir(configHome, { recursive: true });
    process.env.HOME = configHome;
    process.env.FACTORY_HOME = join(configHome, ".factory");
    process.env.CODEX_HOME = join(configHome, ".codex");
    process.env.CLAUDE_CONFIG_DIR = join(configHome, ".claude");
    process.env.CODEBUDDY_CONFIG_DIR = join(configHome, ".codebuddy");
    process.env.CURSOR_HOME = join(configHome, ".cursor");
    process.env.GEMINI_HOME = join(configHome, ".gemini");
    process.env.COPILOT_HOME = join(configHome, ".copilot");
    process.env.PI_CODING_AGENT_DIR = join(configHome, ".pi", "agent");
    process.env.OPENCODE_CONFIG_DIR = join(configHome, ".config", "opencode");
    process.env.CLINE_HOOKS_DIR = join(configHome, "Cline", "Hooks");
    await installAmpInstructions(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.amp.instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(report.integrations.amp.status).toBe("ok");
  });

  it("keeps aggregate hook doctor from recursively scanning Amp subtrees", async () => {
    const home = await createTempDir();
    const configHome = join(home, "home");
    const releaseDir = join(home, "release");
    await mkdir(configHome, { recursive: true });
    await mkdir(releaseDir, { recursive: true });
    process.env.HOME = configHome;
    process.env.FACTORY_HOME = join(configHome, ".factory");
    process.env.CODEX_HOME = join(configHome, ".codex");
    process.env.CLAUDE_CONFIG_DIR = join(configHome, ".claude");
    process.env.CODEBUDDY_CONFIG_DIR = join(configHome, ".codebuddy");
    process.env.CURSOR_HOME = join(configHome, ".cursor");
    process.env.GEMINI_HOME = join(configHome, ".gemini");
    process.env.COPILOT_HOME = join(configHome, ".copilot");
    process.env.PI_CODING_AGENT_DIR = join(configHome, ".pi", "agent");
    process.env.OPENCODE_CONFIG_DIR = join(configHome, ".config", "opencode");
    process.env.CLINE_HOOKS_DIR = join(configHome, "Cline", "Hooks");
    await writeFile(
      join(releaseDir, "AGENTS.md"),
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );

    const aggregateReport = await doctorInstalledHooks({ projectDir: home });
    const directReport = await doctorAmpInstructions(undefined, { projectDir: home });

    expect(aggregateReport.integrations.amp.status).toBe("disabled");
    expect(aggregateReport.integrations.amp.instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(directReport.status).toBe("broken");
    expect(directReport.instructionsPath).toBe(join(releaseDir, "AGENTS.md"));
  });

  it("installs into the git root when run from a nested directory", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installAmpInstructions();
    const expectedInstructionsPath = join(await realpath(home), "AGENTS.md");
    const instructions = await readFile(join(home, "AGENTS.md"), "utf8");

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(instructions).toContain("tokenjuice wrap -- <command>");
    await expect(access(join(nestedDir, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("finds and removes a parent tokenjuice block when run from a nested directory", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await installAmpInstructions(join(home, "AGENTS.md"));
    process.chdir(nestedDir);

    const installed = await doctorAmpInstructions();
    const removed = await uninstallAmpInstructions();
    const disabled = await doctorAmpInstructions();
    const expectedInstructionsPath = join(await realpath(home), "AGENTS.md");

    expect(installed.instructionsPath).toBe(expectedInstructionsPath);
    expect(installed.status).toBe("ok");
    expect(removed.instructionsPath).toBe(expectedInstructionsPath);
    expect(removed.removed).toBe(true);
    expect(disabled.instructionsPath).toBe(expectedInstructionsPath);
    expect(disabled.status).toBe("disabled");
  });

  it("removes nested and parent tokenjuice blocks that Amp would load", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await installAmpInstructions(join(home, "AGENTS.md"));
    await installAmpInstructions(join(nestedDir, "AGENTS.md"));
    process.chdir(nestedDir);

    const removed = await uninstallAmpInstructions();
    const disabled = await doctorAmpInstructions();

    expect(removed.removed).toBe(true);
    expect(removed.removedPaths).toEqual([
      join(await realpath(nestedDir), "AGENTS.md"),
      join(await realpath(home), "AGENTS.md"),
    ]);
    expect(disabled.status).toBe("disabled");
    await expect(access(join(home, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(nestedDir, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports and repairs stale parent instructions even when a nearer block is healthy", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await installAmpInstructions(join(home, "AGENTS.md"));
    await installAmpInstructions(join(nestedDir, "AGENTS.md"));
    await writeFile(
      join(home, "AGENTS.md"),
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(nestedDir);

    const beforeRepair = await doctorAmpInstructions();
    const repaired = await installAmpInstructions();
    const afterRepair = await doctorAmpInstructions();

    expect(beforeRepair.status).toBe("broken");
    expect(beforeRepair.instructionsPath).toBe(join(await realpath(home), "AGENTS.md"));
    expect(repaired.instructionsPaths).toEqual([
      join(await realpath(nestedDir), "AGENTS.md"),
      join(await realpath(home), "AGENTS.md"),
    ]);
    expect(afterRepair.status).toBe("ok");
    expect(await readFile(join(home, "AGENTS.md"), "utf8")).not.toContain("wrap --full");
  });

  it("does not partially mutate nearer instructions when a parent block is malformed", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await installAmpInstructions(join(nestedDir, "AGENTS.md"));
    const nestedBefore = await readFile(join(nestedDir, "AGENTS.md"), "utf8");
    await writeFile(join(home, "AGENTS.md"), "<!-- tokenjuice:begin -->\nmalformed\n", "utf8");
    process.chdir(nestedDir);

    await expect(installAmpInstructions()).rejects.toThrow("cannot safely repair malformed tokenjuice markers");

    expect(await readFile(join(nestedDir, "AGENTS.md"), "utf8")).toBe(nestedBefore);
    await expect(access(join(nestedDir, "AGENTS.md.bak"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("repairs the nearest parent tokenjuice block instead of writing a second root block", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(nestedDir, "AGENTS.md"),
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(nestedDir);

    const beforeRepair = await doctorAmpInstructions();
    const repaired = await installAmpInstructions();
    const afterRepair = await doctorAmpInstructions();

    expect(beforeRepair.status).toBe("broken");
    expect(repaired.instructionsPath).toBe(join(await realpath(nestedDir), "AGENTS.md"));
    expect(afterRepair.instructionsPath).toBe(repaired.instructionsPath);
    expect(afterRepair.status).toBe("ok");
    await expect(access(join(home, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("repairs sibling subtree tokenjuice blocks when run from a nested directory", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    const releaseDir = join(home, "release");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await mkdir(releaseDir, { recursive: true });
    await installAmpInstructions(join(nestedDir, "AGENTS.md"));
    await writeFile(
      join(releaseDir, "AGENTS.md"),
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(nestedDir);

    const beforeRepair = await doctorAmpInstructions();
    const repaired = await installAmpInstructions();
    const afterRepair = await doctorAmpInstructions();

    expect(beforeRepair.status).toBe("broken");
    expect(beforeRepair.instructionsPath).toBe(join(await realpath(releaseDir), "AGENTS.md"));
    expect(repaired.instructionsPaths).toEqual([
      join(await realpath(nestedDir), "AGENTS.md"),
      join(await realpath(releaseDir), "AGENTS.md"),
    ]);
    expect(afterRepair.status).toBe("ok");
    expect(await readFile(join(releaseDir, "AGENTS.md"), "utf8")).not.toContain("wrap --full");
    await expect(access(join(home, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports nested subtree tokenjuice instructions from the project root", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(nestedDir, "AGENTS.md"),
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(home);

    const doctor = await doctorAmpInstructions();

    expect(doctor.status).toBe("broken");
    expect(doctor.instructionsPath).toBe(join(await realpath(nestedDir), "AGENTS.md"));
  });

  it("reports nested subtree tokenjuice instructions from an explicit project dir", async () => {
    const home = await createTempDir();
    const configHome = join(home, "home");
    const repoDir = join(home, "repo");
    const nestedDir = join(repoDir, "packages", "app");
    await mkdir(configHome, { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(nestedDir, "AGENTS.md"),
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.env.HOME = configHome;
    process.chdir(configHome);

    const doctor = await doctorAmpInstructions(undefined, { projectDir: repoDir });

    expect(doctor.status).toBe("broken");
    expect(doctor.instructionsPath).toBe(join(nestedDir, "AGENTS.md"));
  });

  it("installs root guidance while repairing stale subtree instructions from the project root", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(nestedDir, "AGENTS.md"),
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(home);

    const installed = await installAmpInstructions();
    const afterInstall = await doctorAmpInstructions();

    expect(installed.instructionsPaths).toEqual([
      join(await realpath(home), "AGENTS.md"),
      join(await realpath(nestedDir), "AGENTS.md"),
    ]);
    expect(afterInstall.status).toBe("ok");
    expect(await readFile(join(home, "AGENTS.md"), "utf8")).toContain("tokenjuice wrap -- <command>");
    expect(await readFile(join(nestedDir, "AGENTS.md"), "utf8")).not.toContain("wrap --full");
  });

  it("does not manage Amp instructions inside nested git roots", async () => {
    const home = await createTempDir();
    const nestedRepoDir = join(home, "packages", "app");
    const nestedInstructionsPath = join(nestedRepoDir, "AGENTS.md");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(join(nestedRepoDir, ".git"), { recursive: true });
    await writeFile(
      nestedInstructionsPath,
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(home);

    const beforeInstall = await doctorAmpInstructions();
    const installed = await installAmpInstructions();
    const removed = await uninstallAmpInstructions();
    const nestedInstructions = await readFile(nestedInstructionsPath, "utf8");

    expect(beforeInstall.status).toBe("disabled");
    expect(beforeInstall.instructionsPath).toBe(join(await realpath(home), "AGENTS.md"));
    expect(installed.instructionsPath).toBe(join(await realpath(home), "AGENTS.md"));
    expect(removed.removedPaths).toEqual([join(await realpath(home), "AGENTS.md")]);
    expect(nestedInstructions).toContain("wrap --full");
  });

  it("uninstalls nested subtree tokenjuice instructions from the project root", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await installAmpInstructions(join(nestedDir, "AGENTS.md"));
    process.chdir(home);

    const removed = await uninstallAmpInstructions();
    const afterUninstall = await doctorAmpInstructions();

    expect(removed.removed).toBe(true);
    expect(removed.removedPaths).toEqual([join(await realpath(nestedDir), "AGENTS.md")]);
    expect(afterUninstall.status).toBe("disabled");
    await expect(access(join(nestedDir, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uninstalls tokenjuice instructions from generated-name subtrees", async () => {
    const home = await createTempDir();
    const releaseDir = join(home, "release");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(releaseDir, { recursive: true });
    await installAmpInstructions(join(releaseDir, "AGENTS.md"));
    process.chdir(home);

    const beforeUninstall = await doctorAmpInstructions();
    const removed = await uninstallAmpInstructions();
    const afterUninstall = await doctorAmpInstructions();

    expect(beforeUninstall.status).toBe("ok");
    expect(beforeUninstall.instructionsPath).toBe(join(await realpath(releaseDir), "AGENTS.md"));
    expect(removed.removedPaths).toEqual([join(await realpath(releaseDir), "AGENTS.md")]);
    expect(afterUninstall.status).toBe("disabled");
    await expect(access(join(releaseDir, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uninstalls shadowed nested fallback tokenjuice blocks from the project root", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await installAmpInstructions(join(nestedDir, "AGENTS.md"));
    await writeFile(
      join(nestedDir, "AGENT.md"),
      [
        "# nested fallback guidance",
        "",
        "<!-- tokenjuice:begin -->",
        "shadowed stale tokenjuice wrap --full -- <command>",
        "<!-- tokenjuice:end -->",
      ].join("\n"),
      "utf8",
    );
    process.chdir(home);

    const removed = await uninstallAmpInstructions();
    const afterUninstall = await doctorAmpInstructions();

    expect(removed.removed).toBe(true);
    expect(removed.removedPaths).toEqual([
      join(await realpath(nestedDir), "AGENTS.md"),
      join(await realpath(nestedDir), "AGENT.md"),
    ]);
    expect(afterUninstall.status).toBe("disabled");
    await expect(access(join(nestedDir, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(nestedDir, "AGENT.md"), "utf8")).toBe("# nested fallback guidance\n");
  });

  it("does not repair a tokenjuice block outside the current git root", async () => {
    const home = await createTempDir();
    const repoDir = join(home, "repo");
    const nestedDir = join(repoDir, "packages", "app");
    await mkdir(join(repoDir, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(home, "AGENTS.md"),
      "<!-- tokenjuice:begin -->\nparent tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(nestedDir);

    const beforeInstall = await doctorAmpInstructions();
    const installed = await installAmpInstructions();
    const parentInstructions = await readFile(join(home, "AGENTS.md"), "utf8");

    expect(beforeInstall.status).toBe("disabled");
    expect(beforeInstall.instructionsPath).toBe(join(await realpath(repoDir), "AGENTS.md"));
    expect(installed.instructionsPath).toBe(beforeInstall.instructionsPath);
    expect(parentInstructions).toContain("parent tokenjuice wrap --full -- <command>");
    expect(await readFile(join(repoDir, "AGENTS.md"), "utf8")).toContain("tokenjuice wrap -- <command>");
  });

  it("repairs loaded fallback instruction files inside the current git root", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    const fallbackPath = join(home, "AGENT.md");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      fallbackPath,
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(nestedDir);

    const beforeRepair = await doctorAmpInstructions();
    const repaired = await installAmpInstructions();
    const afterRepair = await doctorAmpInstructions();

    expect(beforeRepair.status).toBe("broken");
    expect(beforeRepair.instructionsPath).toBe(join(await realpath(home), "AGENT.md"));
    expect(repaired.instructionsPath).toBe(join(await realpath(home), "AGENT.md"));
    expect(afterRepair.status).toBe("ok");
    expect(await readFile(fallbackPath, "utf8")).not.toContain("wrap --full");
  });

  it("ignores shadowed fallback tokenjuice blocks when AGENTS.md exists", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    const agentsPath = join(home, "AGENTS.md");
    const fallbackPath = join(home, "AGENT.md");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(agentsPath, "# active Amp guidance\n", "utf8");
    await writeFile(
      fallbackPath,
      "<!-- tokenjuice:begin -->\nignored stale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(nestedDir);

    const beforeInstall = await doctorAmpInstructions();
    const installed = await installAmpInstructions();
    const afterInstall = await doctorAmpInstructions();

    expect(beforeInstall.status).toBe("disabled");
    expect(beforeInstall.instructionsPath).toBe(join(await realpath(home), "AGENTS.md"));
    expect(installed.instructionsPath).toBe(join(await realpath(home), "AGENTS.md"));
    expect(afterInstall.status).toBe("ok");
    expect(await readFile(fallbackPath, "utf8")).toContain("wrap --full");
    expect(await readFile(agentsPath, "utf8")).toContain("tokenjuice wrap -- <command>");
  });

  it("uninstalls shadowed fallback tokenjuice blocks before they can become active", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    const agentsPath = join(home, "AGENTS.md");
    const fallbackPath = join(home, "AGENT.md");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await installAmpInstructions(agentsPath);
    await writeFile(
      fallbackPath,
      [
        "# fallback Amp guidance",
        "",
        "<!-- tokenjuice:begin -->",
        "shadowed stale tokenjuice wrap --full -- <command>",
        "<!-- tokenjuice:end -->",
      ].join("\n"),
      "utf8",
    );
    process.chdir(nestedDir);

    const removed = await uninstallAmpInstructions();
    const afterUninstall = await doctorAmpInstructions();

    expect(removed.removed).toBe(true);
    expect(removed.removedPaths).toEqual([
      join(await realpath(home), "AGENTS.md"),
      join(await realpath(home), "AGENT.md"),
    ]);
    expect(afterUninstall.status).toBe("disabled");
    await expect(access(agentsPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(fallbackPath, "utf8")).toBe("# fallback Amp guidance\n");
  });

  it("removes the default instructions file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.AMP_PROJECT_DIR = home;
    const instructionsPath = join(home, "AGENTS.md");

    await installAmpInstructions();
    await uninstallAmpInstructions(instructionsPath);

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates parent directories for explicit nested instruction paths", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "nested", "AGENTS.md");

    await installAmpInstructions(instructionsPath);

    await expect(access(instructionsPath)).resolves.toBeUndefined();
  });
});
