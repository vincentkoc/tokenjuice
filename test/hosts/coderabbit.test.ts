import { access, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorCodeRabbitConfig,
  doctorInstalledHooks,
  installCodeRabbitConfig,
  uninstallCodeRabbitConfig,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "ADAL_PROJECT_DIR",
  "AETHER_PROJECT_DIR",
  "AGENTINIT_PROJECT_DIR",
  "AGENT_LAYER_PROJECT_DIR",
  "AGENTLINK_PROJECT_DIR",
  "AGENTLOOM_PROJECT_DIR",
  "AGENTS_CLI_HOME",
  "AGENTS_MD_PROJECT_DIR",
  "AGENTSGE_PROJECT_DIR",
  "AGENTSMESH_PROJECT_DIR",
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "ANYWHERE_AGENTS_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "BAZ_PROJECT_DIR",
  "BOB_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
  "CAGENT_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEBUFF_PROJECT_DIR",
  "CODEGEN_PROJECT_DIR",
  "CODER_AGENTS_PROJECT_DIR",
  "CODERABBIT_PROJECT_DIR",
  "CODEX_HOME",
  "CONTINUE_PROJECT_DIR",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CURSOR_HOME",
  "DEEPAGENTS_PROJECT_DIR",
  "DOCKER_AGENT_PROJECT_DIR",
  "DOT_AGENTS_HOME",
  "FACTORY_HOME",
  "FIREBASE_STUDIO_PROJECT_DIR",
  "FORGECODE_PROJECT_DIR",
  "GEMINI_HOME",
  "GITLAB_DUO_PROJECT_DIR",
  "GREPTILE_PROJECT_DIR",
  "GROK_BUILD_PROJECT_DIR",
  "GPTME_PROJECT_DIR",
  "HOME",
  "JEAN2_PROJECT_DIR",
  "JETBRAINS_AI_PROJECT_DIR",
  "JULES_PROJECT_DIR",
  "JUNIE_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "LEANCTL_PROJECT_DIR",
  "MCP_AGENT_PROJECT_DIR",
  "MINI_SWE_AGENT_PROJECT_DIR",
  "MISTRAL_VIBE_PROJECT_DIR",
  "MUX_PROJECT_DIR",
  "KNOWNS_PROJECT_DIR",
  "NOVAKIT_PROJECT_DIR",
  "ONA_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPENWEBUI_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "PLANDEX_PROJECT_DIR",
  "QODER_PROJECT_DIR",
  "QODO_PROJECT_DIR",
  "QWEN_PROJECT_DIR",
  "REPLIT_PROJECT_DIR",
  "ROO_PROJECT_DIR",
  "ROVO_DEV_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "SWE_AGENT_PROJECT_DIR",
  "TABNINE_PROJECT_DIR",
  "TRAE_PROJECT_DIR",
  "UIPATH_PROJECT_DIR",
  "WARP_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-coderabbit-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

describe("CodeRabbit config", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/# tokenjuice:coderabbit begin/gu)?.length ?? 0;
  }

  it("installs marker-delimited path instructions", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");

    const result = await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(result.configPath).toBe(configPath);
    expect(result.backupPath).toBeUndefined();
    expect(config).toContain("reviews:");
    expect(config).toContain("path_instructions:");
    expect(config).toContain("# tokenjuice:coderabbit begin");
    expect(config).toContain('path: "**/*"');
    expect(config).toContain("tokenjuice terminal output compaction");
    expect(config).toContain("tokenjuice wrap -- <command>");
    expect(config).toContain("tokenjuice wrap --raw -- <command>");
    expect(config).not.toContain("wrap --full");
  });

  it("preserves existing config and backs it up", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(configPath, 'language: "en-US"\n\nreviews:\n  profile: "assertive"\n', "utf8");

    const result = await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(result.backupPath).toBe(`${configPath}.bak`);
    await expect(readFile(`${configPath}.bak`, "utf8")).resolves.toContain("assertive");
    expect(config).toContain('language: "en-US"');
    expect(config).toContain('profile: "assertive"');
    expect(config).toContain("path_instructions:");
  });

  it("keeps quoted top-level keys outside the reviews range", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(configPath, 'reviews:\n  profile: "assertive"\n"language": "en-US"\n', "utf8");

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain('"language": "en-US"');
    expect(config.indexOf("path_instructions:")).toBeLessThan(config.indexOf('"language": "en-US"'));
  });

  it("keeps schema hints outside the reviews range", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(configPath, 'reviews:\n  profile: "assertive"\n$schema: "https://example.com/coderabbit.schema.json"\n', "utf8");

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain('$schema: "https://example.com/coderabbit.schema.json"');
    expect(config.indexOf("path_instructions:")).toBeLessThan(config.indexOf("$schema:"));
    expect(config).not.toContain('  $schema:');
  });

  it("preserves anchored reviews block mappings", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(configPath, 'reviews: !review-settings &default_reviews\n  profile: "assertive"\n', "utf8");

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain("reviews: !review-settings &default_reviews");
    expect(config).toContain('profile: "assertive"');
    expect(config).toContain("path_instructions:");
  });

  it("ignores nested reviews keys outside the top-level reviews mapping", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(
      configPath,
      [
        "defaults:",
        "  reviews: &default_reviews",
        '    profile: "assertive"',
        "reviews:",
        "  <<: *default_reviews",
      ].join("\n"),
      "utf8",
    );

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain("  reviews: &default_reviews");
    expect(config).toContain("  <<: *default_reviews");
    expect(config).toContain("path_instructions:");
  });

  it("appends to existing block-list path instructions", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(
      configPath,
      [
        "reviews:",
        "  path_instructions:",
        '    - path: "src/**"',
        "      instructions: |",
        "        keep existing",
        "  profile: \"chill\"",
      ].join("\n"),
      "utf8",
    );

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain('path: "src/**"');
    expect(config).toContain("keep existing");
    expect(config).toContain('path: "**/*"');
    expect(config).toContain('profile: "chill"');
  });

  it("appends to anchored path_instructions block lists", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(
      configPath,
      [
        "reviews:",
        "  path_instructions: &review_paths",
        '    - path: "src/**"',
        "      instructions: |",
        "        keep existing",
      ].join("\n"),
      "utf8",
    );

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).toContain("path_instructions: &review_paths");
    expect(config).toContain('path: "src/**"');
    expect(config).toContain('path: "**/*"');
  });

  it("ignores YAML-looking text inside existing literal path instructions", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(
      configPath,
      [
        "reviews:",
        "  path_instructions:",
        '    - path: "docs/**"',
        "      instructions: |2",
        "        reviews:",
        "        path_instructions:",
        "          keep this example literal",
      ].join("\n"),
      "utf8",
    );

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");
    const doctor = await doctorCodeRabbitConfig(configPath, { projectDir: home });

    expect(config).toContain("keep this example literal");
    expect(config).toContain('path: "**/*"');
    expect(doctor.status).toBe("ok");
  });

  it("ignores marker-looking text inside YAML block scalars", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    const original = [
      "notes: |",
      "  # tokenjuice:coderabbit begin",
      "  example marker text, not an installed block",
      "  # tokenjuice:coderabbit end",
      "",
    ].join("\n");
    await writeFile(configPath, original, "utf8");

    const doctor = await doctorCodeRabbitConfig(configPath, { projectDir: home });
    const uninstalled = await uninstallCodeRabbitConfig(configPath, { projectDir: home });
    await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(uninstalled.removed).toBe(false);
    expect(config).toContain(original.trimEnd());
    expect(config.match(/# tokenjuice:coderabbit begin\n    - path/gu)?.length).toBe(1);
  });

  it("ignores marker-looking text inside CRLF YAML block scalars", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    const original = [
      "notes: |",
      "  # tokenjuice:coderabbit begin",
      "  example marker text, not an installed block",
      "  # tokenjuice:coderabbit end",
      "",
    ].join("\r\n");
    await writeFile(configPath, original, "utf8");

    const doctor = await doctorCodeRabbitConfig(configPath, { projectDir: home });
    await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(config).toContain(original.trimEnd());
    expect(config.match(/# tokenjuice:coderabbit begin\n    - path/gu)?.length).toBe(1);
  });

  it("preserves blank lines inside existing YAML block scalars", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(
      configPath,
      [
        "reviews:",
        "  path_instructions:",
        '    - path: "docs/**"',
        "      instructions: |",
        "        first paragraph",
        "",
        "",
        "        second paragraph",
      ].join("\n"),
      "utf8",
    );

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const installed = await readFile(configPath, "utf8");
    await uninstallCodeRabbitConfig(configPath, { projectDir: home });
    const uninstalled = await readFile(configPath, "utf8");

    expect(installed).toContain("        first paragraph\n\n\n        second paragraph");
    expect(uninstalled).toContain("        first paragraph\n\n\n        second paragraph");
  });

  it("preserves trailing blank lines in existing YAML block scalars", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(
      configPath,
      [
        "reviews:",
        "  path_instructions:",
        '    - path: "docs/**"',
        "      instructions: |+",
        "        first paragraph",
        "",
        "",
        "",
      ].join("\n"),
      "utf8",
    );

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const installed = await readFile(configPath, "utf8");
    await uninstallCodeRabbitConfig(configPath, { projectDir: home });
    const uninstalled = await readFile(configPath, "utf8");

    expect(installed).toMatch(/        first paragraph\n{3,}    # tokenjuice:coderabbit begin/u);
    expect(uninstalled).toMatch(/        first paragraph\n{3,}/u);
    expect(uninstalled).not.toContain("tokenjuice:coderabbit");
  });

  it("preserves user path instructions added after tokenjuice creates the list", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const generated = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      generated.replace(
        "# tokenjuice:coderabbit end",
        '# tokenjuice:coderabbit end\n    - path: "docs/**"\n      instructions: |\n        keep docs terse',
      ),
      "utf8",
    );

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const reinstalled = await readFile(configPath, "utf8");
    expect(reinstalled).toContain('path: "docs/**"');
    expect(reinstalled).toContain("keep docs terse");

    await uninstallCodeRabbitConfig(configPath, { projectDir: home });
    const uninstalled = await readFile(configPath, "utf8");
    expect(uninstalled).toContain("path_instructions:");
    expect(uninstalled).toContain('path: "docs/**"');
    expect(uninstalled).toContain("keep docs terse");
    expect(uninstalled).not.toContain("tokenjuice:coderabbit");
  });

  it("replaces stale tokenjuice path instructions without duplicating the block", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(
      configPath,
      [
        "reviews:",
        "  path_instructions:",
        "    # tokenjuice:coderabbit begin",
        '    - path: "**/*"',
        "      instructions: |",
        "        stale tokenjuice block",
        "    # tokenjuice:coderabbit end",
      ].join("\n"),
      "utf8",
    );

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(config).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(config)).toBe(1);
  });

  it("keeps reinstall stable without accumulating blank lines", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");

    await installCodeRabbitConfig(configPath, { projectDir: home });
    await installCodeRabbitConfig(configPath, { projectDir: home });
    const twiceInstalled = await readFile(configPath, "utf8");
    await installCodeRabbitConfig(configPath, { projectDir: home });
    const thirdInstalled = await readFile(configPath, "utf8");

    expect(thirdInstalled).toBe(twiceInstalled);
    expect(thirdInstalled).not.toContain("path_instructions:\n\n");
  });

  it("refuses inline reviews and path_instructions YAML", async () => {
    const cases: Array<{ text: string; issue: RegExp }> = [
      { text: "reviews: { profile: chill }\n", issue: /inline YAML value/u },
      { text: "reviews:\n  path_instructions: []\n", issue: /inline YAML value/u },
      { text: 'reviews:\n  path_instructions:\n    path: "src/**"\n', issue: /non-list YAML block/u },
      { text: "reviews:\n    path_instructions:\n      - path: src/**\n", issue: /unsupported/u },
      { text: 'reviews:\n  "path_instructions":\n    - path: src/**\n', issue: /unsupported/u },
    ];

    for (const { text, issue } of cases) {
      const home = await createTempDir();
      await writeFile(join(home, ".coderabbit.yaml"), text, "utf8");

      await expect(installCodeRabbitConfig(undefined, { projectDir: home })).rejects.toThrow(issue);
    }
  });

  it("refuses unsupported root reviews key shapes", async () => {
    const cases = [
      "reviews :\n  profile: chill\n",
      '"reviews":\n  profile: chill\n',
    ];

    for (const text of cases) {
      const home = await createTempDir();
      await writeFile(join(home, ".coderabbit.yaml"), text, "utf8");

      await expect(installCodeRabbitConfig(undefined, { projectDir: home })).rejects.toThrow(/unsupported root reviews key shape/u);
    }
  });

  it("refuses unsupported reviews child indentation", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(configPath, 'reviews:\n    profile: "assertive"\n', "utf8");

    await expect(installCodeRabbitConfig(configPath, { projectDir: home })).rejects.toThrow(/unsupported indentation inside reviews/u);
  });

  it("reports installed and uninstalled config health", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");

    await installCodeRabbitConfig(configPath, { projectDir: home });
    const installed = await doctorCodeRabbitConfig(configPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("path-instruction");

    const removed = await uninstallCodeRabbitConfig(configPath, { projectDir: home });
    const disabled = await doctorCodeRabbitConfig(configPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports broken config with unmatched or reversed tokenjuice markers", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(configPath, "# tokenjuice:coderabbit end\nstale block\n# tokenjuice:coderabbit begin\n", "utf8");

    await expect(installCodeRabbitConfig(configPath, { projectDir: home })).rejects.toThrow(/malformed tokenjuice CodeRabbit markers/u);
    const doctor = await doctorCodeRabbitConfig(configPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("unmatched or duplicate");
  });

  it("reports broken config when tokenjuice markers are outside CodeRabbit path instructions", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await installCodeRabbitConfig(configPath, { projectDir: home });
    const generated = await readFile(configPath, "utf8");
    await writeFile(configPath, generated.replace(/^reviews:/u, "rules:"), "utf8");

    const doctor = await doctorCodeRabbitConfig(configPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured CodeRabbit review guidance is not installed under reviews.path_instructions");
  });

  it("reports broken config when tokenjuice markers are in an unsupported CodeRabbit YAML shape", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await installCodeRabbitConfig(configPath, { projectDir: home });
    const generated = await readFile(configPath, "utf8");
    await writeFile(configPath, `${generated}\nreviews:\n  profile: second\n`, "utf8");

    const doctor = await doctorCodeRabbitConfig(configPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("multiple top-level reviews keys");
  });

  it("leaves unrelated config untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(configPath, 'language: "en-US"\n', "utf8");

    const removed = await uninstallCodeRabbitConfig(configPath, { projectDir: home });
    const config = await readFile(configPath, "utf8");

    expect(removed.removed).toBe(false);
    expect(config).toBe('language: "en-US"\n');
  });

  it("uses CODERABBIT_PROJECT_DIR for the default config file", async () => {
    const home = await createTempDir();
    process.env.CODERABBIT_PROJECT_DIR = home;

    const installed = await installCodeRabbitConfig();
    const expectedConfigPath = join(home, ".coderabbit.yaml");
    const doctor = await doctorCodeRabbitConfig();

    expect(installed.configPath).toBe(expectedConfigPath);
    expect(doctor.configPath).toBe(expectedConfigPath);
    expect(doctor.status).toBe("ok");
  });

  it("rejects symlinked config files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.CODERABBIT_PROJECT_DIR = home;
    await writeFile(join(outside, "private.yaml"), "reviews:\n", "utf8");
    await symlink(join(outside, "private.yaml"), join(home, ".coderabbit.yaml"));

    await expect(installCodeRabbitConfig()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, ".coderabbit.yaml.bak"))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorCodeRabbitConfig();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
    await expect(doctorCodeRabbitConfig(join(home, ".coderabbit.yaml"))).resolves.toMatchObject({
      status: "broken",
      hasUnsafePathIssue: true,
      issues: [expect.stringContaining("will not read or write through instruction symlinks")],
    });

    for (const key of envKeys) {
      process.env[key] = home;
    }
    const aggregate = await doctorInstalledHooks({ projectDir: home });

    expect(aggregate.status).toBe("broken");
    expect(aggregate.integrations.coderabbit.hasUnsafePathIssue).toBe(true);
  });

  it("does not write through sibling backup symlinks", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const configPath = join(home, ".coderabbit.yaml");
    await writeFile(configPath, "reviews:\n", "utf8");
    await symlink(join(outside, "backup.yaml"), `${configPath}.bak`);

    await expect(installCodeRabbitConfig(configPath, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
  });

  it("rejects explicit config paths outside the project-local CodeRabbit config", async () => {
    const home = await createTempDir();
    const configPath = join(home, "nested.yaml");

    await expect(installCodeRabbitConfig(configPath, { projectDir: home })).rejects.toThrow(/only installs the project-local/u);
    await expect(doctorCodeRabbitConfig(configPath, { projectDir: home })).resolves.toMatchObject({
      status: "broken",
      hasTokenjuiceMarker: false,
      issues: [expect.stringContaining("only installs the project-local")],
    });
  });

  it("rejects symlinked project roots", async () => {
    const realProject = await createTempDir();
    const linkParent = await createTempDir();
    const linkedProject = join(linkParent, "project-link");
    await symlink(realProject, linkedProject, "dir");

    await expect(installCodeRabbitConfig(undefined, { projectDir: linkedProject })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(doctorCodeRabbitConfig(undefined, { projectDir: linkedProject })).resolves.toMatchObject({
      status: "disabled",
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: false,
    });

    await writeFile(join(realProject, ".coderabbit.yaml"), "reviews:\n", "utf8");
    await expect(doctorCodeRabbitConfig(undefined, { projectDir: linkedProject })).resolves.toMatchObject({
      status: "broken",
      hasUnsafePathIssue: true,
      issues: [expect.stringContaining("will not read or write through instruction symlinks")],
    });
  });

  it("uses the current git root when no project dir is configured", async () => {
    const home = await createTempDir();
    const nested = join(home, "packages", "app");
    await mkdir(join(home, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });
    process.chdir(nested);

    const installed = await installCodeRabbitConfig();
    const root = await realpath(home);

    expect(installed.configPath).toBe(join(root, ".coderabbit.yaml"));
  });

  it("includes CodeRabbit in aggregate doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installCodeRabbitConfig(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.coderabbit.configPath).toBe(join(home, ".coderabbit.yaml"));
    expect(report.integrations.coderabbit.status).toBe("ok");
    expect(report.integrations.coderabbit.hasTokenjuiceMarker).toBe(true);
  });

  it("does not treat user-owned CodeRabbit config as aggregate installed", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await writeFile(join(home, ".coderabbit.yaml"), 'language: "en-US"\n', "utf8");

    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.coderabbit.status).toBe("disabled");
    expect(report.integrations.coderabbit.hasTokenjuiceMarker).toBe(false);
  });

  it("removes the default config file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.CODERABBIT_PROJECT_DIR = home;
    const configPath = join(home, ".coderabbit.yaml");

    await installCodeRabbitConfig();
    await uninstallCodeRabbitConfig(configPath, { projectDir: home });

    await expect(access(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
