import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorJulesInstructions,
  doctorInstalledHooks,
  installJulesInstructions,
  uninstallJulesInstructions,
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
  "JULES_PROJECT_DIR",
  "HOME",
  "JUNIE_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-jules-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("jules instructions", () => {
  it("installs a host-specific marker-delimited AGENTS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    const result = await installJulesInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:jules begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("When running terminal commands through Jules");
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

    await installJulesInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("<!-- tokenjuice:open-interpreter begin -->");
    expect(instructions).toContain("When running terminal commands through Open Interpreter");
    expect(instructions).toContain("<!-- tokenjuice:jules begin -->");
    expect(instructions).toContain("When running terminal commands through Jules");
  });

  it("backs up existing project instructions before replacing its own block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installJulesInstructions(instructionsPath);
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installJulesInstructions(instructionsPath);

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    await expect(readFile(instructionsPath, "utf8")).resolves.toContain("<!-- tokenjuice:jules begin -->");
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    await installJulesInstructions(instructionsPath);
    const installed = await doctorJulesInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallJulesInstructions(instructionsPath);
    const disabled = await doctorJulesInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken instructions with unmatched Jules tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:jules begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorJulesInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken instructions with nested Jules tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:jules begin -->",
        "<!-- tokenjuice:jules begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- When running terminal commands through Jules, prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` only when exact raw output bytes are required.",
        "<!-- tokenjuice:jules end -->",
        "<!-- tokenjuice:jules end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorJulesInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Jules instructions have malformed tokenjuice markers");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
    await expect(installJulesInstructions(instructionsPath)).rejects.toThrow("cannot safely repair malformed tokenjuice markers");
    await expect(uninstallJulesInstructions(instructionsPath)).rejects.toThrow(
      "cannot safely uninstall malformed tokenjuice markers",
    );
  });

  it("uses JULES_PROJECT_DIR for the default AGENTS.md path", async () => {
    const home = await createTempDir();
    process.env.JULES_PROJECT_DIR = home;

    const installed = await installJulesInstructions();
    const expectedInstructionsPath = join(home, "AGENTS.md");
    const doctor = await doctorJulesInstructions();

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

    const installed = await installJulesInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, "AGENTS.md"));
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toContain("Jules");
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installJulesInstructions(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["jules"].instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(report.integrations["jules"].status).toBe("ok");
  });
});
