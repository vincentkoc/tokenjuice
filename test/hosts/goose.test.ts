import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorGooseHints,
  doctorInstalledHooks,
  installGooseHints,
  uninstallGooseHints,
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
  "PI_CODING_AGENT_DIR",
  "QWEN_PROJECT_DIR",
  "ROO_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-goose-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("goose hints", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:begin -->/gu)?.length ?? 0;
  }

  it("installs a marker-delimited hints block", async () => {
    const home = await createTempDir();
    const hintsPath = join(home, ".goosehints");

    const result = await installGooseHints(hintsPath);
    const hints = await readFile(hintsPath, "utf8");

    expect(result.hintsPath).toBe(hintsPath);
    expect(result.backupPath).toBeUndefined();
    expect(hints).toContain("<!-- tokenjuice:begin -->");
    expect(hints).toContain("tokenjuice terminal output compaction");
    expect(hints).toContain("tokenjuice wrap -- <command>");
    expect(hints).toContain("tokenjuice wrap --raw -- <command>");
    expect(hints).toContain("Restart your Goose session");
    expect(hints).not.toContain("wrap --full");
  });

  it("preserves existing hints and backs them up", async () => {
    const home = await createTempDir();
    const hintsPath = join(home, ".goosehints");
    await installGooseHints(hintsPath);
    await writeFile(hintsPath, "# project hints\n\n- keep this\n", "utf8");

    const result = await installGooseHints(hintsPath);
    const hints = await readFile(hintsPath, "utf8");

    expect(result.backupPath).toBe(`${hintsPath}.bak`);
    await expect(readFile(`${hintsPath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(hints).toContain("- keep this");
    expect(hints).toContain("<!-- tokenjuice:begin -->");
  });

  it("replaces stale tokenjuice hints without duplicating the block", async () => {
    const home = await createTempDir();
    const hintsPath = join(home, ".goosehints");
    await writeFile(
      hintsPath,
      [
        "# project hints",
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

    await installGooseHints(hintsPath);
    const hints = await readFile(hintsPath, "utf8");

    expect(hints).toContain("- keep this");
    expect(hints).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(hints)).toBe(1);
  });

  it("reports installed and uninstalled hints health", async () => {
    const home = await createTempDir();
    const hintsPath = join(home, ".goosehints");

    await installGooseHints(hintsPath);
    const installed = await doctorGooseHints(hintsPath);

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("hints-based");

    const removed = await uninstallGooseHints(hintsPath);
    const disabled = await doctorGooseHints(hintsPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken hints with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const hintsPath = join(home, ".goosehints");
    await writeFile(hintsPath, "<!-- tokenjuice:begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorGooseHints(hintsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("without an end marker");
  });

  it("reports a healthy tokenjuice block with extra dangling markers as broken", async () => {
    const home = await createTempDir();
    const hintsPath = join(home, ".goosehints");
    await installGooseHints(hintsPath);
    const healthyHints = await readFile(hintsPath, "utf8");
    await writeFile(hintsPath, `${healthyHints}\n<!-- tokenjuice:begin -->\n`, "utf8");

    const doctor = await doctorGooseHints(hintsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Goose hints have unmatched tokenjuice markers");
    await expect(installGooseHints(hintsPath)).rejects.toThrow("cannot safely repair malformed tokenjuice markers");
    await expect(uninstallGooseHints(hintsPath)).rejects.toThrow("cannot safely uninstall malformed tokenjuice markers");
  });

  it("reports stale guidance as broken", async () => {
    const home = await createTempDir();
    const hintsPath = join(home, ".goosehints");
    await writeFile(
      hintsPath,
      [
        "<!-- tokenjuice:begin -->",
        "## tokenjuice terminal output compaction",
        "",
        "- old guidance says to run tokenjuice wrap --full -- <command>.",
        "<!-- tokenjuice:end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorGooseHints(hintsPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Goose hints are missing tokenjuice wrap guidance");
    expect(doctor.issues).toContain("configured Goose hints are missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Goose hints still suggest the full escape hatch");
  });

  it("leaves unrelated hints untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const hintsPath = join(home, ".goosehints");
    await writeFile(hintsPath, "# project hints\n\n- keep this\n", "utf8");

    const removed = await uninstallGooseHints(hintsPath);
    const hints = await readFile(hintsPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(hints).toBe("# project hints\n\n- keep this\n");
  });

  it("uses GOOSE_PROJECT_DIR for the default hints file", async () => {
    const home = await createTempDir();
    process.env.GOOSE_PROJECT_DIR = home;

    const installed = await installGooseHints();
    const expectedHintsPath = join(home, ".goosehints");
    const doctor = await doctorGooseHints();

    expect(installed.hintsPath).toBe(expectedHintsPath);
    expect(doctor.hintsPath).toBe(expectedHintsPath);
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
    await installGooseHints(undefined, { projectDir: home });

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.goose.status).toBe("ok");
    expect(report.integrations.goose.hintsPath).toBe(join(home, ".goosehints"));
  });

  it("installs into the git root when run from a nested directory", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installGooseHints();
    const expectedHintsPath = join(await realpath(home), ".goosehints");

    expect(installed.hintsPath).toBe(expectedHintsPath);
    expect(await readFile(join(home, ".goosehints"), "utf8")).toContain("tokenjuice wrap -- <command>");
    await expect(access(join(nestedDir, ".goosehints"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the root install target when repairing a nested tokenjuice block", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(nestedDir, ".goosehints"),
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(nestedDir);

    const installed = await installGooseHints();
    const afterInstall = await doctorGooseHints();

    expect(installed.hintsPaths).toEqual([
      join(await realpath(home), ".goosehints"),
      join(await realpath(nestedDir), ".goosehints"),
    ]);
    expect(afterInstall.status).toBe("ok");
    expect(await readFile(join(home, ".goosehints"), "utf8")).toContain("tokenjuice wrap -- <command>");
    expect(await readFile(join(nestedDir, ".goosehints"), "utf8")).not.toContain("wrap --full");
  });

  it("uses explicit projectDir as the parent-chain scan boundary", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    await installGooseHints(undefined, { projectDir: home });
    await writeFile(
      join(nestedDir, ".goosehints"),
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(nestedDir);

    const beforeRepair = await doctorGooseHints(undefined, { projectDir: home });
    const repaired = await installGooseHints(undefined, { projectDir: home });
    const afterRepair = await doctorGooseHints(undefined, { projectDir: home });

    expect(beforeRepair.status).toBe("broken");
    expect(beforeRepair.hintsPath).toBe(join(await realpath(nestedDir), ".goosehints"));
    expect(repaired.hintsPaths).toEqual([
      join(home, ".goosehints"),
      join(await realpath(nestedDir), ".goosehints"),
    ]);
    expect(afterRepair.status).toBe("ok");
    expect(await readFile(join(nestedDir, ".goosehints"), "utf8")).not.toContain("wrap --full");
  });

  it("repairs and removes tokenjuice hints elsewhere in the project tree from the root", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(nestedDir, ".goosehints"),
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(home);

    const beforeRepair = await doctorGooseHints();
    const repaired = await installGooseHints();
    const afterRepair = await doctorGooseHints();
    const removed = await uninstallGooseHints();
    const disabled = await doctorGooseHints();

    expect(beforeRepair.status).toBe("broken");
    expect(beforeRepair.hintsPath).toBe(join(await realpath(nestedDir), ".goosehints"));
    expect(repaired.hintsPaths).toEqual([
      join(await realpath(home), ".goosehints"),
      join(await realpath(nestedDir), ".goosehints"),
    ]);
    expect(afterRepair.status).toBe("ok");
    expect(removed.removedPaths).toEqual([
      join(await realpath(home), ".goosehints"),
      join(await realpath(nestedDir), ".goosehints"),
    ]);
    expect(disabled.status).toBe("disabled");
    await expect(access(join(home, ".goosehints"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(nestedDir, ".goosehints"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("repairs and removes loaded parent-chain tokenjuice hints from nested directories", async () => {
    const home = await createTempDir();
    const nestedDir = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await installGooseHints(join(home, ".goosehints"));
    await writeFile(
      join(nestedDir, ".goosehints"),
      "<!-- tokenjuice:begin -->\nstale tokenjuice wrap --full -- <command>\n<!-- tokenjuice:end -->\n",
      "utf8",
    );
    process.chdir(nestedDir);

    const beforeRepair = await doctorGooseHints();
    const repaired = await installGooseHints();
    const removed = await uninstallGooseHints();
    const disabled = await doctorGooseHints();

    expect(beforeRepair.status).toBe("broken");
    expect(beforeRepair.hintsPath).toBe(join(await realpath(nestedDir), ".goosehints"));
    expect(repaired.hintsPaths).toEqual([
      join(await realpath(home), ".goosehints"),
      join(await realpath(nestedDir), ".goosehints"),
    ]);
    expect(removed.removedPaths).toEqual([
      join(await realpath(nestedDir), ".goosehints"),
      join(await realpath(home), ".goosehints"),
    ]);
    expect(disabled.status).toBe("disabled");
    await expect(access(join(home, ".goosehints"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(nestedDir, ".goosehints"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the default hints file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.GOOSE_PROJECT_DIR = home;
    const hintsPath = join(home, ".goosehints");

    await installGooseHints();
    await uninstallGooseHints(hintsPath);

    await expect(access(hintsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
