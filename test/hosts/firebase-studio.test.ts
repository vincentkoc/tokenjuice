import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorFirebaseStudioRule,
  doctorInstalledHooks,
  installFirebaseStudioRule,
  uninstallFirebaseStudioRule,
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
  "FIREBASE_STUDIO_PROJECT_DIR",
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
  "REPLIT_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-firebase-studio-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("firebase studio rules", () => {
  it("installs a host-specific marker-delimited .idx/airules.md rule block", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".idx", "airules.md");

    const result = await installFirebaseStudioRule(rulePath);
    const rules = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rules).toContain("<!-- tokenjuice:firebase-studio begin -->");
    expect(rules).toContain("tokenjuice terminal output compaction");
    expect(rules).toContain("When running terminal commands through Gemini in Firebase");
    expect(rules).toContain("tokenjuice wrap -- <command>");
    expect(rules).toContain("tokenjuice wrap --raw -- <command>");
    expect(rules).not.toContain("wrap --full");
  });

  it("coexists with existing Firebase Studio AI rules", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".idx", "airules.md");
    await mkdir(join(home, ".idx"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "# Firebase Studio rules",
        "",
        "- Prefer Firebase emulator tests before deploy.",
        "- Keep generated client code out of manual edits.",
      ].join("\n"),
      "utf8",
    );

    await installFirebaseStudioRule(rulePath);
    const rules = await readFile(rulePath, "utf8");

    expect(rules).toContain("# Firebase Studio rules");
    expect(rules).toContain("Prefer Firebase emulator tests");
    expect(rules).toContain("<!-- tokenjuice:firebase-studio begin -->");
    expect(rules).toContain("When running terminal commands through Gemini in Firebase");
  });

  it("backs up existing rules before replacing its own block", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".idx", "airules.md");
    await installFirebaseStudioRule(rulePath);
    await writeFile(rulePath, "# Firebase Studio rules\n\n- keep this\n", "utf8");

    const result = await installFirebaseStudioRule(rulePath);

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("keep this");
    await expect(readFile(rulePath, "utf8")).resolves.toContain("<!-- tokenjuice:firebase-studio begin -->");
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".idx", "airules.md");

    await installFirebaseStudioRule(rulePath);
    const installed = await doctorFirebaseStudioRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("instruction-based");

    const removed = await uninstallFirebaseStudioRule(rulePath);
    const disabled = await doctorFirebaseStudioRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken rules with unmatched Firebase Studio tokenjuice markers", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".idx", "airules.md");
    await mkdir(join(home, ".idx"), { recursive: true });
    await writeFile(rulePath, "<!-- tokenjuice:firebase-studio begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorFirebaseStudioRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
  });

  it("reports broken rules with nested Firebase Studio tokenjuice markers", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".idx", "airules.md");
    await mkdir(join(home, ".idx"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "<!-- tokenjuice:firebase-studio begin -->",
        "<!-- tokenjuice:firebase-studio begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- When running terminal commands through Gemini in Firebase, prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` only when exact raw output bytes are required.",
        "<!-- tokenjuice:firebase-studio end -->",
        "<!-- tokenjuice:firebase-studio end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorFirebaseStudioRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Firebase Studio rules have malformed tokenjuice markers");
    expect(doctor.fixCommand).toContain("remove unmatched tokenjuice markers");
    await expect(installFirebaseStudioRule(rulePath)).rejects.toThrow("cannot safely repair malformed tokenjuice markers");
    await expect(uninstallFirebaseStudioRule(rulePath)).rejects.toThrow(
      "cannot safely uninstall malformed tokenjuice markers",
    );
  });

  it("uses FIREBASE_STUDIO_PROJECT_DIR for the default airules path", async () => {
    const home = await createTempDir();
    process.env.FIREBASE_STUDIO_PROJECT_DIR = home;

    const installed = await installFirebaseStudioRule();
    const expectedRulePath = join(home, ".idx", "airules.md");
    const doctor = await doctorFirebaseStudioRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
  });

  it("defaults to the git root airules path from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installFirebaseStudioRule();
    const root = await realpath(home);

    expect(installed.rulePath).toBe(join(root, ".idx", "airules.md"));
    await expect(readFile(join(root, ".idx", "airules.md"), "utf8")).resolves.toContain("Gemini in Firebase");
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installFirebaseStudioRule(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations["firebase-studio"].rulePath).toBe(join(home, ".idx", "airules.md"));
    expect(report.integrations["firebase-studio"].status).toBe("ok");
  });
});
