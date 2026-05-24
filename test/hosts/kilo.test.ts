import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorKiloRule, installKiloRule, uninstallKiloRule } from "../../src/index.js";

const tempDirs: string[] = [];
const originalProjectDir = process.env.KILO_PROJECT_DIR;

afterEach(async () => {
  if (originalProjectDir === undefined) {
    delete process.env.KILO_PROJECT_DIR;
  } else {
    process.env.KILO_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-kilo-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("kilo rules", () => {
  it("installs a workspace rule", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".kilo", "rules", "tokenjuice.md");
    const configPath = join(home, "kilo.jsonc");

    const result = await installKiloRule(undefined, { projectDir: home });
    const rule = await readFile(rulePath, "utf8");
    const config = await readFile(configPath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.configPath).toBe(configPath);
    expect(result.backupPath).toBeUndefined();
    expect(result.configBackupPath).toBeUndefined();
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).toContain("terminal commands through Kilo Code");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
    expect(config).toContain('"instructions"');
    expect(config).toContain('".kilo/rules/tokenjuice.md"');
  });

  it("registers explicit rule paths relative to the project", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".kilo", "rules", "custom-tokenjuice.md");
    const configPath = join(home, "kilo.jsonc");

    await installKiloRule(rulePath, { projectDir: home });
    const config = await readFile(configPath, "utf8");
    const doctor = await doctorKiloRule(rulePath, { projectDir: home });

    expect(config).toContain('".kilo/rules/custom-tokenjuice.md"');
    expect(config).not.toContain('".kilo/rules/tokenjuice.md"');
    expect(doctor.status).toBe("ok");
  });

  it("escapes explicit rule paths when writing kilo.jsonc", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".kilo", "rules", "token\"juice.md");
    const configPath = join(home, "kilo.jsonc");

    await installKiloRule(rulePath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain("\".kilo/rules/token\\\"juice.md\"");
    await expect(doctorKiloRule(rulePath, { projectDir: home })).resolves.toMatchObject({ status: "ok" });
  });

  it("updates .kilo/kilo.jsonc when that higher-priority project config exists", async () => {
    const home = await createTempDir();
    const rootConfigPath = join(home, "kilo.jsonc");
    const dotConfigPath = join(home, ".kilo", "kilo.jsonc");
    await mkdir(join(home, ".kilo"), { recursive: true });
    await writeFile(dotConfigPath, "{\n  \"instructions\": []\n}\n", "utf8");

    const installed = await installKiloRule(undefined, { projectDir: home });
    const dotConfig = await readFile(dotConfigPath, "utf8");

    expect(installed.configPath).toBe(dotConfigPath);
    expect(dotConfig).toContain('".kilo/rules/tokenjuice.md"');
    await expect(access(rootConfigPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uninstalls stale root config entries after .kilo/kilo.jsonc is added", async () => {
    const home = await createTempDir();
    const rootConfigPath = join(home, "kilo.jsonc");
    const dotConfigPath = join(home, ".kilo", "kilo.jsonc");

    await installKiloRule(undefined, { projectDir: home });
    await mkdir(join(home, ".kilo"), { recursive: true });
    await writeFile(dotConfigPath, "{\n  \"instructions\": []\n}\n", "utf8");

    const removed = await uninstallKiloRule(undefined, { projectDir: home });
    const rootConfig = await readFile(rootConfigPath, "utf8");

    expect(removed.configUpdated).toBe(true);
    expect(rootConfig).not.toContain(".kilo/rules/tokenjuice.md");
  });

  it("backs up existing files before replacing them", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".kilo", "rules", "tokenjuice.md");
    const configPath = join(home, "kilo.jsonc");
    await installKiloRule(undefined, { projectDir: home });
    await writeFile(rulePath, "# local Kilo rule\n\n- keep this\n", "utf8");
    await writeFile(
      configPath,
      [
        "{",
        "  // keep local comments",
        "  \"instructions\": [",
        "    \".kilo/rules/existing.md\"",
        "  ]",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await installKiloRule(undefined, { projectDir: home });
    const rule = await readFile(rulePath, "utf8");
    const config = await readFile(configPath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    expect(result.configBackupPath).toBe(`${configPath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("keep this");
    await expect(readFile(`${configPath}.bak`, "utf8")).resolves.toContain("keep local comments");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).not.toContain("keep this");
    expect(config).toContain("keep local comments");
    expect(config).toContain('".kilo/rules/existing.md"');
    expect(config).toContain('".kilo/rules/tokenjuice.md"');
  });

  it("adds an instructions entry to an existing kilo.jsonc object", async () => {
    const home = await createTempDir();
    const configPath = join(home, "kilo.jsonc");
    await writeFile(
      configPath,
      [
        "{",
        "  // local model choice",
        "  \"model\": \"keep-me\"",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    await installKiloRule(undefined, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain("\"instructions\"");
    expect(config).toContain("\"model\": \"keep-me\"");
    expect(config).toContain("local model choice");
  });

  it("adds an instructions entry after an existing trailing comma", async () => {
    const home = await createTempDir();
    const configPath = join(home, "kilo.jsonc");
    await writeFile(
      configPath,
      [
        "{",
        "  \"instructions\": [",
        "    \".kilo/rules/existing.md\",",
        "  ]",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    await installKiloRule(undefined, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain("\".kilo/rules/existing.md\",");
    expect(config).toContain("\".kilo/rules/tokenjuice.md\"");
    expect(config).not.toContain(",,");
  });

  it("updates the top-level instructions entry when nested instructions exist", async () => {
    const home = await createTempDir();
    const configPath = join(home, "kilo.jsonc");
    await writeFile(
      configPath,
      [
        "{",
        "  \"agent\": {",
        "    \"instructions\": [\"nested.md\"]",
        "  },",
        "  \"instructions\": [",
        "    \".kilo/rules/existing.md\"",
        "  ]",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    await installKiloRule(undefined, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain("\"instructions\": [\"nested.md\"]");
    expect(config).toContain("\".kilo/rules/existing.md\"");
    expect(config).toContain("\".kilo/rules/tokenjuice.md\"");
    expect(config.indexOf("\".kilo/rules/tokenjuice.md\"")).toBeGreaterThan(config.indexOf("\".kilo/rules/existing.md\""));
  });

  it("ignores instructions-looking text inside JSONC comments", async () => {
    const home = await createTempDir();
    const configPath = join(home, "kilo.jsonc");
    await writeFile(
      configPath,
      [
        "{",
        "  \"temperature\": 0.2 // legacy, \"instructions\": \"old docs\",",
        "  \"instructions\": [",
        "    \".kilo/rules/existing.md\"",
        "  ]",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    await installKiloRule(undefined, { projectDir: home });
    const doctor = await doctorKiloRule(undefined, { projectDir: home });

    expect(doctor.status).toBe("ok");
  });

  it("rolls back the rule file when kilo.jsonc cannot be updated", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".kilo", "rules", "tokenjuice.md");
    const configPath = join(home, "kilo.jsonc");
    await installKiloRule(undefined, { projectDir: home });
    await writeFile(rulePath, "# local tokenjuice override\n", "utf8");
    await writeFile(configPath, "{\n  \"instructions\": \"invalid\"\n}\n", "utf8");

    await expect(installKiloRule(undefined, { projectDir: home })).rejects.toThrow("instructions must be an array");
    await expect(readFile(rulePath, "utf8")).resolves.toBe("# local tokenjuice override\n");
  });

  it("only removes direct string instruction entries", async () => {
    const home = await createTempDir();
    const configPath = join(home, "kilo.jsonc");
    await installKiloRule(undefined, { projectDir: home });
    await writeFile(
      configPath,
      [
        "{",
        "  \"instructions\": [",
        "    { \"path\": \".kilo/rules/tokenjuice.md\" },",
        "    \".kilo/rules/tokenjuice.md\"",
        "  ]",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    await uninstallKiloRule(undefined, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain("{ \"path\": \".kilo/rules/tokenjuice.md\" }");
    expect(config).not.toContain("    \".kilo/rules/tokenjuice.md\"");
  });

  it("removes an instruction entry with an inline JSONC comment before the comma", async () => {
    const home = await createTempDir();
    const configPath = join(home, "kilo.jsonc");
    await installKiloRule(undefined, { projectDir: home });
    await writeFile(
      configPath,
      [
        "{",
        "  \"instructions\": [",
        "    \".kilo/rules/tokenjuice.md\" // managed by tokenjuice",
        "    , \".kilo/rules/other.md\"",
        "  ]",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    await uninstallKiloRule(undefined, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).not.toContain("\".kilo/rules/tokenjuice.md\"");
    expect(config).toContain("\".kilo/rules/other.md\"");
    expect(config).not.toContain("[\n     // managed by tokenjuice\n    ,");
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();

    await installKiloRule(undefined, { projectDir: home });
    const installed = await doctorKiloRule(undefined, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("rule-based");

    const removed = await uninstallKiloRule(undefined, { projectDir: home });
    const disabled = await doctorKiloRule(undefined, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(removed.configUpdated).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("does not remove markerless user-owned tokenjuice rule files", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".kilo", "rules", "tokenjuice.md");
    const configPath = join(home, "kilo.jsonc");
    await mkdir(join(home, ".kilo", "rules"), { recursive: true });
    await writeFile(rulePath, "# user Kilo guidance\n", "utf8");
    await writeFile(
      configPath,
      [
        "{",
        "  \"instructions\": [",
        "    \".kilo/rules/tokenjuice.md\"",
        "  ]",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const removed = await uninstallKiloRule(undefined, { projectDir: home });

    expect(removed.removed).toBe(false);
    expect(removed.configUpdated).toBe(false);
    await expect(readFile(rulePath, "utf8")).resolves.toBe("# user Kilo guidance\n");
    await expect(readFile(configPath, "utf8")).resolves.toContain(".kilo/rules/tokenjuice.md");
  });

  it("reports broken rules missing tokenjuice guidance", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".kilo", "rules", "tokenjuice.md");
    await installKiloRule(undefined, { projectDir: home });
    await writeFile(rulePath, "# project rules\n\n- no tokenjuice here\n", "utf8");

    const doctor = await doctorKiloRule(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Kilo Code rule file is missing tokenjuice wrap guidance");
  });

  it("reports broken rules missing the kilo.jsonc instruction entry", async () => {
    const home = await createTempDir();
    const configPath = join(home, "kilo.jsonc");
    await installKiloRule(undefined, { projectDir: home });
    await writeFile(configPath, "{\n  \"instructions\": []\n}\n", "utf8");

    const doctor = await doctorKiloRule(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("kilo.jsonc instructions does not reference .kilo/rules/tokenjuice.md");
  });

  it("uses KILO_PROJECT_DIR for the default rule file", async () => {
    const home = await createTempDir();
    process.env.KILO_PROJECT_DIR = home;

    const installed = await installKiloRule();
    const expectedRulePath = join(home, ".kilo", "rules", "tokenjuice.md");
    const expectedConfigPath = join(home, "kilo.jsonc");
    const doctor = await doctorKiloRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(installed.configPath).toBe(expectedConfigPath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.configPath).toBe(expectedConfigPath);
    expect(doctor.status).toBe("ok");
  });

  it("removes the default rule file when uninstalling", async () => {
    const home = await createTempDir();
    process.env.KILO_PROJECT_DIR = home;
    const rulePath = join(home, ".kilo", "rules", "tokenjuice.md");

    await installKiloRule();
    await uninstallKiloRule(rulePath);

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(home, "kilo.jsonc"), "utf8")).resolves.not.toContain(".kilo/rules/tokenjuice.md");
  });
});
