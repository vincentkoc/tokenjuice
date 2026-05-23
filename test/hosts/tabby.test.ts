import { access, chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorTabbySystemPrompt,
  installTabbySystemPrompt,
  uninstallTabbySystemPrompt,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
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
  "GPTME_PROJECT_DIR",
  "HOME",
  "JULES_PROJECT_DIR",
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
  "ROVO_DEV_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "TABBY_CONFIG_DIR",
  "TABBY_HOME",
  "TABBY_ROOT",
  "TABNINE_PROJECT_DIR",
  "TRAE_PROJECT_DIR",
  "UIPATH_PROJECT_DIR",
  "WARP_PROJECT_DIR",
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(async () => {
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-tabby-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("Tabby system prompt", () => {
  it("installs tokenjuice guidance into a fresh Tabby config", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");

    const result = await installTabbySystemPrompt(configPath);
    const config = await readFile(configPath, "utf8");

    expect(result.configPath).toBe(configPath);
    expect(result.backupPath).toBeUndefined();
    expect(config).toContain("[answer]\n# tokenjuice:tabby begin");
    expect(config).toContain("# tokenjuice:tabby begin");
    expect(config).toContain('system_prompt = """');
    expect(config).toContain("tokenjuice terminal output compaction");
    expect(config).toContain("tokenjuice wrap -- <command>");
    expect(config).toContain("tokenjuice wrap --raw -- <command>");
    expect(config).not.toContain("wrap --full");
  });

  it("creates a fresh Tabby config with private permissions", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");

    await installTabbySystemPrompt(configPath);

    expect((await lstat(configPath)).mode & 0o777).toBe(0o600);
  });

  it("adds system_prompt inside an existing answer table without duplicating the table", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, "[model]\nprovider = \"openai\"\n\n[answer]\n# keep answer settings here\n\n[completion]\nmodel = \"tabby\"\n", "utf8");

    await installTabbySystemPrompt(configPath);
    const config = await readFile(configPath, "utf8");

    expect(config.match(/^\[answer\]$/gmu)).toHaveLength(1);
    expect(config).toContain("# keep answer settings here\n\n# tokenjuice:tabby begin\nsystem_prompt");
    expect(config).toContain("[completion]");
  });

  it("backs up existing config before replacing its own block", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await installTabbySystemPrompt(configPath);
    const first = await readFile(configPath, "utf8");

    const result = await installTabbySystemPrompt(configPath);

    expect(result.backupPath).toBe(`${configPath}.bak`);
    await expect(readFile(`${configPath}.bak`, "utf8")).resolves.toBe(first);
    await expect(readFile(configPath, "utf8")).resolves.toContain("# tokenjuice:tabby begin");
  });

  it("backs up existing config without clobbering older backups", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, "[answer]\ntemperature = 0.2\n", "utf8");
    await writeFile(`${configPath}.bak`, "older backup\n", "utf8");

    const result = await installTabbySystemPrompt(configPath);

    expect(result.backupPath).toBe(`${configPath}.bak.1`);
    await expect(readFile(`${configPath}.bak`, "utf8")).resolves.toBe("older backup\n");
    await expect(readFile(`${configPath}.bak.1`, "utf8")).resolves.toBe("[answer]\ntemperature = 0.2\n");
  });

  it("preserves existing config permissions on replacement and backup", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, '[answer]\ntemperature = 0.2\n', "utf8");
    await chmod(configPath, 0o600);

    const result = await installTabbySystemPrompt(configPath);

    expect(result.backupPath).toBe(`${configPath}.bak`);
    expect((await lstat(configPath)).mode & 0o777).toBe(0o600);
    expect((await lstat(`${configPath}.bak`)).mode & 0o777).toBe(0o600);
  });

  it("refuses to overwrite a user-owned system prompt", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, '[answer]\nsystem_prompt = "keep this"\n', "utf8");

    await expect(installTabbySystemPrompt(configPath)).rejects.toThrow("already defines [answer].system_prompt");

    const doctor = await doctorTabbySystemPrompt(configPath);
    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("configured Tabby [answer].system_prompt is user-owned; tokenjuice will not overwrite it automatically");
  });

  it("refuses to overwrite a user-owned dotted system prompt", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, 'answer.system_prompt = "keep this"\n', "utf8");

    await expect(installTabbySystemPrompt(configPath)).rejects.toThrow("already defines [answer].system_prompt");

    const doctor = await doctorTabbySystemPrompt(configPath);
    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("configured Tabby [answer].system_prompt is user-owned; tokenjuice will not overwrite it automatically");
  });

  it("refuses to overwrite quoted user-owned system prompt keys", async () => {
    const home = await createTempDir();
    const tableConfigPath = join(home, "table.toml");
    const dottedConfigPath = join(home, "dotted.toml");
    await writeFile(tableConfigPath, '[answer]\n"system_prompt" = "keep this"\n', "utf8");
    await writeFile(dottedConfigPath, 'answer."system_prompt" = "keep this"\n', "utf8");

    await expect(installTabbySystemPrompt(tableConfigPath)).rejects.toThrow("already defines [answer].system_prompt");
    await expect(installTabbySystemPrompt(dottedConfigPath)).rejects.toThrow("already defines [answer].system_prompt");
  });

  it("refuses to overwrite user-owned system_prompt namespaces", async () => {
    const home = await createTempDir();
    const answerDottedPath = join(home, "answer-dotted.toml");
    const rootDottedPath = join(home, "root-dotted.toml");
    const tablePath = join(home, "table.toml");
    await writeFile(answerDottedPath, '[answer]\nsystem_prompt.text = "keep this"\n', "utf8");
    await writeFile(rootDottedPath, 'answer.system_prompt.text = "keep this"\n', "utf8");
    await writeFile(tablePath, '[answer.system_prompt]\ntext = "keep this"\n', "utf8");

    await expect(installTabbySystemPrompt(answerDottedPath)).rejects.toThrow("already defines [answer].system_prompt");
    await expect(installTabbySystemPrompt(rootDottedPath)).rejects.toThrow("already defines [answer].system_prompt");
    await expect(installTabbySystemPrompt(tablePath)).rejects.toThrow("already defines [answer].system_prompt");

    const doctor = await doctorTabbySystemPrompt(tablePath);
    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("configured Tabby [answer].system_prompt is user-owned; tokenjuice will not overwrite it automatically");
  });

  it("refuses inline answer tables instead of redefining them", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, 'answer = { model = "qwen" }\n', "utf8");

    await expect(installTabbySystemPrompt(configPath)).rejects.toThrow("defines answer as an inline TOML table");

    const doctor = await doctorTabbySystemPrompt(configPath);
    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("configured Tabby answer settings use an inline TOML table; tokenjuice will not rewrite it automatically");
    await expect(readFile(configPath, "utf8")).resolves.toBe('answer = { model = "qwen" }\n');
  });

  it("refuses root answer values instead of redefining them as tables", async () => {
    const home = await createTempDir();
    const scalarConfigPath = join(home, "scalar.toml");
    const arrayConfigPath = join(home, "array.toml");
    await writeFile(scalarConfigPath, 'answer = "custom"\n', "utf8");
    await writeFile(arrayConfigPath, 'answer = ["custom"]\n', "utf8");

    await expect(installTabbySystemPrompt(scalarConfigPath)).rejects.toThrow("defines answer as a root TOML value");
    await expect(installTabbySystemPrompt(arrayConfigPath)).rejects.toThrow("defines answer as a root TOML value");

    const doctor = await doctorTabbySystemPrompt(scalarConfigPath);
    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("configured Tabby answer settings use a root TOML value; tokenjuice will not rewrite it automatically");
    await expect(readFile(scalarConfigPath, "utf8")).resolves.toBe('answer = "custom"\n');
    await expect(readFile(arrayConfigPath, "utf8")).resolves.toBe('answer = ["custom"]\n');
  });

  it("refuses answer arrays of tables instead of redefining them", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, '[[answer]]\nmodel = "qwen"\n', "utf8");

    await expect(installTabbySystemPrompt(configPath)).rejects.toThrow("defines answer as an array of TOML tables");

    const doctor = await doctorTabbySystemPrompt(configPath);
    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("configured Tabby answer settings use an array of TOML tables; tokenjuice will not rewrite it automatically");
    await expect(readFile(configPath, "utf8")).resolves.toBe('[[answer]]\nmodel = "qwen"\n');
  });

  it("ignores system_prompt-looking text inside answer multiline strings", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, '[answer]\nnotes = """\nsystem_prompt = "not real"\n"""\n', "utf8");

    await installTabbySystemPrompt(configPath);
    const config = await readFile(configPath, "utf8");

    expect(config).toContain('notes = """\nsystem_prompt = "not real"\n"""');
    expect(config).toContain('# tokenjuice:tabby begin\nsystem_prompt = """');
  });

  it("keeps the prompt inside answer when an array table follows", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, '[answer]\n\n[[context.providers]]\nkind = "git"\n', "utf8");

    await installTabbySystemPrompt(configPath);
    const config = await readFile(configPath, "utf8");

    expect(config).toContain('[answer]\n\n# tokenjuice:tabby begin\nsystem_prompt');
    expect(config).toContain('# tokenjuice:tabby end\n\n[[context.providers]]');
  });

  it("keeps the prompt inside a quoted answer table", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, '["answer"]\n\n[completion]\nmodel = "tabby"\n', "utf8");

    await installTabbySystemPrompt(configPath);
    const config = await readFile(configPath, "utf8");

    expect(config).toContain('["answer"]\n\n# tokenjuice:tabby begin\nsystem_prompt');
    expect(config).toContain('# tokenjuice:tabby end\n\n[completion]');
  });

  it("uses dotted system_prompt when existing answer settings are dotted", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, 'answer."model" = "qwen"\n\n[completion]\nmodel = "tabby"\n', "utf8");

    await installTabbySystemPrompt(configPath);
    const config = await readFile(configPath, "utf8");

    expect(config).toContain('answer."model" = "qwen"');
    expect(config).toContain('# tokenjuice:tabby begin\nanswer.system_prompt = """');
    expect(config).toContain('# tokenjuice:tabby end\n\n[completion]');
    expect(config).not.toContain("[answer]");
  });

  it("keeps dotted system_prompt outside multiline strings before the first real table", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, 'answer.model = "qwen"\nbanner = """\n[not_a_table]\n"""\n\n[completion]\nmodel = "tabby"\n', "utf8");

    await installTabbySystemPrompt(configPath);
    const config = await readFile(configPath, "utf8");
    const blockIndex = config.indexOf('# tokenjuice:tabby begin\nanswer.system_prompt = """');

    expect(config).toContain('banner = """\n[not_a_table]\n"""');
    expect(blockIndex).toBeGreaterThan(config.indexOf('"""\n\n'));
    expect(blockIndex).toBeLessThan(config.indexOf("[completion]"));
  });

  it("ignores table-looking text inside TOML multiline strings", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(
      configPath,
      'banner = """\n[answer]\nsystem_prompt = "not real"\n"""\n\n[model]\nprovider = "openai"\n',
      "utf8",
    );

    await installTabbySystemPrompt(configPath);
    const config = await readFile(configPath, "utf8");
    const installed = await doctorTabbySystemPrompt(configPath);

    expect(config).toContain('banner = """\n[answer]\nsystem_prompt = "not real"\n"""');
    expect(config.indexOf("[answer]\n# tokenjuice:tabby begin")).toBeGreaterThan(config.indexOf("[model]"));
    expect(installed.status).toBe("ok");
  });

  it("ignores table-looking text after escaped triple quotes inside TOML multiline strings", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(
      configPath,
      'banner = """\nescaped \\""" still in string\n[answer]\n"""\n\n[model]\nprovider = "openai"\n',
      "utf8",
    );

    await installTabbySystemPrompt(configPath);
    const config = await readFile(configPath, "utf8");
    const installed = await doctorTabbySystemPrompt(configPath);

    expect(config).toContain('escaped \\""" still in string\n[answer]\n"""');
    expect(config.indexOf("[answer]\n# tokenjuice:tabby begin")).toBeGreaterThan(config.indexOf("[model]"));
    expect(installed.status).toBe("ok");
  });

  it("keeps structure visible after one-line TOML multiline strings", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, 'banner = """x"""\n\n[answer]\nsystem_prompt = "keep this"\n', "utf8");

    await expect(installTabbySystemPrompt(configPath)).rejects.toThrow("already defines [answer].system_prompt");

    const doctor = await doctorTabbySystemPrompt(configPath);
    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("configured Tabby [answer].system_prompt is user-owned; tokenjuice will not overwrite it automatically");
  });

  it("preserves multiline string blank lines when installing and uninstalling", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    const original = '[answer]\nnotes = """a\n\n\nb"""\n';
    await writeFile(configPath, original, "utf8");

    await installTabbySystemPrompt(configPath);
    const installed = await readFile(configPath, "utf8");

    expect(installed).toContain('notes = """a\n\n\nb"""');

    await uninstallTabbySystemPrompt(configPath);

    await expect(readFile(configPath, "utf8")).resolves.toBe(`${original}\n`);
  });

  it("reports installed and uninstalled health", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");

    await installTabbySystemPrompt(configPath);
    const installed = await doctorTabbySystemPrompt(configPath);

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("system-prompt based");

    const removed = await uninstallTabbySystemPrompt(configPath);
    const disabled = await doctorTabbySystemPrompt(configPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(configPath)).resolves.toBeUndefined();
    await expect(readFile(configPath, "utf8")).resolves.toBe("[answer]\n");
  });

  it("ignores tokenjuice marker text inside user TOML strings", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    const config = '[answer]\nsystem_prompt = """\n# tokenjuice:tabby begin\nkeep this prompt\n# tokenjuice:tabby end\n"""\n';
    await writeFile(configPath, config, "utf8");

    const doctor = await doctorTabbySystemPrompt(configPath);
    const removed = await uninstallTabbySystemPrompt(configPath);

    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(removed.removed).toBe(false);
    await expect(readFile(configPath, "utf8")).resolves.toBe(config);
  });

  it("reports broken health when a user prompt is added beside the tokenjuice block", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await installTabbySystemPrompt(configPath);
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("# tokenjuice:tabby end\n", '# tokenjuice:tabby end\nsystem_prompt = "duplicate"\n'), "utf8");

    const doctor = await doctorTabbySystemPrompt(configPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured Tabby [answer].system_prompt also exists outside tokenjuice markers");
  });

  it("preserves answer table scope for user keys added after the tokenjuice block", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await installTabbySystemPrompt(configPath);
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("# tokenjuice:tabby end\n", "# tokenjuice:tabby end\ntemperature = 0.2\n"), "utf8");

    await uninstallTabbySystemPrompt(configPath);

    await expect(readFile(configPath, "utf8")).resolves.toBe("[answer]\n\ntemperature = 0.2\n");
  });

  it("reports broken config with unmatched Tabby tokenjuice markers", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, "# tokenjuice:tabby begin\nmissing end marker\n", "utf8");

    const doctor = await doctorTabbySystemPrompt(configPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues[0]).toContain("unmatched or duplicate tokenjuice markers");
    await expect(installTabbySystemPrompt(configPath)).rejects.toThrow("malformed tokenjuice Tabby markers");
  });

  it("reports broken config with reversed Tabby tokenjuice markers", async () => {
    const home = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(configPath, "# tokenjuice:tabby end\n\n# tokenjuice:tabby begin\n", "utf8");

    const doctor = await doctorTabbySystemPrompt(configPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues[0]).toContain("unmatched or duplicate tokenjuice markers");
    await expect(installTabbySystemPrompt(configPath)).rejects.toThrow("malformed tokenjuice Tabby markers");
    await expect(uninstallTabbySystemPrompt(configPath)).rejects.toThrow("malformed tokenjuice Tabby markers");
  });

  it("rejects symlinked config paths before install, doctor, or uninstall", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const configPath = join(home, "config.toml");
    await writeFile(join(outside, "config.toml"), "# private\n", "utf8");
    await symlink(join(outside, "config.toml"), configPath);

    await expect(installTabbySystemPrompt(configPath)).rejects.toThrow(/symlinked config file/u);
    await expect(uninstallTabbySystemPrompt(configPath)).rejects.toThrow(/symlinked config file/u);

    const doctor = await doctorTabbySystemPrompt(configPath);
    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("symlinked config file");
  });

  it("rejects symlinked config directories and sidecars before writing", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const linkedConfigDir = join(home, "linked-tabby");
    await symlink(outside, linkedConfigDir);

    await expect(installTabbySystemPrompt(undefined, { configDir: linkedConfigDir })).rejects.toThrow(/symlinked config directory/u);

    const configPath = join(home, "config.toml");
    await symlink(join(outside, "backup.toml"), `${configPath}.bak`);
    await expect(installTabbySystemPrompt(configPath)).rejects.toThrow(/symlinked config backup/u);

    await rm(`${configPath}.bak`);
    await writeFile(configPath, "[answer]\ntemperature = 0.2\n", "utf8");
    await writeFile(`${configPath}.bak`, "older backup\n", "utf8");
    await symlink(join(outside, "backup.toml"), `${configPath}.bak.1`);
    await expect(installTabbySystemPrompt(configPath)).rejects.toThrow(/symlinked config backup/u);
  });

  it("uses TABBY_CONFIG_DIR for the default config path", async () => {
    const home = await createTempDir();
    process.env.TABBY_CONFIG_DIR = home;

    const installed = await installTabbySystemPrompt();
    const doctor = await doctorTabbySystemPrompt();

    expect(installed.configPath).toBe(join(home, "config.toml"));
    expect(doctor.configPath).toBe(join(home, "config.toml"));
    expect(doctor.status).toBe("ok");
  });

  it("uses TABBY_ROOT for Tabby's default config root", async () => {
    const home = await createTempDir();
    process.env.TABBY_ROOT = home;

    const installed = await installTabbySystemPrompt();
    const doctor = await doctorTabbySystemPrompt();

    expect(installed.configPath).toBe(join(home, "config.toml"));
    expect(doctor.configPath).toBe(join(home, "config.toml"));
    expect(doctor.status).toBe("ok");
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installTabbySystemPrompt(undefined, { configDir: home });

    const report = await doctorInstalledHooks({ configDir: home, projectDir: home });

    expect(report.integrations.tabby.configPath).toBe(join(home, "config.toml"));
    expect(report.integrations.tabby.status).toBe("ok");
    expect(report.integrations.tabby.hasTokenjuiceMarker).toBe(true);
  });

  it("does not make aggregate doctor fail for unrelated symlinked Tabby config", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await writeFile(join(outside, "config.toml"), "# private\n", "utf8");
    await symlink(join(outside, "config.toml"), join(home, "config.toml"));

    const report = await doctorInstalledHooks({ configDir: home, projectDir: home });

    expect(report.integrations.tabby.status).toBe("broken");
    expect(report.integrations.tabby.hasTokenjuiceMarker).toBe(false);
    expect(report.status).toBe("disabled");
  });
});
