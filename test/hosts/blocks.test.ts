import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorBlocksSkill,
  doctorInstalledHooks,
  installBlocksSkill,
  uninstallBlocksSkill,
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-blocks-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

describe("Blocks skill", () => {
  it("installs a workspace skill with Blocks-compatible frontmatter", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md");

    const result = await installBlocksSkill(skillPath, { projectDir: home });
    const skill = await readFile(skillPath, "utf8");

    expect(result.skillPath).toBe(skillPath);
    expect(result.backupPath).toBeUndefined();
    expect(skill).toContain("name: tokenjuice-blocks");
    expect(skill).toContain("description:");
    expect(skill).toContain("<!-- tokenjuice:blocks skill -->");
    expect(skill).toContain("# tokenjuice terminal output compaction");
    expect(skill).toContain("Blocks");
    expect(skill).toContain("tokenjuice wrap -- <command>");
    expect(skill).toContain("tokenjuice wrap --raw -- <command>");
    expect(skill).toContain(".agents/skills/tokenjuice-blocks/SKILL.md");
    expect(skill).not.toContain("wrap --full");
  });

  it("backs up an existing skill before replacing it", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md");
    await installBlocksSkill(skillPath, { projectDir: home });
    await writeFile(skillPath, "# custom skill\n\nkeep me\n", "utf8");

    const result = await installBlocksSkill(skillPath, { projectDir: home });

    expect(result.backupPath).toBe(`${skillPath}.bak`);
    await expect(readFile(`${skillPath}.bak`, "utf8")).resolves.toContain("keep me");
    await expect(readFile(skillPath, "utf8")).resolves.toContain("# tokenjuice terminal output compaction");
  });

  it("reports installed and uninstalled skill health", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md");

    await installBlocksSkill(skillPath, { projectDir: home });
    const installed = await doctorBlocksSkill(skillPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.hasUnsafePathIssue).toBe(false);
    expect(installed.advisories[0]).toContain("skill-based");

    const removed = await uninstallBlocksSkill(skillPath, { projectDir: home });
    const disabled = await doctorBlocksSkill(skillPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(skillPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves user-owned tokenjuice skill files on uninstall", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md");
    await mkdir(join(home, ".agents", "skills", "tokenjuice-blocks"), { recursive: true });
    await writeFile(skillPath, "# custom tokenjuice skill\n\nkeep me\n", "utf8");

    const removed = await uninstallBlocksSkill(undefined, { projectDir: home });

    expect(removed.removed).toBe(false);
    await expect(readFile(skillPath, "utf8")).resolves.toContain("keep me");
  });

  it("preserves user-owned skills that mention tokenjuice compaction", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md");
    await mkdir(join(home, ".agents", "skills", "tokenjuice-blocks"), { recursive: true });
    await writeFile(skillPath, "# tokenjuice terminal output compaction\n\ncustom owner notes\n", "utf8");

    const removed = await uninstallBlocksSkill(undefined, { projectDir: home });

    expect(removed.removed).toBe(false);
    await expect(readFile(skillPath, "utf8")).resolves.toContain("custom owner notes");
  });

  it("reports broken skills when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md");
    await mkdir(join(home, ".agents", "skills", "tokenjuice-blocks"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        "name: tokenjuice-blocks",
        "---",
        "<!-- tokenjuice:blocks skill -->",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorBlocksSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured Blocks skill is missing discovery frontmatter");
    expect(doctor.issues).toContain("configured Blocks skill is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Blocks skill is missing workspace skill path guidance");
    expect(doctor.issues).toContain("configured Blocks skill still suggests the full escape hatch");
  });

  it("requires name and description in top-of-file frontmatter", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md");
    await mkdir(join(home, ".agents", "skills", "tokenjuice-blocks"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "# tokenjuice terminal output compaction",
        "",
        "name: tokenjuice-blocks",
        "description: body text is not discovery frontmatter",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- Use `tokenjuice wrap --raw -- <command>` only when raw bytes are needed.",
        "- Blocks discovers this reusable skill from `.agents/skills/tokenjuice-blocks/SKILL.md`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorBlocksSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues).toContain("configured Blocks skill is missing the tokenjuice ownership marker");
    expect(doctor.issues).toContain("configured Blocks skill is missing the required tokenjuice-blocks skill name");
    expect(doctor.issues).toContain("configured Blocks skill is missing discovery frontmatter");
  });

  it("uses BLOCKS_PROJECT_DIR for the default skill path", async () => {
    const home = await createTempDir();
    process.env.BLOCKS_PROJECT_DIR = home;

    const installed = await installBlocksSkill();
    const expectedSkillPath = join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md");
    const doctor = await doctorBlocksSkill();

    expect(installed.skillPath).toBe(expectedSkillPath);
    expect(doctor.skillPath).toBe(expectedSkillPath);
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it("rejects symlinked skill files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.BLOCKS_PROJECT_DIR = home;
    await mkdir(join(home, ".agents", "skills", "tokenjuice-blocks"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# private context\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md"));

    await expect(installBlocksSkill()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md.bak"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const doctor = await doctorBlocksSkill();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
    await expect(
      doctorBlocksSkill(join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md"), { projectDir: home }),
    ).resolves.toMatchObject({
      status: "broken",
      issues: [expect.stringContaining("will not read or write through instruction symlinks")],
    });
  });

  it("rejects explicit paths outside the project", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();

    await expect(
      installBlocksSkill(join(outside, ".agents", "skills", "tokenjuice-blocks", "SKILL.md"), { projectDir: home }),
    ).rejects.toThrow("outside");
  });

  it("rejects explicit non-default project skill paths", async () => {
    const home = await createTempDir();

    await expect(
      installBlocksSkill(join(home, ".agents", "skills", "other", "SKILL.md"), { projectDir: home }),
    ).rejects.toThrow("project-local .agents/skills/tokenjuice-blocks/SKILL.md");
  });

  it("rejects symlinked project roots", async () => {
    const home = await createTempDir();
    const link = join(await createTempDir(), "workspace");
    await symlink(home, link);

    await expect(installBlocksSkill(undefined, { projectDir: link })).rejects.toThrow("instruction symlinks");
  });

  it("canonicalizes symlinked project ancestors before writing", async () => {
    const realParent = await createTempDir();
    const project = join(realParent, "project");
    await mkdir(project);
    const linkParent = join(await createTempDir(), "linked-parent");
    await symlink(realParent, linkParent);

    const installed = await installBlocksSkill(undefined, { projectDir: join(linkParent, "project") });

    expect(installed.skillPath).toBe(join(project, ".agents", "skills", "tokenjuice-blocks", "SKILL.md"));
    await expect(readFile(installed.skillPath, "utf8")).resolves.toContain("# tokenjuice terminal output compaction");
  });

  it("accepts explicit skill paths through symlinked project ancestors", async () => {
    const realParent = await createTempDir();
    const project = join(realParent, "project");
    await mkdir(project);
    const linkParent = join(await createTempDir(), "linked-parent");
    await symlink(realParent, linkParent);
    const linkedProject = join(linkParent, "project");
    const linkedSkillPath = join(linkedProject, ".agents", "skills", "tokenjuice-blocks", "SKILL.md");

    const installed = await installBlocksSkill(linkedSkillPath, { projectDir: linkedProject });

    expect(installed.skillPath).toBe(join(project, ".agents", "skills", "tokenjuice-blocks", "SKILL.md"));
    await expect(readFile(installed.skillPath, "utf8")).resolves.toContain("# tokenjuice terminal output compaction");
  });

  it("rejects symlinked skill path components", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await mkdir(join(outside, "skills", "tokenjuice-blocks"), { recursive: true });
    await symlink(outside, join(home, ".agents"));

    await expect(installBlocksSkill(undefined, { projectDir: home })).rejects.toThrow("instruction symlinks");
  });

  it("does not fail doctors for missing default skills under symlinked roots", async () => {
    const home = await createTempDir();
    const link = join(await createTempDir(), "workspace");
    await symlink(home, link);
    for (const key of envKeys) {
      process.env[key] = link;
    }

    const direct = await doctorBlocksSkill(undefined, { projectDir: link });
    const aggregate = await doctorInstalledHooks({ projectDir: link });

    expect(direct.status).toBe("disabled");
    expect(direct.hasTokenjuiceMarker).toBe(false);
    expect(direct.hasUnsafePathIssue).toBe(false);
    expect(aggregate.integrations["blocks"].status).toBe("disabled");
    expect(aggregate.integrations["blocks"].hasTokenjuiceMarker).toBe(false);
    expect(aggregate.integrations["blocks"].hasUnsafePathIssue).toBe(false);
  });

  it("rejects sibling temp or backup symlinks", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const skillPath = join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md");
    const tempTarget = join(outside, "tmp-target.md");
    const backupTarget = join(outside, "backup-target.md");
    await mkdir(join(home, ".agents", "skills", "tokenjuice-blocks"), { recursive: true });
    await writeFile(skillPath, "# project context\n", "utf8");
    await writeFile(tempTarget, "do not touch temp\n", "utf8");
    await writeFile(backupTarget, "do not touch backup\n", "utf8");
    await symlink(tempTarget, `${skillPath}.tmp`);

    await expect(installBlocksSkill(skillPath, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );

    await expect(readFile(tempTarget, "utf8")).resolves.toBe("do not touch temp\n");
    expect((await lstat(`${skillPath}.tmp`)).isSymbolicLink()).toBe(true);
    await symlink(backupTarget, `${skillPath}.bak`);

    await rm(`${skillPath}.tmp`);
    await expect(installBlocksSkill(skillPath, { projectDir: home })).rejects.toThrow(
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
    await mkdir(join(home, ".agents", "skills", "tokenjuice-blocks"), { recursive: true });
    await writeFile(join(outside, "shared-skill.md"), "# shared Blocks skill\n", "utf8");
    await symlink(join(outside, "shared-skill.md"), join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md"));

    const report = await doctorInstalledHooks();

    expect(report.integrations["blocks"].status).toBe("broken");
    expect(report.integrations["blocks"].hasUnsafePathIssue).toBe(true);
    expect(report.status).toBe("broken");
  });

  it("does not count user-owned Blocks skill files as aggregate tokenjuice installs", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    const skillPath = join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md");
    await mkdir(join(home, ".agents", "skills", "tokenjuice-blocks"), { recursive: true });
    await writeFile(skillPath, "# custom skill\n", "utf8");

    const report = await doctorInstalledHooks();

    expect(report.integrations["blocks"].status).toBe("broken");
    expect(report.integrations["blocks"].hasTokenjuiceMarker).toBe(false);
    expect(report.status).toBe("disabled");
  });

  it("defaults to the git root skill from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installBlocksSkill();
    const root = await realpath(home);

    expect(installed.skillPath).toBe(join(root, ".agents", "skills", "tokenjuice-blocks", "SKILL.md"));
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installBlocksSkill(undefined, { projectDir: home });

    const report = await doctorInstalledHooks();

    expect(report.integrations["blocks"].status).toBe("ok");
    expect(report.integrations["blocks"].skillPath).toBe(join(home, ".agents", "skills", "tokenjuice-blocks", "SKILL.md"));
  });
});
