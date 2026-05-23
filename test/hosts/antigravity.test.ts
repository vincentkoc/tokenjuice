import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAntigravityRule,
  doctorInstalledHooks,
  installAntigravityRule,
  uninstallAntigravityRule,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();
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
  "GOOSE_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-antigravity-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("antigravity rules", () => {
  it("installs an always-on workspace rule", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");

    const result = await installAntigravityRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("activation: always_on");
    expect(rule).toContain("<!-- tokenjuice:antigravity-rule -->");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).toContain("terminal commands through Google Antigravity IDE or CLI (`agy`)");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("backs up an existing rule file before replacing it", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");
    await installAntigravityRule(rulePath);
    await writeFile(rulePath, "# local Antigravity rule\n\n- keep this\n", "utf8");

    const result = await installAntigravityRule(rulePath);
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).not.toContain("keep this");
  });

  it("restores a backed-up custom rule on uninstall", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");
    await installAntigravityRule(rulePath);

    const removed = await uninstallAntigravityRule(rulePath);

    expect(removed.removed).toBe(true);
    await expect(readFile(rulePath, "utf8")).resolves.toBe("# custom local rule\n");
    await expect(access(`${rulePath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves a custom backup when repairing tokenjuice-owned rules", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");
    await installAntigravityRule(rulePath);
    await writeFile(
      rulePath,
      [
        "---",
        "activation: manual",
        "---",
        "",
        "<!-- tokenjuice:antigravity-rule -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const repaired = await installAntigravityRule(rulePath);

    expect(repaired.backupPath).toBe(`${rulePath}.tokenjuice.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toBe("# custom local rule\n");
    await expect(readFile(`${rulePath}.tokenjuice.bak`, "utf8")).resolves.toContain("wrap --full");
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");

    await installAntigravityRule(rulePath);
    const installed = await doctorAntigravityRule(rulePath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallAntigravityRule(rulePath);
    const disabled = await doctorAntigravityRule(rulePath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken rules missing tokenjuice guidance", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "---",
        "activation: manual",
        "---",
        "",
        "<!-- tokenjuice:antigravity-rule -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAntigravityRule(rulePath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Antigravity rule file is missing always-on activation frontmatter");
    expect(doctor.issues).toContain("configured Antigravity rule file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Antigravity rule file still suggests the full escape hatch");
  });

  it("treats unowned rule files as disabled", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");

    const doctor = await doctorAntigravityRule(rulePath);

    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("tokenjuice Antigravity rule is not installed; existing rule file is not tokenjuice-managed");
  });

  it("refuses to remove a non-tokenjuice rule file", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom local rule\n", "utf8");

    await expect(uninstallAntigravityRule(rulePath)).rejects.toThrow(
      "does not look like the tokenjuice Antigravity rule",
    );

    await expect(readFile(rulePath, "utf8")).resolves.toBe("# custom local rule\n");
  });

  it("does not claim custom rules that mention tokenjuice commands", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(rulePath, "# custom note\n\n- use tokenjuice wrap -- <command>\n", "utf8");

    const doctor = await doctorAntigravityRule(rulePath);

    expect(doctor.status).toBe("disabled");
    await expect(uninstallAntigravityRule(rulePath)).rejects.toThrow(
      "does not look like the tokenjuice Antigravity rule",
    );
    await expect(readFile(rulePath, "utf8")).resolves.toContain("custom note");
  });

  it("does not claim custom rules that use the tokenjuice heading", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");
    await mkdir(join(home, ".agents", "rules"), { recursive: true });
    await writeFile(rulePath, "# tokenjuice terminal output compaction\n\n- custom rule\n", "utf8");

    const doctor = await doctorAntigravityRule(rulePath);

    expect(doctor.status).toBe("disabled");
    await expect(uninstallAntigravityRule(rulePath)).rejects.toThrow(
      "does not look like the tokenjuice Antigravity rule",
    );
    await expect(readFile(rulePath, "utf8")).resolves.toContain("custom rule");
  });

  it("uses ANTIGRAVITY_PROJECT_DIR for the default rule file", async () => {
    const home = await createTempDir();
    process.env.ANTIGRAVITY_PROJECT_DIR = home;

    const installed = await installAntigravityRule();
    const expectedRulePath = join(home, ".agents", "rules", "tokenjuice.md");
    const doctor = await doctorAntigravityRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
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
    process.env.GROK_HOME = join(configHome, ".grok");
    process.env.COPILOT_HOME = join(configHome, ".copilot");
    process.env.PI_CODING_AGENT_DIR = join(configHome, ".pi", "agent");
    process.env.OPENCODE_CONFIG_DIR = join(configHome, ".config", "opencode");
    process.env.CLINE_HOOKS_DIR = join(configHome, "Cline", "Hooks");
    await installAntigravityRule(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.antigravity.status).toBe("ok");
    expect(report.integrations.antigravity.rulePath).toBe(join(home, ".agents", "rules", "tokenjuice.md"));
  });

  it("uses the nearest git root for the default rule file", async () => {
    const repo = await createTempDir();
    const nestedDir = join(repo, "src", "nested");
    await mkdir(join(repo, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installAntigravityRule();
    const expectedRulePath = join(await realpath(repo), ".agents", "rules", "tokenjuice.md");
    const doctor = await doctorAntigravityRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
    await expect(access(join(nestedDir, ".agents", "rules", "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the default rule file when uninstalling", async () => {
    const home = await createTempDir();
    process.env.ANTIGRAVITY_PROJECT_DIR = home;
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");

    await installAntigravityRule();
    await uninstallAntigravityRule();

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses projectDir when uninstalling the default rule file", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".agents", "rules", "tokenjuice.md");

    await installAntigravityRule(undefined, { projectDir: home });
    const removed = await uninstallAntigravityRule(undefined, { projectDir: home });

    expect(removed.rulePath).toBe(rulePath);
    expect(removed.removed).toBe(true);
    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
