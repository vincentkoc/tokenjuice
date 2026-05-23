import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAetherPrompt,
  installAetherPrompt,
  uninstallAetherPrompt,
} from "../../src/index.js";
import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.AETHER_PROJECT_DIR;
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalProjectDir === undefined) {
    delete process.env.AETHER_PROJECT_DIR;
  } else {
    process.env.AETHER_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-aether-test-"));
  tempDirs.push(dir);
  return dir;
}

async function seedAetherSettings(projectDir: string): Promise<string> {
  const settingsPath = join(projectDir, ".aether", "settings.json");
  await mkdir(join(projectDir, ".aether"), { recursive: true });
  await writeFile(
    settingsPath,
    `${JSON.stringify({
      agents: [
        { name: "Build", prompts: [".aether/BUILD.md", "AGENTS.md"] },
        { name: "Fast" },
      ],
    }, null, 2)}\n`,
    "utf8",
  );
  return settingsPath;
}

describe("Aether prompt integration", () => {
  it("installs a prompt source and adds it to every configured Aether agent", async () => {
    const home = await createTempDir();
    const settingsPath = await seedAetherSettings(home);
    process.env.AETHER_PROJECT_DIR = home;

    const result = await installAetherPrompt();
    const promptPath = join(home, ".aether", "tokenjuice.md");
    const prompt = await readFile(promptPath, "utf8");
    const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
      agents: Array<{ prompts: string[] }>;
    };

    expect(result.promptPath).toBe(promptPath);
    expect(result.settingsPath).toBe(settingsPath);
    expect(result.settingsBackupPath).toBe(`${settingsPath}.bak`);
    expect(result.agentsUpdated).toBe(2);
    expect(prompt).toContain("tokenjuice Aether terminal output compaction");
    expect(prompt).toContain("tokenjuice wrap -- <command>");
    expect(prompt).toContain("tokenjuice wrap --raw -- <command>");
    expect(prompt).toContain("aether show-prompt");
    expect(prompt).not.toContain("wrap --full");
    expect(settings.agents[0]?.prompts).toEqual([".aether/BUILD.md", "AGENTS.md", ".aether/tokenjuice.md"]);
    expect(settings.agents[1]?.prompts).toEqual([".aether/tokenjuice.md"]);
  });

  it("backs up existing prompt and settings files before replacing them", async () => {
    const home = await createTempDir();
    const settingsPath = await seedAetherSettings(home);
    const promptPath = join(home, ".aether", "tokenjuice.md");
    process.env.AETHER_PROJECT_DIR = home;
    await writeFile(promptPath, "custom prompt\n", "utf8");

    const result = await installAetherPrompt();

    expect(result.backupPath).toBe(`${promptPath}.bak`);
    expect(result.settingsBackupPath).toBe(`${settingsPath}.bak`);
    await expect(readFile(`${promptPath}.bak`, "utf8")).resolves.toBe("custom prompt\n");
    await expect(readFile(`${settingsPath}.bak`, "utf8")).resolves.toContain("\"Build\"");
    await expect(readFile(promptPath, "utf8")).resolves.toContain("tokenjuice:aether-restore-backup=.bak");
  });

  it("does not overwrite existing prompt or settings backups", async () => {
    const home = await createTempDir();
    const settingsPath = await seedAetherSettings(home);
    const promptPath = join(home, ".aether", "tokenjuice.md");
    process.env.AETHER_PROJECT_DIR = home;
    await writeFile(promptPath, "custom prompt\n", "utf8");
    await writeFile(`${promptPath}.bak`, "older prompt backup\n", "utf8");
    await writeFile(`${settingsPath}.bak`, "older settings backup\n", "utf8");

    const result = await installAetherPrompt();

    expect(result.backupPath).toBe(`${promptPath}.bak.1`);
    expect(result.settingsBackupPath).toBe(`${settingsPath}.bak.1`);
    await expect(readFile(`${promptPath}.bak`, "utf8")).resolves.toBe("older prompt backup\n");
    await expect(readFile(`${promptPath}.bak.1`, "utf8")).resolves.toBe("custom prompt\n");
    await expect(readFile(`${settingsPath}.bak`, "utf8")).resolves.toBe("older settings backup\n");
    await expect(readFile(`${settingsPath}.bak.1`, "utf8")).resolves.toContain("\"Build\"");
    await expect(readFile(promptPath, "utf8")).resolves.toContain("tokenjuice:aether-restore-backup=.bak.1");
  });

  it("does not create backups for idempotent reinstalls", async () => {
    const home = await createTempDir();
    const settingsPath = await seedAetherSettings(home);
    const promptPath = join(home, ".aether", "tokenjuice.md");
    process.env.AETHER_PROJECT_DIR = home;

    await installAetherPrompt();
    const settingsAfterFirstInstall = await readFile(settingsPath, "utf8");
    const result = await installAetherPrompt();

    expect(result.backupPath).toBeUndefined();
    expect(result.settingsBackupPath).toBeUndefined();
    expect(result.agentsUpdated).toBe(0);
    await expect(readFile(settingsPath, "utf8")).resolves.toBe(settingsAfterFirstInstall);
    await expect(access(`${promptPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(`${settingsPath}.bak.1`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps duplicate agent ownership counts across idempotent reinstalls", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".aether"), { recursive: true });
    const settingsPath = join(home, ".aether", "settings.json");
    process.env.AETHER_PROJECT_DIR = home;
    await writeFile(
      settingsPath,
      `${JSON.stringify({
        agents: [
          { name: "Same", prompts: ["AGENTS.md"] },
          { name: "Same", prompts: ["AGENTS.md"] },
        ],
      }, null, 2)}\n`,
      "utf8",
    );

    await installAetherPrompt();
    await installAetherPrompt();
    await uninstallAetherPrompt();
    const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
      agents: Array<{ prompts?: string[] }>;
    };

    expect(settings.agents[0]?.prompts).toEqual(["AGENTS.md"]);
    expect(settings.agents[1]?.prompts).toEqual(["AGENTS.md"]);
  });

  it("does not embed agent settings in the loaded prompt marker", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".aether"), { recursive: true });
    process.env.AETHER_PROJECT_DIR = home;
    await writeFile(
      join(home, ".aether", "settings.json"),
      `${JSON.stringify({
        agents: [
          {
            name: "Build",
            model: "private-model",
            endpoint: "https://endpoint.example.invalid",
            prompts: ["AGENTS.md"],
          },
        ],
      }, null, 2)}\n`,
      "utf8",
    );

    await installAetherPrompt();
    const prompt = await readFile(join(home, ".aether", "tokenjuice.md"), "utf8");

    expect(prompt).toContain("tokenjuice:aether-settings-added=");
    expect(prompt).not.toContain("private-model");
    expect(prompt).not.toContain("endpoint.example.invalid");
    expect(prompt).not.toContain("AGENTS.md");
  });

  it("restores a backed-up custom prompt on uninstall", async () => {
    const home = await createTempDir();
    const settingsPath = await seedAetherSettings(home);
    const promptPath = join(home, ".aether", "tokenjuice.md");
    process.env.AETHER_PROJECT_DIR = home;
    await writeFile(promptPath, "custom prompt\n", "utf8");
    await writeFile(`${promptPath}.bak`, "older prompt backup\n", "utf8");

    const installed = await installAetherPrompt();
    const removed = await uninstallAetherPrompt();
    const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
      agents: Array<{ prompts?: string[] }>;
    };

    expect(installed.backupPath).toBe(`${promptPath}.bak.1`);
    expect(removed.removed).toBe(true);
    await expect(readFile(promptPath, "utf8")).resolves.toBe("custom prompt\n");
    await expect(readFile(`${promptPath}.bak`, "utf8")).resolves.toBe("older prompt backup\n");
    await expect(access(`${promptPath}.bak.1`)).rejects.toMatchObject({ code: "ENOENT" });
    expect(settings.agents.flatMap((agent) => agent.prompts ?? [])).not.toContain(".aether/tokenjuice.md");
  });

  it("preserves pre-existing Aether prompt references when uninstalling", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".aether"), { recursive: true });
    const settingsPath = join(home, ".aether", "settings.json");
    const promptPath = join(home, ".aether", "tokenjuice.md");
    process.env.AETHER_PROJECT_DIR = home;
    await writeFile(
      settingsPath,
      `${JSON.stringify({
        prompts: ["AGENTS.md", ".aether/tokenjuice.md"],
        agents: [
          { name: "Inherited" },
          { name: "Custom", prompts: [".aether/CUSTOM.md"] },
        ],
      }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(promptPath, "custom prompt\n", "utf8");

    await installAetherPrompt();
    await uninstallAetherPrompt();
    const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
      prompts: string[];
      agents: Array<{ prompts?: string[] }>;
    };

    expect(settings.prompts).toEqual(["AGENTS.md", ".aether/tokenjuice.md"]);
    expect(settings.agents[0]).not.toHaveProperty("prompts");
    expect(settings.agents[1]?.prompts).toEqual([".aether/CUSTOM.md"]);
    await expect(readFile(promptPath, "utf8")).resolves.toBe("custom prompt\n");
  });

  it("removes only the per-agent prompt references added by install", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".aether"), { recursive: true });
    const settingsPath = join(home, ".aether", "settings.json");
    process.env.AETHER_PROJECT_DIR = home;
    await writeFile(
      settingsPath,
      `${JSON.stringify({
        agents: [
          { name: "Existing", prompts: [".aether/tokenjuice.md"] },
          { name: "Added", prompts: ["AGENTS.md"] },
        ],
      }, null, 2)}\n`,
      "utf8",
    );

    await installAetherPrompt();
    const installed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      agents: Array<{ model?: string; name: string; prompts?: string[] }>;
    };
    installed.agents = [
      { ...installed.agents[1]!, model: "local", prompts: ["AGENTS.md", "USER.md", ".aether/tokenjuice.md"] },
      installed.agents[0]!,
    ];
    await writeFile(settingsPath, `${JSON.stringify(installed, null, 2)}\n`, "utf8");
    await uninstallAetherPrompt();
    const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
      agents: Array<{ model?: string; name: string; prompts?: string[] }>;
    };

    expect(settings.agents[0]?.name).toBe("Added");
    expect(settings.agents[0]?.model).toBe("local");
    expect(settings.agents[0]?.prompts).toEqual(["AGENTS.md", "USER.md"]);
    expect(settings.agents[1]?.name).toBe("Existing");
    expect(settings.agents[1]?.prompts).toEqual([".aether/tokenjuice.md"]);
  });

  it("refuses duplicate mixed ownership it cannot safely uninstall", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".aether"), { recursive: true });
    const settingsPath = join(home, ".aether", "settings.json");
    const promptPath = join(home, ".aether", "tokenjuice.md");
    process.env.AETHER_PROJECT_DIR = home;
    await writeFile(
      settingsPath,
      `${JSON.stringify({
        agents: [
          { name: "Same", prompts: ["AGENTS.md", ".aether/tokenjuice.md"] },
          { name: "Same", prompts: ["AGENTS.md"] },
        ],
      }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(promptPath, "custom prompt\n", "utf8");

    await expect(installAetherPrompt()).rejects.toThrow(/duplicate ownership/u);

    await expect(readFile(promptPath, "utf8")).resolves.toBe("custom prompt\n");
  });

  it("leaves the tokenjuice prompt in place when edited settings ownership is ambiguous", async () => {
    const home = await createTempDir();
    const settingsPath = await seedAetherSettings(home);
    const promptPath = join(home, ".aether", "tokenjuice.md");
    process.env.AETHER_PROJECT_DIR = home;

    await installAetherPrompt();
    const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
      agents: Array<{ name: string; prompts?: string[] }>;
    };
    settings.agents[0]!.name = "Renamed";
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");

    const result = await uninstallAetherPrompt();
    const prompt = await readFile(promptPath, "utf8");
    const uninstalledSettings = JSON.parse(await readFile(settingsPath, "utf8")) as {
      agents: Array<{ name: string; prompts?: string[] }>;
    };

    expect(result.removed).toBe(false);
    expect(prompt).toContain("tokenjuice Aether terminal output compaction");
    expect(uninstalledSettings.agents[0]?.prompts).toContain(".aether/tokenjuice.md");
    expect(uninstalledSettings.agents[1]?.prompts ?? []).not.toContain(".aether/tokenjuice.md");
  });

  it("leaves non-tokenjuice prompts untouched on uninstall", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".aether"), { recursive: true });
    const promptPath = join(home, ".aether", "tokenjuice.md");
    await writeFile(
      join(home, ".aether", "settings.json"),
      `${JSON.stringify({ agents: [{ name: "Build", prompts: [".aether/tokenjuice.md"] }] }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(promptPath, "custom prompt\n", "utf8");
    process.env.AETHER_PROJECT_DIR = home;

    const result = await uninstallAetherPrompt();

    expect(result.removed).toBe(false);
    expect(result.promptsRemoved).toBe(0);
    await expect(readFile(promptPath, "utf8")).resolves.toBe("custom prompt\n");
    await expect(readFile(join(home, ".aether", "settings.json"), "utf8")).resolves.toContain(".aether/tokenjuice.md");
    const doctor = await doctorAetherPrompt();
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("rejects symlinked prompt restore backups before uninstall rewrites settings", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const settingsPath = await seedAetherSettings(home);
    const promptPath = join(home, ".aether", "tokenjuice.md");
    process.env.AETHER_PROJECT_DIR = home;
    await writeFile(promptPath, "custom prompt\n", "utf8");
    await installAetherPrompt();
    const settingsBeforeUninstall = await readFile(settingsPath, "utf8");
    await rm(`${promptPath}.bak`);
    await writeFile(join(outside, "private-prompt.md"), "private prompt\n", "utf8");
    await symlink(join(outside, "private-prompt.md"), `${promptPath}.bak`);

    await expect(uninstallAetherPrompt()).rejects.toThrow(/will not read or write through instruction symlinks/u);

    await expect(readFile(settingsPath, "utf8")).resolves.toBe(settingsBeforeUninstall);
    await expect(readFile(join(outside, "private-prompt.md"), "utf8")).resolves.toBe("private prompt\n");
  });

  it("preserves agents that inherit top-level prompt defaults", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".aether"), { recursive: true });
    await writeFile(
      join(home, ".aether", "settings.json"),
      `${JSON.stringify({
        prompts: ["AGENTS.md"],
        agents: [
          { name: "Build" },
          { name: "Custom", prompts: [".aether/CUSTOM.md"] },
        ],
      }, null, 2)}\n`,
      "utf8",
    );
    process.env.AETHER_PROJECT_DIR = home;

    await installAetherPrompt();
    const installed = JSON.parse(await readFile(join(home, ".aether", "settings.json"), "utf8")) as {
      prompts: string[];
      agents: Array<{ prompts?: string[] }>;
    };

    expect(installed.prompts).toEqual(["AGENTS.md", ".aether/tokenjuice.md"]);
    expect(installed.agents[0]).not.toHaveProperty("prompts");
    expect(installed.agents[1]?.prompts).toEqual([".aether/CUSTOM.md", ".aether/tokenjuice.md"]);

    await uninstallAetherPrompt();
    const uninstalled = JSON.parse(await readFile(join(home, ".aether", "settings.json"), "utf8")) as {
      prompts: string[];
      agents: Array<{ prompts?: string[] }>;
    };

    expect(uninstalled.prompts).toEqual(["AGENTS.md"]);
    expect(uninstalled.agents[0]).not.toHaveProperty("prompts");
    expect(uninstalled.agents[1]?.prompts).toEqual([".aether/CUSTOM.md"]);
  });

  it("reports installed and uninstalled prompt health", async () => {
    const home = await createTempDir();
    await seedAetherSettings(home);
    process.env.AETHER_PROJECT_DIR = home;

    await installAetherPrompt();
    const installed = await doctorAetherPrompt();

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("prompt-source");

    const removed = await uninstallAetherPrompt();
    const disabled = await doctorAetherPrompt();
    const settings = JSON.parse(await readFile(join(home, ".aether", "settings.json"), "utf8")) as {
      agents: Array<{ prompts: string[] }>;
    };

    expect(removed.removed).toBe(true);
    expect(removed.promptsRemoved).toBe(2);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    expect(settings.agents.flatMap((agent) => agent.prompts)).not.toContain(".aether/tokenjuice.md");
    await expect(access(join(home, ".aether", "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("counts orphaned Aether settings refs as installed repair evidence", async () => {
    const home = await createTempDir();
    await seedAetherSettings(home);
    process.env.AETHER_PROJECT_DIR = home;
    await installAetherPrompt();
    await rm(join(home, ".aether", "tokenjuice.md"));

    const doctor = await doctorAetherPrompt();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(isInstalledHookIntegration(doctor)).toBe(true);
  });

  it("reports broken health for stale prompt guidance", async () => {
    const home = await createTempDir();
    await seedAetherSettings(home);
    await writeFile(
      join(home, ".aether", "tokenjuice.md"),
      [
        "# tokenjuice Aether terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );
    process.env.AETHER_PROJECT_DIR = home;

    const doctor = await doctorAetherPrompt();

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Aether prompt is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Aether prompt is missing prompt verification guidance");
    expect(doctor.issues).toContain("configured Aether prompt still suggests the full escape hatch");
  });

  it("refuses default install before Aether initializes settings", async () => {
    const home = await createTempDir();
    process.env.AETHER_PROJECT_DIR = home;

    await expect(installAetherPrompt()).rejects.toThrow("run aether once");

    const doctor = await doctorAetherPrompt();
    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues).toContain("tokenjuice Aether prompt is not installed");
    expect(doctor.issues).toContain("Aether project is not initialized; run `aether` once before installing tokenjuice prompt guidance");
  });

  it("keeps malformed unrelated settings disabled when tokenjuice is absent", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".aether"), { recursive: true });
    await writeFile(join(home, ".aether", "settings.json"), "{not json\n", "utf8");
    process.env.AETHER_PROJECT_DIR = home;

    const doctor = await doctorAetherPrompt();

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues).toContain("tokenjuice Aether prompt is not installed");
    expect(doctor.issues[1]).toContain("not valid JSON");
  });

  it("reports broken settings JSON when the tokenjuice prompt exists", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".aether"), { recursive: true });
    await writeFile(join(home, ".aether", "settings.json"), "{not json\n", "utf8");
    await writeFile(join(home, ".aether", "tokenjuice.md"), "# tokenjuice Aether terminal output compaction\n", "utf8");
    process.env.AETHER_PROJECT_DIR = home;

    const doctor = await doctorAetherPrompt();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues[0]).toContain("not valid JSON");
  });

  it("rejects sidecar symlinks before installing prompt and settings files", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await seedAetherSettings(home);
    process.env.AETHER_PROJECT_DIR = home;
    await writeFile(join(outside, "prompt-bak.md"), "# private prompt backup\n", "utf8");
    await writeFile(join(outside, "prompt-tmp.md"), "# private prompt temp\n", "utf8");
    await writeFile(join(outside, "settings-bak.json"), "{}\n", "utf8");
    await writeFile(join(outside, "settings-tmp.json"), "{}\n", "utf8");

    await symlink(join(outside, "prompt-bak.md"), join(home, ".aether", "tokenjuice.md.bak"));
    await expect(installAetherPrompt()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await rm(join(home, ".aether", "tokenjuice.md.bak"));

    await symlink(join(outside, "prompt-tmp.md"), join(home, ".aether", "tokenjuice.md.tmp"));
    await expect(installAetherPrompt()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await rm(join(home, ".aether", "tokenjuice.md.tmp"));

    await symlink(join(outside, "settings-bak.json"), join(home, ".aether", "settings.json.bak"));
    await expect(installAetherPrompt()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await rm(join(home, ".aether", "settings.json.bak"));

    await symlink(join(outside, "settings-tmp.json"), join(home, ".aether", "settings.json.tmp"));
    await expect(installAetherPrompt()).rejects.toThrow(/will not read or write through instruction symlinks/u);

    await expect(readFile(join(outside, "prompt-bak.md"), "utf8")).resolves.toBe("# private prompt backup\n");
    await expect(readFile(join(outside, "prompt-tmp.md"), "utf8")).resolves.toBe("# private prompt temp\n");
    await expect(readFile(join(outside, "settings-bak.json"), "utf8")).resolves.toBe("{}\n");
    await expect(readFile(join(outside, "settings-tmp.json"), "utf8")).resolves.toBe("{}\n");
  });

  it("constrains explicit prompt paths to the project boundary", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsidePromptPath = join(outside, "tokenjuice.md");
    await seedAetherSettings(home);

    process.chdir(home);
    await expect(installAetherPrompt(outsidePromptPath)).rejects.toThrow(/outside/u);
    await expect(installAetherPrompt(outsidePromptPath, { projectDir: home })).rejects.toThrow(/outside/u);
    await expect(uninstallAetherPrompt(outsidePromptPath, { projectDir: home })).rejects.toThrow(/outside/u);

    const doctor = await doctorAetherPrompt(outsidePromptPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("outside");
    expect(doctor.fixCommand).toContain("project-local Aether prompt path");
    await expect(access(outsidePromptPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects custom explicit prompt paths that Aether settings would not load", async () => {
    const home = await createTempDir();
    const customPromptPath = join(home, ".aether", "custom-tokenjuice.md");
    await seedAetherSettings(home);

    await expect(installAetherPrompt(customPromptPath, { projectDir: home })).rejects.toThrow(
      /Aether settings load .aether\/tokenjuice.md/u,
    );

    const doctor = await doctorAetherPrompt(customPromptPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.fixCommand).toContain(".aether/tokenjuice.md");
    await expect(access(customPromptPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects explicit prompt paths under symlinked parents outside projectDir", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const linkedDir = join(home, ".aether-linked");
    const linkedPromptPath = join(linkedDir, "tokenjuice.md");
    await seedAetherSettings(home);
    await symlink(outside, linkedDir);

    await expect(installAetherPrompt(linkedPromptPath, { projectDir: home })).rejects.toThrow(/outside/u);
    await expect(access(join(outside, "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects Aether parent symlinks even when they resolve inside projectDir", async () => {
    const home = await createTempDir();
    const redirectedDir = join(home, "redirected-aether");
    await mkdir(redirectedDir, { recursive: true });
    await writeFile(
      join(redirectedDir, "settings.json"),
      `${JSON.stringify({ agents: [{ name: "Build", prompts: ["AGENTS.md"] }] }, null, 2)}\n`,
      "utf8",
    );
    await symlink(redirectedDir, join(home, ".aether"));

    await expect(installAetherPrompt(undefined, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(redirectedDir, "tokenjuice.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not count an unsafe uninstalled prompt symlink as installed", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await mkdir(join(home, ".aether"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# private prompt\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".aether", "tokenjuice.md"));

    const doctor = await doctorAetherPrompt(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("still counts installed Aether settings when the prompt path becomes unsafe", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await seedAetherSettings(home);
    process.env.AETHER_PROJECT_DIR = home;
    await installAetherPrompt();
    await rm(join(home, ".aether", "tokenjuice.md"));
    await writeFile(join(outside, "private.md"), "# private prompt\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".aether", "tokenjuice.md"));

    const doctor = await doctorAetherPrompt(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(isInstalledHookIntegration(doctor)).toBe(true);
  });

  it("still counts an installed Aether prompt when settings becomes unsafe", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await seedAetherSettings(home);
    process.env.AETHER_PROJECT_DIR = home;
    await installAetherPrompt();
    await rm(join(home, ".aether", "settings.json"));
    await writeFile(join(outside, "settings.json"), "{}\n", "utf8");
    await symlink(join(outside, "settings.json"), join(home, ".aether", "settings.json"));

    const doctor = await doctorAetherPrompt(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(isInstalledHookIntegration(doctor)).toBe(true);
  });

  it("still counts an installed Aether prompt under a symlinked parent", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideAetherDir = join(outside, ".aether");
    await mkdir(outsideAetherDir, { recursive: true });
    await mkdir(join(home, ".aether"), { recursive: true });
    await rm(join(home, ".aether"), { recursive: true, force: true });
    await writeFile(join(outsideAetherDir, "tokenjuice.md"), "# tokenjuice Aether terminal output compaction\n", "utf8");
    await symlink(outsideAetherDir, join(home, ".aether"));

    const doctor = await doctorAetherPrompt(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(isInstalledHookIntegration(doctor)).toBe(true);
  });

  it("does not count unrelated tokenjuice.md files under a symlinked parent", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideAetherDir = join(outside, ".aether");
    await mkdir(outsideAetherDir, { recursive: true });
    await writeFile(join(outsideAetherDir, "tokenjuice.md"), "# unrelated prompt\n", "utf8");
    await symlink(outsideAetherDir, join(home, ".aether"));

    const doctor = await doctorAetherPrompt(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("rejects settings sidecar symlinks before uninstall rewrites settings", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await seedAetherSettings(home);
    process.env.AETHER_PROJECT_DIR = home;
    await installAetherPrompt();
    await writeFile(join(outside, "settings-tmp.json"), "{}\n", "utf8");
    await symlink(join(outside, "settings-tmp.json"), join(home, ".aether", "settings.json.tmp"));

    await expect(uninstallAetherPrompt()).rejects.toThrow(/will not read or write through instruction symlinks/u);

    await expect(readFile(join(outside, "settings-tmp.json"), "utf8")).resolves.toBe("{}\n");
  });

  it("defaults to the git root prompt from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    await seedAetherSettings(home);
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installAetherPrompt();
    const root = await realpath(home);

    expect(installed.promptPath).toBe(join(root, ".aether", "tokenjuice.md"));
    expect(installed.settingsPath).toBe(join(root, ".aether", "settings.json"));
  });
});
