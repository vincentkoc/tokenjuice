import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorOnaInstructions,
  doctorOnaSkill,
  installOnaInstructions,
  installOnaSkill,
  uninstallOnaInstructions,
  uninstallOnaSkill,
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
  "BITO_PROJECT_DIR",
  "BOB_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
  "CAGENT_PROJECT_DIR",
  "CHARLIE_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEANT_PROJECT_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEBUFF_PROJECT_DIR",
  "CODEGEN_PROJECT_DIR",
  "BLACKBOX_PROJECT_DIR",
  "BLOCKS_PROJECT_DIR",
  "STAGEWISE_PROJECT_DIR",
  "CLAWDBOT_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-ona-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

describe("Ona skill", () => {
  it("installs a workspace skill with Ona-compatible frontmatter", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");

    const result = await installOnaSkill(skillPath, { projectDir: home });
    const skill = await readFile(skillPath, "utf8");

    expect(result.skillPath).toBe(skillPath);
    expect(result.backupPath).toBeUndefined();
    expect(skill).toContain("<!-- tokenjuice:ona skill -->");
    expect(skill).toContain("name: tokenjuice");
    expect(skill).toContain("description:");
    expect(skill).toContain("running terminal or shell commands, tests, builds, or log-heavy commands");
    expect(skill).toContain("# tokenjuice terminal output compaction");
    expect(skill).toContain("Ona Agent");
    expect(skill).toContain("tokenjuice wrap -- <command>");
    expect(skill).toContain("tokenjuice wrap --raw -- <command>");
    expect(skill).toContain(".ona/skills/tokenjuice/SKILL.md");
    expect(skill).not.toContain("wrap --full");
  });

  it("backs up an existing skill before replacing it", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await installOnaSkill(skillPath, { projectDir: home });
    await writeFile(skillPath, "# custom skill\n\nkeep me\n", "utf8");

    const result = await installOnaSkill(skillPath, { projectDir: home });

    expect(result.backupPath).toBe(`${skillPath}.bak`);
    await expect(readFile(`${skillPath}.bak`, "utf8")).resolves.toContain("keep me");
    await expect(readFile(skillPath, "utf8")).resolves.toContain("# tokenjuice terminal output compaction");
  });

  it("reports installed and uninstalled skill health", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");

    await installOnaSkill(skillPath, { projectDir: home });
    const installed = await doctorOnaSkill(skillPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.hasUnsafePathIssue).toBe(false);
    expect(installed.advisories[0]).toContain("skill-based");

    const removed = await uninstallOnaSkill(skillPath, { projectDir: home });
    const disabled = await doctorOnaSkill(skillPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    expect(disabled.hasUnsafePathIssue).toBe(false);
    await expect(access(skillPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves user-owned skill files on uninstall", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, "# custom Ona skill\n\nmentions tokenjuice compaction\n", "utf8");

    const removed = await uninstallOnaSkill(skillPath, { projectDir: home });

    expect(removed.removed).toBe(false);
    await expect(readFile(skillPath, "utf8")).resolves.toContain("custom Ona skill");
  });

  it("does not count user-owned Ona skill files as aggregate tokenjuice installs", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, "# custom skill\n", "utf8");

    const report = await doctorInstalledHooks();

    expect(report.integrations.ona.status).toBe("broken");
    expect(report.integrations.ona.hasTokenjuiceMarker).toBe(false);
    expect(report.status).toBe("disabled");
  });

  it("reports broken skills when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        "name: tokenjuice",
        "---",
        "<!-- tokenjuice:ona skill -->",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOnaSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured Ona skill is missing discovery frontmatter");
    expect(doctor.issues).toContain("configured Ona skill is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Ona skill is missing workspace skill path guidance");
    expect(doctor.issues).toContain("configured Ona skill still suggests the full escape hatch");
  });

  it("requires name and description in top-of-file frontmatter", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "name: tokenjuice",
        "description: body text is not discovery frontmatter",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` only when raw bytes are needed.",
        "- Ona Agent discovers this reusable skill from `.ona/skills/tokenjuice/SKILL.md`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOnaSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues).toContain("configured Ona skill is missing the required tokenjuice skill name");
    expect(doctor.issues).toContain("configured Ona skill is missing discovery frontmatter");
    expect(doctor.issues).toContain("configured Ona skill is missing the tokenjuice ownership marker");
  });

  it("accepts quoted YAML skill names in top-of-file frontmatter", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        'name: "tokenjuice" # generated by Ona Agent',
        'description: "Use tokenjuice to compact noisy terminal output in Ona Agent workspaces."',
        "---",
        "",
        "<!-- tokenjuice:ona skill -->",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` only when raw bytes are needed.",
        "- Ona Agent discovers this reusable skill from `.ona/skills/tokenjuice/SKILL.md`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOnaSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it("accepts folded and literal YAML frontmatter descriptions", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });

    for (const description of [
      ["description: >", "  Use tokenjuice to compact noisy terminal output.", "  Keep raw output available when needed."],
      ["description: |-", "  Use tokenjuice to compact noisy terminal output.", "  Keep raw output available when needed."],
    ]) {
      await writeFile(
        skillPath,
        [
          "---",
          "name: tokenjuice",
          ...description,
          "---",
          "",
          "<!-- tokenjuice:ona skill -->",
          "# tokenjuice terminal output compaction",
          "",
          "- Prefer `tokenjuice wrap -- <command>`.",
          "- Use `tokenjuice wrap --raw -- <command>` only when raw bytes are needed.",
          "- Ona Agent discovers this reusable skill from `.ona/skills/tokenjuice/SKILL.md`.",
        ].join("\n"),
        "utf8",
      );

      const doctor = await doctorOnaSkill(skillPath, { projectDir: home });

      expect(doctor.status).toBe("ok");
      expect(doctor.hasTokenjuiceMarker).toBe(true);
    }
  });

  it("accepts URL text in plain YAML frontmatter descriptions", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        "name: tokenjuice",
        "description: See https://ona.com/docs for tokenjuice guidance",
        "---",
        "",
        "<!-- tokenjuice:ona skill -->",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` only when raw bytes are needed.",
        "- Ona Agent discovers this reusable skill from `.ona/skills/tokenjuice/SKILL.md`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOnaSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it.each([
    ["unterminated quoted frontmatter", 'description: "unterminated'],
    ["flow sequence frontmatter", "description: [unterminated"],
    ["nested mapping-like frontmatter", "description: foo: bar"],
    ["invalid double-quoted escape", 'description: "bad \\q scalar"'],
    ["embedded unescaped double quote", 'description: "bad " scalar"'],
    ["block sequence indicator", "description: - broken"],
    ["explicit mapping indicator", "description: ? broken"],
    ["mapping value indicator", "description: : broken"],
  ])("reports invalid YAML for %s", async (_name, descriptionLine) => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        "name: tokenjuice",
        descriptionLine,
        "---",
        "",
        "<!-- tokenjuice:ona skill -->",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` only when raw bytes are needed.",
        "- Ona Agent discovers this reusable skill from `.ona/skills/tokenjuice/SKILL.md`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOnaSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Ona skill has invalid discovery frontmatter");
  });

  it("rejects duplicate YAML frontmatter keys", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        "name: tokenjuice",
        "description: tokenjuice guidance",
        "name: other",
        "---",
        "",
        "<!-- tokenjuice:ona skill -->",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` only when raw bytes are needed.",
        "- Ona Agent discovers this reusable skill from `.ona/skills/tokenjuice/SKILL.md`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOnaSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Ona skill has invalid discovery frontmatter");
  });

  it("does not treat inline hash suffixes as YAML comments", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        "name: tokenjuice#custom",
        "description: tokenjuice guidance",
        "---",
        "",
        "<!-- tokenjuice:ona skill -->",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` only when raw bytes are needed.",
        "- Ona Agent discovers this reusable skill from `.ona/skills/tokenjuice/SKILL.md`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOnaSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Ona skill is missing the required tokenjuice skill name");
  });

  it("uses ONA_PROJECT_DIR for the default skill path", async () => {
    const home = await createTempDir();
    process.env.ONA_PROJECT_DIR = home;

    const installed = await installOnaSkill();
    const expectedSkillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    const doctor = await doctorOnaSkill();

    expect(installed.skillPath).toBe(expectedSkillPath);
    expect(doctor.skillPath).toBe(expectedSkillPath);
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it("rejects symlinked skill files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.ONA_PROJECT_DIR = home;
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# private context\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".ona", "skills", "tokenjuice", "SKILL.md"));

    await expect(installOnaSkill()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, ".ona", "skills", "tokenjuice", "SKILL.md.bak"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const doctor = await doctorOnaSkill();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
    await expect(doctorOnaSkill(join(home, ".ona", "skills", "tokenjuice", "SKILL.md"), { projectDir: home })).resolves.toMatchObject({
      status: "broken",
      issues: [expect.stringContaining("will not read or write through instruction symlinks")],
    });
  });

  it("rejects explicit paths outside the project", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();

    await expect(
      installOnaSkill(join(outside, ".ona", "skills", "tokenjuice", "SKILL.md"), { projectDir: home }),
    ).rejects.toThrow("outside");
  });

  it("rejects explicit non-default project skill paths", async () => {
    const home = await createTempDir();

    await expect(installOnaSkill(join(home, ".ona", "skills", "other", "SKILL.md"), { projectDir: home })).rejects.toThrow(
      "project-local .ona/skills/tokenjuice/SKILL.md",
    );
  });

  it("rejects symlinked project roots", async () => {
    const home = await createTempDir();
    const link = join(await createTempDir(), "workspace");
    await symlink(home, link);

    await expect(installOnaSkill(undefined, { projectDir: link })).rejects.toThrow("instruction symlinks");
  });

  it("canonicalizes symlinked project ancestors before writing", async () => {
    const realParent = await createTempDir();
    const project = join(realParent, "project");
    await mkdir(project);
    const linkParent = join(await createTempDir(), "linked-parent");
    await symlink(realParent, linkParent);

    const installed = await installOnaSkill(undefined, { projectDir: join(linkParent, "project") });

    expect(installed.skillPath).toBe(join(project, ".ona", "skills", "tokenjuice", "SKILL.md"));
    await expect(readFile(installed.skillPath, "utf8")).resolves.toContain("# tokenjuice terminal output compaction");
  });

  it("accepts explicit skill paths through symlinked project ancestors", async () => {
    const realParent = await createTempDir();
    const project = join(realParent, "project");
    await mkdir(project);
    const linkParent = join(await createTempDir(), "linked-parent");
    await symlink(realParent, linkParent);
    const linkedProject = join(linkParent, "project");
    const linkedSkillPath = join(linkedProject, ".ona", "skills", "tokenjuice", "SKILL.md");

    const installed = await installOnaSkill(linkedSkillPath, { projectDir: linkedProject });

    expect(installed.skillPath).toBe(join(project, ".ona", "skills", "tokenjuice", "SKILL.md"));
    await expect(readFile(installed.skillPath, "utf8")).resolves.toContain("# tokenjuice terminal output compaction");
  });

  it("rejects symlinked skill path components", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await mkdir(join(outside, "skills", "tokenjuice"), { recursive: true });
    await symlink(outside, join(home, ".ona"));

    await expect(installOnaSkill(undefined, { projectDir: home })).rejects.toThrow("instruction symlinks");
  });

  it("does not fail doctors for missing default skills under symlinked roots", async () => {
    const home = await createTempDir();
    const link = join(await createTempDir(), "workspace");
    await symlink(home, link);
    for (const key of envKeys) {
      process.env[key] = link;
    }

    const direct = await doctorOnaSkill(undefined, { projectDir: link });
    const aggregate = await doctorInstalledHooks({ projectDir: link });

    expect(direct.status).toBe("disabled");
    expect(direct.hasTokenjuiceMarker).toBe(false);
    expect(direct.hasUnsafePathIssue).toBe(false);
    expect(aggregate.integrations.ona.status).toBe("disabled");
    expect(aggregate.integrations.ona.hasTokenjuiceMarker).toBe(false);
    expect(aggregate.integrations.ona.hasUnsafePathIssue).toBe(false);
  });

  it("does not write through sibling temp or backup symlinks", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    const tempTarget = join(outside, "tmp-target.md");
    const backupTarget = join(outside, "backup-target.md");
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, "# project context\n", "utf8");
    await writeFile(tempTarget, "do not touch temp\n", "utf8");
    await writeFile(backupTarget, "do not touch backup\n", "utf8");
    await symlink(tempTarget, `${skillPath}.tmp`);

    await expect(installOnaSkill(skillPath, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );

    await expect(readFile(tempTarget, "utf8")).resolves.toBe("do not touch temp\n");
    expect((await lstat(`${skillPath}.tmp`)).isSymbolicLink()).toBe(true);
    await symlink(backupTarget, `${skillPath}.bak`);

    await rm(`${skillPath}.tmp`);
    await expect(installOnaSkill(skillPath, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(readFile(backupTarget, "utf8")).resolves.toBe("do not touch backup\n");
  });

  it("surfaces unsafe default skills in aggregate doctor without reading them", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await mkdir(join(home, ".ona", "skills", "tokenjuice"), { recursive: true });
    await writeFile(join(outside, "shared-skill.md"), "# shared Ona skill\n", "utf8");
    await symlink(join(outside, "shared-skill.md"), join(home, ".ona", "skills", "tokenjuice", "SKILL.md"));

    const report = await doctorInstalledHooks();

    expect(report.integrations.ona.status).toBe("broken");
    expect(report.integrations.ona.hasUnsafePathIssue).toBe(true);
    expect(report.status).toBe("broken");
  });

  it("defaults to the git root skill from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installOnaSkill();
    const root = await realpath(home);

    expect(installed.skillPath).toBe(join(root, ".ona", "skills", "tokenjuice", "SKILL.md"));
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installOnaSkill(undefined, { projectDir: home });

    const report = await doctorInstalledHooks();

    expect(report.integrations.ona.status).toBe("ok");
    expect(report.integrations.ona.skillPath).toBe(join(home, ".ona", "skills", "tokenjuice", "SKILL.md"));
    expect(report.integrations.ona.hasTokenjuiceMarker).toBe(true);
  });

  it("reports and removes legacy AGENTS.md marker blocks", async () => {
    const home = await createTempDir();
    const legacyPath = join(home, "AGENTS.md");
    await writeFile(
      legacyPath,
      [
        "# project instructions",
        "",
        "<!-- tokenjuice:ona begin -->",
        "## tokenjuice terminal output compaction",
        "- When running terminal commands through Ona Agent, prefer `tokenjuice wrap -- <command>`.",
        "<!-- tokenjuice:ona end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOnaSkill(undefined, { projectDir: home });

    expect(doctor.status).toBe("warn");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.hasUnsafePathIssue).toBe(false);
    expect(doctor.issues[0]).toContain("legacy Ona AGENTS.md tokenjuice instructions are still installed");
    expect(doctor.checkedPaths).toEqual([legacyPath]);

    const removed = await uninstallOnaSkill(undefined, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(removed.legacyRemoved).toBe(true);
    await expect(readFile(legacyPath, "utf8")).resolves.toBe("# project instructions\n");
  });

  it("removes legacy AGENTS.md marker blocks when installing the skill", async () => {
    const home = await createTempDir();
    const legacyPath = join(home, "AGENTS.md");
    await writeFile(
      legacyPath,
      [
        "<!-- tokenjuice:ona begin -->",
        "## tokenjuice terminal output compaction",
        "<!-- tokenjuice:ona end -->",
      ].join("\n"),
      "utf8",
    );

    const installed = await installOnaSkill(undefined, { projectDir: home });
    const doctor = await doctorOnaSkill(undefined, { projectDir: home });

    expect(installed.legacyRemoved).toBe(true);
    expect(doctor.status).toBe("ok");
    await expect(access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("migrates legacy AGENTS.md marker blocks for explicit skill paths", async () => {
    const home = await createTempDir();
    const legacyPath = join(home, "AGENTS.md");
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await writeFile(
      legacyPath,
      [
        "<!-- tokenjuice:ona begin -->",
        "## tokenjuice terminal output compaction",
        "<!-- tokenjuice:ona end -->",
      ].join("\n"),
      "utf8",
    );

    const installed = await installOnaSkill(skillPath, { projectDir: home });
    const doctor = await doctorOnaSkill(skillPath, { projectDir: home });

    expect(installed.legacyRemoved).toBe(true);
    expect(doctor.status).toBe("ok");
    await expect(access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes legacy AGENTS.md marker blocks for explicit skill-path uninstall", async () => {
    const home = await createTempDir();
    const legacyPath = join(home, "AGENTS.md");
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await installOnaSkill(skillPath, { projectDir: home });
    await writeFile(
      legacyPath,
      [
        "<!-- tokenjuice:ona begin -->",
        "## tokenjuice terminal output compaction",
        "<!-- tokenjuice:ona end -->",
      ].join("\n"),
      "utf8",
    );

    const removed = await uninstallOnaSkill(skillPath, { projectDir: home });
    const doctor = await doctorOnaSkill(skillPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(removed.legacyRemoved).toBe(true);
    expect(doctor.status).toBe("disabled");
    await expect(access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("skips unrelated symlinked AGENTS.md files during legacy cleanup", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const sharedInstructions = join(outside, "AGENTS.md");
    await writeFile(sharedInstructions, "# shared project context\n", "utf8");
    await symlink(sharedInstructions, join(home, "AGENTS.md"));

    const installed = await installOnaSkill(undefined, { projectDir: home });

    expect(installed.skillPath).toBe(join(home, ".ona", "skills", "tokenjuice", "SKILL.md"));
    expect(installed.legacyRemoved).toBe(false);
    await expect(readFile(sharedInstructions, "utf8")).resolves.toBe("# shared project context\n");
  });

  it("rejects malformed legacy marker structures before writing the skill", async () => {
    const home = await createTempDir();
    const legacyPath = join(home, "AGENTS.md");
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await writeFile(
      legacyPath,
      [
        "<!-- tokenjuice:ona begin -->",
        "old complete block",
        "<!-- tokenjuice:ona end -->",
        "<!-- tokenjuice:ona begin -->",
        "dangling start",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOnaSkill(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain(
      "configured legacy Ona instructions have malformed tokenjuice markers; remove the dangling marker manually, then rerun tokenjuice install ona",
    );
    await expect(installOnaSkill(undefined, { projectDir: home })).rejects.toThrow(/cannot safely migrate malformed tokenjuice markers/u);
    await expect(access(skillPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(legacyPath, "utf8")).resolves.toContain("dangling start");
  });

  it("migrates duplicate complete legacy AGENTS.md blocks", async () => {
    const home = await createTempDir();
    const legacyPath = join(home, "AGENTS.md");
    await writeFile(
      legacyPath,
      [
        "# project instructions",
        "",
        "<!-- tokenjuice:ona begin -->",
        "old block one",
        "<!-- tokenjuice:ona end -->",
        "",
        "<!-- tokenjuice:ona begin -->",
        "old block two",
        "<!-- tokenjuice:ona end -->",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorOnaSkill(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured legacy Ona instructions have multiple tokenjuice blocks; run tokenjuice install ona to repair");

    const installed = await installOnaSkill(undefined, { projectDir: home });

    expect(installed.legacyRemoved).toBe(true);
    await expect(readFile(legacyPath, "utf8")).resolves.toBe("# project instructions\n");
    await expect(readFile(join(home, ".ona", "skills", "tokenjuice", "SKILL.md"), "utf8")).resolves.toContain("name: tokenjuice");
  });

  it("keeps deprecated Ona instruction exports as compatibility aliases", async () => {
    const home = await createTempDir();
    process.env.ONA_PROJECT_DIR = home;

    const installed = await installOnaInstructions();
    const doctor = await doctorOnaInstructions();
    const removed = await uninstallOnaInstructions();

    expect(installed.skillPath).toBe(join(home, ".ona", "skills", "tokenjuice", "SKILL.md"));
    expect(installed.instructionsPath).toBe(installed.skillPath);
    expect(doctor.skillPath).toBe(installed.skillPath);
    expect(doctor.instructionsPath).toBe(installed.skillPath);
    expect(removed.removed).toBe(true);
    expect(removed.instructionsPath).toBe(installed.skillPath);
  });

  it("reports the skill path from deprecated explicit-path uninstall aliases", async () => {
    const home = await createTempDir();
    const legacyPath = join(home, "AGENTS.md");
    const skillPath = join(home, ".ona", "skills", "tokenjuice", "SKILL.md");
    await installOnaSkill(undefined, { projectDir: home });

    const removed = await uninstallOnaInstructions(legacyPath);

    expect(removed.removed).toBe(true);
    expect(removed.skillPath).toBe(skillPath);
    expect(removed.instructionsPath).toBe(skillPath);
  });
});
