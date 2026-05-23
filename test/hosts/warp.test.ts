import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorWarpInstructions,
  installWarpInstructions,
  uninstallWarpInstructions,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
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
  "GROK_BUILD_PROJECT_DIR",
  "HOME",
  "JUNIE_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "MISTRAL_VIBE_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "PLANDEX_PROJECT_DIR",
  "QODER_PROJECT_DIR",
  "QWEN_PROJECT_DIR",
  "ROO_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "TRAE_PROJECT_DIR",
  "WARP_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-warp-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("warp instructions", () => {
  it("installs a host-specific marker-delimited AGENTS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    const result = await installWarpInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:warp begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("When running terminal commands through Warp");
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
        "<!-- tokenjuice:qoder begin -->",
        "## tokenjuice terminal output compaction",
        "- When running terminal commands through Qoder CLI, prefer `tokenjuice wrap -- <command>`.",
        "<!-- tokenjuice:qoder end -->",
      ].join("\n"),
      "utf8",
    );

    await installWarpInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("<!-- tokenjuice:qoder begin -->");
    expect(instructions).toContain("When running terminal commands through Qoder CLI");
    expect(instructions).toContain("<!-- tokenjuice:warp begin -->");
    expect(instructions).toContain("When running terminal commands through Warp");
  });

  it("backs up existing project instructions before replacing its own block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installWarpInstructions(instructionsPath);
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installWarpInstructions(instructionsPath);

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("<!-- tokenjuice:warp begin -->");
  });

  it("uses WARP.md when it exists because Warp gives it priority", async () => {
    const home = await createTempDir();
    await writeFile(join(home, "WARP.md"), "# existing Warp rules\n", "utf8");
    process.env.WARP_PROJECT_DIR = home;

    const installed = await installWarpInstructions();
    const doctor = await doctorWarpInstructions();

    expect(installed.instructionsPath).toBe(join(home, "WARP.md"));
    expect(doctor.instructionsPath).toBe(join(home, "WARP.md"));
    await expect(readFile(join(home, "WARP.md"), "utf8")).resolves.toContain("When running terminal commands through Warp");
    await expect(access(join(home, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps tracking an existing AGENTS.md install after WARP.md appears", async () => {
    const home = await createTempDir();
    const agentsPath = join(home, "AGENTS.md");
    const warpPath = join(home, "WARP.md");
    process.env.WARP_PROJECT_DIR = home;
    await installWarpInstructions();
    await writeFile(warpPath, "# new Warp priority file\n", "utf8");

    const doctor = await doctorWarpInstructions();
    const removed = await uninstallWarpInstructions();

    expect(doctor.instructionsPath).toBe(agentsPath);
    expect(doctor.status).toBe("ok");
    expect(removed.instructionsPath).toBe(agentsPath);
    expect(removed.removed).toBe(true);
    await expect(readFile(agentsPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(warpPath, "utf8")).resolves.toBe("# new Warp priority file\n");
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    await installWarpInstructions(instructionsPath);
    const installed = await doctorWarpInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallWarpInstructions(instructionsPath);
    const disabled = await doctorWarpInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken instructions with unmatched Warp tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:warp begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorWarpInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken instructions with nested Warp tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:warp begin -->",
        "<!-- tokenjuice:warp begin -->",
        "## tokenjuice terminal output compaction",
        "- When running terminal commands through Warp, prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` when compaction should be skipped.",
        "<!-- tokenjuice:warp end -->",
        "<!-- tokenjuice:warp end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorWarpInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Warp instructions have malformed tokenjuice markers");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
    await expect(installWarpInstructions(instructionsPath)).rejects.toThrow("cannot safely repair malformed tokenjuice markers");
    await expect(uninstallWarpInstructions(instructionsPath)).rejects.toThrow("cannot safely uninstall malformed tokenjuice markers");
  });

  it("uses WARP_PROJECT_DIR for the default project rules path", async () => {
    const home = await createTempDir();
    process.env.WARP_PROJECT_DIR = home;

    const installed = await installWarpInstructions();
    const expectedInstructionsPath = join(home, "AGENTS.md");
    const doctor = await doctorWarpInstructions();

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

    const installed = await installWarpInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, "AGENTS.md"));
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toContain("Warp");
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installWarpInstructions(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.warp.instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(report.integrations.warp.status).toBe("ok");
  });
});
