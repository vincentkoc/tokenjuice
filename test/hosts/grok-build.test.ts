import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorGrokBuildInstructions,
  doctorInstalledHooks,
  installGrokBuildInstructions,
  uninstallGrokBuildInstructions,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "AIDER_PROJECT_DIR",
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
  "CRUSH_PROJECT_DIR",
  "CURSOR_HOME",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GROK_BUILD_PROJECT_DIR",
  "GROK_HOME",
  "HOME",
  "JUNIE_PROJECT_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
  "OPENWEBUI_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "PLANDEX_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-grok-build-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("grok-build instructions", () => {
  it("installs a host-specific marker-delimited AGENTS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    const result = await installGrokBuildInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:grok-build begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("When running terminal commands through Grok Build");
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
        "<!-- tokenjuice:open-interpreter begin -->",
        "## tokenjuice terminal output compaction",
        "- When running terminal commands through Open Interpreter, prefer `tokenjuice wrap -- <command>`.",
        "<!-- tokenjuice:open-interpreter end -->",
      ].join("\n"),
      "utf8",
    );

    await installGrokBuildInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("<!-- tokenjuice:open-interpreter begin -->");
    expect(instructions).toContain("When running terminal commands through Open Interpreter");
    expect(instructions).toContain("<!-- tokenjuice:grok-build begin -->");
    expect(instructions).toContain("When running terminal commands through Grok Build");
  });

  it("backs up existing project instructions before replacing its own block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installGrokBuildInstructions(instructionsPath);
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installGrokBuildInstructions(instructionsPath);

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("<!-- tokenjuice:grok-build begin -->");
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    await installGrokBuildInstructions(instructionsPath);
    const installed = await doctorGrokBuildInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallGrokBuildInstructions(instructionsPath);
    const disabled = await doctorGrokBuildInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("leaves project instructions without a tokenjuice block untouched on uninstall", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const removed = await uninstallGrokBuildInstructions(instructionsPath);

    expect(removed.removed).toBe(false);
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("keep this");
  });

  it("reports broken instructions with unmatched Grok Build tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:grok-build begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorGrokBuildInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken instructions when a valid block has extra tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installGrokBuildInstructions(instructionsPath);
    await writeFile(
      instructionsPath,
      `${await readFile(instructionsPath, "utf8")}\n<!-- tokenjuice:grok-build begin -->\n`,
      "utf8",
    );

    const doctor = await doctorGrokBuildInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Grok Build instructions have unmatched tokenjuice markers");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
    await expect(installGrokBuildInstructions(instructionsPath)).rejects.toThrow(
      "cannot safely repair malformed tokenjuice markers",
    );
    await expect(uninstallGrokBuildInstructions(instructionsPath)).rejects.toThrow(
      "cannot safely uninstall malformed tokenjuice markers",
    );
  });

  it("uses GROK_BUILD_PROJECT_DIR for the default AGENTS.md path", async () => {
    const home = await createTempDir();
    process.env.GROK_BUILD_PROJECT_DIR = home;

    const installed = await installGrokBuildInstructions();
    const expectedInstructionsPath = join(home, "AGENTS.md");
    const doctor = await doctorGrokBuildInstructions();

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

    const installed = await installGrokBuildInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, "AGENTS.md"));
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toContain("Grok Build");
  });

  it("is included in aggregate hook doctor output", async () => {
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
    process.env.GROK_HOME = join(configHome, ".grok");
    process.env.COPILOT_HOME = join(configHome, ".copilot");
    process.env.PI_CODING_AGENT_DIR = join(configHome, ".pi", "agent");
    process.env.OPENCODE_CONFIG_DIR = join(configHome, ".config", "opencode");
    process.env.CLINE_HOOKS_DIR = join(configHome, "Cline", "Hooks");
    await installGrokBuildInstructions(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["grok-build"].instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(report.integrations["grok-build"].status).toBe("ok");
  });

  it("uses projectDir when uninstalling the default instructions file", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    await installGrokBuildInstructions(undefined, { projectDir: home });
    const removed = await uninstallGrokBuildInstructions(undefined, { projectDir: home });

    expect(removed.instructionsPath).toBe(instructionsPath);
    expect(removed.removed).toBe(true);
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
