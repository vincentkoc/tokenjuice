import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorPlandexConvention,
  installPlandexConvention,
  uninstallPlandexConvention,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();
const envKeys = [
  "AIDER_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-plandex-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("plandex convention", () => {
  it("installs a context convention file with the tokenjuice escape hatch", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");

    const result = await installPlandexConvention(conventionPath);
    const convention = await readFile(conventionPath, "utf8");

    expect(result.conventionPath).toBe(conventionPath);
    expect(result.backupPath).toBeUndefined();
    expect(convention).toContain("tokenjuice terminal output compaction");
    expect(convention).toContain("tokenjuice wrap -- <command>");
    expect(convention).toContain("tokenjuice wrap --raw -- <command>");
    expect(convention).toContain("plandex load PLANDEX.tokenjuice.md");
    expect(convention).toContain("tokenjuice wrap -- <command> | plandex load");
    expect(convention).not.toContain("wrap --full");
  });

  it("backs up an existing convention before replacing it", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");
    await installPlandexConvention(conventionPath);
    await writeFile(conventionPath, "custom local convention\n", "utf8");

    const result = await installPlandexConvention(conventionPath);

    expect(result.backupPath).toBe(`${conventionPath}.bak`);
    await expect(readFile(`${conventionPath}.bak`, "utf8")).resolves.toBe("custom local convention\n");
    await expect(readFile(conventionPath, "utf8")).resolves.toContain("tokenjuice wrap --raw -- <command>");
  });

  it("restores a backed-up custom convention on uninstall", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");
    await writeFile(conventionPath, "custom local convention\n", "utf8");
    await installPlandexConvention(conventionPath);

    const removed = await uninstallPlandexConvention(conventionPath);

    expect(removed.removed).toBe(true);
    await expect(readFile(conventionPath, "utf8")).resolves.toBe("custom local convention\n");
    await expect(access(`${conventionPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves a custom backup when repairing tokenjuice-owned conventions", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");
    await writeFile(conventionPath, "custom local convention\n", "utf8");
    await installPlandexConvention(conventionPath);
    await writeFile(
      conventionPath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const repaired = await installPlandexConvention(conventionPath);

    expect(repaired.backupPath).toBe(`${conventionPath}.tokenjuice.bak`);
    await expect(readFile(`${conventionPath}.bak`, "utf8")).resolves.toBe("custom local convention\n");
    await expect(readFile(`${conventionPath}.tokenjuice.bak`, "utf8")).resolves.toContain("wrap --full");
  });

  it("reports installed and uninstalled convention health", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");

    await installPlandexConvention(conventionPath);
    const installed = await doctorPlandexConvention(conventionPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("context-based");

    const removed = await uninstallPlandexConvention(conventionPath);
    const disabled = await doctorPlandexConvention(conventionPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken conventions when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");
    await writeFile(
      conventionPath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorPlandexConvention(conventionPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Plandex convention file is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Plandex convention file is missing Plandex load guidance");
    expect(doctor.issues).toContain("configured Plandex convention file still suggests the full escape hatch");
  });

  it("removes stale tokenjuice-owned convention files", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");
    await writeFile(
      conventionPath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const removed = await uninstallPlandexConvention(conventionPath);

    expect(removed.removed).toBe(true);
    await expect(access(conventionPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("treats custom convention files as not installed", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");
    await writeFile(conventionPath, "custom local convention\n", "utf8");

    const doctor = await doctorPlandexConvention(conventionPath);

    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("tokenjuice Plandex convention file is not installed");
  });

  it("does not claim custom conventions that mention tokenjuice commands", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");
    await writeFile(conventionPath, "custom note: use tokenjuice wrap -- <command>\n", "utf8");

    const doctor = await doctorPlandexConvention(conventionPath);

    expect(doctor.status).toBe("disabled");
    await expect(uninstallPlandexConvention(conventionPath)).rejects.toThrow(
      "does not look like the tokenjuice Plandex convention",
    );
    await expect(readFile(conventionPath, "utf8")).resolves.toContain("custom note");
  });

  it("refuses to remove a non-tokenjuice convention file", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");
    await writeFile(conventionPath, "custom local convention\n", "utf8");

    await expect(uninstallPlandexConvention(conventionPath)).rejects.toThrow(
      "does not look like the tokenjuice Plandex convention",
    );

    await expect(readFile(conventionPath, "utf8")).resolves.toBe("custom local convention\n");
  });

  it("does not report custom convention files as installed in aggregate doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await writeFile(join(home, "PLANDEX.tokenjuice.md"), "custom local convention\n", "utf8");

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.plandex.status).toBe("disabled");
  });

  it("uses PLANDEX_PROJECT_DIR for the default convention file", async () => {
    const home = await createTempDir();
    process.env.PLANDEX_PROJECT_DIR = home;

    const installed = await installPlandexConvention();
    const expectedConventionPath = join(home, "PLANDEX.tokenjuice.md");
    const doctor = await doctorPlandexConvention();

    expect(installed.conventionPath).toBe(expectedConventionPath);
    expect(doctor.conventionPath).toBe(expectedConventionPath);
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
    await installPlandexConvention(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.plandex.status).toBe("ok");
    expect(report.integrations.plandex.conventionPath).toBe(join(home, "PLANDEX.tokenjuice.md"));
  });

  it("installs into the git root when run from a nested directory", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installPlandexConvention();
    const expectedConventionPath = join(await realpath(home), "PLANDEX.tokenjuice.md");

    expect(installed.conventionPath).toBe(expectedConventionPath);
    expect(await readFile(join(home, "PLANDEX.tokenjuice.md"), "utf8")).toContain("plandex load PLANDEX.tokenjuice.md");
    await expect(access(join(nestedDir, "PLANDEX.tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the default convention file", async () => {
    const home = await createTempDir();
    process.env.PLANDEX_PROJECT_DIR = home;
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");

    await installPlandexConvention();
    await uninstallPlandexConvention();

    await expect(access(conventionPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses projectDir when uninstalling the default convention file", async () => {
    const home = await createTempDir();
    const conventionPath = join(home, "PLANDEX.tokenjuice.md");

    await installPlandexConvention(undefined, { projectDir: home });
    const removed = await uninstallPlandexConvention(undefined, { projectDir: home });

    expect(removed.conventionPath).toBe(conventionPath);
    expect(removed.removed).toBe(true);
    await expect(access(conventionPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
