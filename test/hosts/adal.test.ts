import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAdalInstructions,
  doctorInstalledHooks,
  installAdalInstructions,
  uninstallAdalInstructions,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "ADAL_PROJECT_DIR",
  "AGENTS_CLI_HOME",
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "BOB_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEBUFF_PROJECT_DIR",
  "CODEGEN_PROJECT_DIR",
  "CODEX_HOME",
  "CONTINUE_PROJECT_DIR",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CURSOR_HOME",
  "DEEPAGENTS_PROJECT_DIR",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GITLAB_DUO_PROJECT_DIR",
  "GROK_BUILD_PROJECT_DIR",
  "GPTME_PROJECT_DIR",
  "HOME",
  "JETBRAINS_AI_PROJECT_DIR",
  "JULES_PROJECT_DIR",
  "JUNIE_PROJECT_DIR",
  "KILO_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KIRO_PROJECT_DIR",
  "MISTRAL_VIBE_PROJECT_DIR",
  "MUX_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPENWEBUI_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "PLANDEX_PROJECT_DIR",
  "QODER_PROJECT_DIR",
  "QWEN_PROJECT_DIR",
  "REPLIT_PROJECT_DIR",
  "ROO_PROJECT_DIR",
  "ROVO_DEV_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "TABNINE_PROJECT_DIR",
  "TRAE_PROJECT_DIR",
  "UIPATH_PROJECT_DIR",
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
  "ZENCODER_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-adal-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("AdaL CLI instructions", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:adal begin -->/gu)?.length ?? 0;
  }

  it("installs a host-specific marker-delimited AGENTS.md instruction block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    const result = await installAdalInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.instructionsPath).toBe(instructionsPath);
    expect(result.backupPath).toBeUndefined();
    expect(instructions).toContain("<!-- tokenjuice:adal begin -->");
    expect(instructions).toContain("tokenjuice terminal output compaction");
    expect(instructions).toContain("When running terminal commands through AdaL CLI");
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

    await installAdalInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("<!-- tokenjuice:qoder begin -->");
    expect(instructions).toContain("When running terminal commands through Qoder CLI");
    expect(instructions).toContain("<!-- tokenjuice:adal begin -->");
    expect(instructions).toContain("When running terminal commands through AdaL CLI");
  });

  it("preserves existing instructions and backs them up", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await installAdalInstructions(instructionsPath);
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const result = await installAdalInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(result.backupPath).toBe(`${instructionsPath}.bak`);
    await expect(readFile(`${instructionsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(instructions).toContain("- keep this");
    expect(instructions).toContain("<!-- tokenjuice:adal begin -->");
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
        "<!-- tokenjuice:adal begin -->",
        "stale tokenjuice block",
        "<!-- tokenjuice:adal end -->",
      ].join("\n"),
      "utf8",
    );

    await installAdalInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(instructions).toContain("- keep this");
    expect(instructions).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(instructions)).toBe(1);
  });

  it("reports installed and uninstalled instruction health", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");

    await installAdalInstructions(instructionsPath);
    const installed = await doctorAdalInstructions(instructionsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallAdalInstructions(instructionsPath);
    const disabled = await doctorAdalInstructions(instructionsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken instructions with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "<!-- tokenjuice:adal begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorAdalInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken instructions with nested tokenjuice markers", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:adal begin -->",
        "outer guidance",
        "<!-- tokenjuice:adal begin -->",
        "inner guidance",
        "<!-- tokenjuice:adal end -->",
        "<!-- tokenjuice:adal end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAdalInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain(
      "configured AdaL CLI instructions have malformed tokenjuice markers; remove unmatched tokenjuice markers, then run tokenjuice install adal",
    );
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports stale concrete full-output commands", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:adal begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` to preserve exact output.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- npm test`.",
        "<!-- tokenjuice:adal end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAdalInstructions(instructionsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured AdaL CLI instructions still suggest the full escape hatch");
  });

  it("refuses install and uninstall when tokenjuice markers are nested", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(
      instructionsPath,
      [
        "<!-- tokenjuice:adal begin -->",
        "outer guidance",
        "<!-- tokenjuice:adal begin -->",
        "inner guidance",
        "<!-- tokenjuice:adal end -->",
        "<!-- tokenjuice:adal end -->",
      ].join("\n"),
      "utf8",
    );

    await expect(installAdalInstructions(instructionsPath)).rejects.toThrow("cannot safely repair malformed tokenjuice markers");
    await expect(uninstallAdalInstructions(instructionsPath)).rejects.toThrow("cannot safely uninstall malformed tokenjuice markers");
  });

  it("leaves unrelated AGENTS.md content untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const instructionsPath = join(home, "AGENTS.md");
    await writeFile(instructionsPath, "# project instructions\n\n- keep this\n", "utf8");

    const removed = await uninstallAdalInstructions(instructionsPath);
    const instructions = await readFile(instructionsPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(instructions).toBe("# project instructions\n\n- keep this\n");
  });

  it("uses ADAL_PROJECT_DIR for the default AGENTS.md path", async () => {
    const home = await createTempDir();
    process.env.ADAL_PROJECT_DIR = home;

    const installed = await installAdalInstructions();
    const expectedInstructionsPath = join(home, "AGENTS.md");
    const doctor = await doctorAdalInstructions();

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

    const installed = await installAdalInstructions();
    const root = await realpath(home);

    expect(installed.instructionsPath).toBe(join(root, "AGENTS.md"));
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toContain("AdaL CLI");
  });

  it("reports adal in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installAdalInstructions(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.adal.instructionsPath).toBe(join(home, "AGENTS.md"));
    expect(report.integrations.adal.status).toBe("ok");
  });

  it("removes the default AGENTS.md when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.ADAL_PROJECT_DIR = home;
    const instructionsPath = join(home, "AGENTS.md");

    await installAdalInstructions();
    await uninstallAdalInstructions(instructionsPath);

    await expect(access(instructionsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
