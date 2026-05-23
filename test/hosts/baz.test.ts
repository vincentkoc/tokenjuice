import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorBazSkill, doctorInstalledHooks, installBazSkill, uninstallBazSkill } from "../../src/index.js";
import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-baz-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

describe("Baz skill", () => {
  it("installs a workspace skill with Baz-compatible frontmatter", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".baz", "skills", "tokenjuice", "SKILL.md");

    const result = await installBazSkill(skillPath, { projectDir: home });
    const skill = await readFile(skillPath, "utf8");

    expect(result.skillPath).toBe(skillPath);
    expect(result.backupPath).toBeUndefined();
    expect(skill).toContain("name: tokenjuice");
    expect(skill).toContain("description:");
    expect(skill).toContain("<!-- tokenjuice:baz-skill -->");
    expect(skill).toContain("# tokenjuice terminal output compaction");
    expect(skill).toContain("Baz");
    expect(skill).toContain("tokenjuice wrap -- <command>");
    expect(skill).toContain("tokenjuice wrap --raw -- <command>");
    expect(skill).toContain(".baz/skills/tokenjuice/SKILL.md");
    expect(skill).not.toContain("wrap --full");
  });

  it("backs up an existing skill before replacing it", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".baz", "skills", "tokenjuice", "SKILL.md");
    await installBazSkill(skillPath, { projectDir: home });
    await writeFile(skillPath, "# custom skill\n\nkeep me\n", "utf8");

    const result = await installBazSkill(skillPath, { projectDir: home });

    expect(result.backupPath).toBe(`${skillPath}.bak`);
    await expect(readFile(`${skillPath}.bak`, "utf8")).resolves.toContain("keep me");
    await expect(readFile(skillPath, "utf8")).resolves.toContain("# tokenjuice terminal output compaction");
  });

  it("does not overwrite the original backup on reinstall", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".baz", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".baz", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, "# custom skill\n\nkeep me\n", "utf8");

    const first = await installBazSkill(skillPath, { projectDir: home });
    const second = await installBazSkill(skillPath, { projectDir: home });

    expect(first.backupPath).toBe(`${skillPath}.bak`);
    expect(second.backupPath).toBe(`${skillPath}.bak.1`);
    await expect(readFile(`${skillPath}.bak`, "utf8")).resolves.toContain("keep me");
    await expect(readFile(`${skillPath}.bak.1`, "utf8")).resolves.toContain("# tokenjuice terminal output compaction");
  });

  it("reports installed and uninstalled skill health", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".baz", "skills", "tokenjuice", "SKILL.md");

    await installBazSkill(skillPath, { projectDir: home });
    const installed = await doctorBazSkill(skillPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("skill-based");

    const removed = await uninstallBazSkill(skillPath, { projectDir: home });
    const disabled = await doctorBazSkill(skillPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(skillPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports broken skills when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".baz", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".baz", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        "name: tokenjuice",
        "---",
        "<!-- tokenjuice:baz-skill -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorBazSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured Baz skill is missing discovery frontmatter");
    expect(doctor.issues).toContain("configured Baz skill is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured Baz skill is missing workspace skill path guidance");
    expect(doctor.issues).toContain("configured Baz skill still suggests the full escape hatch");
  });

  it("uses BAZ_PROJECT_DIR for the default skill path", async () => {
    const home = await createTempDir();
    process.env.BAZ_PROJECT_DIR = home;

    const installed = await installBazSkill();
    const expectedSkillPath = join(home, ".baz", "skills", "tokenjuice", "SKILL.md");
    const doctor = await doctorBazSkill();

    expect(installed.skillPath).toBe(expectedSkillPath);
    expect(doctor.skillPath).toBe(expectedSkillPath);
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it("rejects symlinked skill files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.BAZ_PROJECT_DIR = home;
    await mkdir(join(home, ".baz", "skills", "tokenjuice"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# private context\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".baz", "skills", "tokenjuice", "SKILL.md"));

    await expect(installBazSkill()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, ".baz", "skills", "tokenjuice", "SKILL.md.bak"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const doctor = await doctorBazSkill();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
    await expect(doctorBazSkill(join(home, ".baz", "skills", "tokenjuice", "SKILL.md"), { projectDir: home })).resolves.toMatchObject({
      status: "broken",
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: true,
      issues: [expect.stringContaining("will not read or write through instruction symlinks")],
    });
  });

  it("rejects sidecar symlinks before installing skills", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const skillPath = join(home, ".baz", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".baz", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, "# project context\n", "utf8");
    await writeFile(join(outside, "private-bak.md"), "# private backup\n", "utf8");
    await writeFile(join(outside, "private-tmp.md"), "# private temp\n", "utf8");

    await symlink(join(outside, "private-bak.md"), `${skillPath}.bak`);
    await expect(installBazSkill(undefined, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await rm(`${skillPath}.bak`);

    await symlink(join(outside, "private-tmp.md"), `${skillPath}.tmp`);
    await expect(installBazSkill(undefined, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );

    await expect(readFile(join(outside, "private-bak.md"), "utf8")).resolves.toBe("# private backup\n");
    await expect(readFile(join(outside, "private-tmp.md"), "utf8")).resolves.toBe("# private temp\n");
  });

  it("constrains explicit skill paths to the project boundary", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideSkillPath = join(outside, ".baz", "skills", "tokenjuice", "SKILL.md");

    process.chdir(home);
    await expect(installBazSkill(outsideSkillPath)).rejects.toThrow(/outside/u);
    await expect(installBazSkill(outsideSkillPath, { projectDir: home })).rejects.toThrow(/outside/u);
    await expect(uninstallBazSkill(outsideSkillPath, { projectDir: home })).rejects.toThrow(/outside/u);

    const doctor = await doctorBazSkill(outsideSkillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(doctor.issues[0]).toContain("outside");
    expect(doctor.fixCommand).toContain("project-local .baz/skills/tokenjuice/SKILL.md path");
    await expect(access(outsideSkillPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects arbitrary in-project explicit skill paths", async () => {
    const home = await createTempDir();
    const readmePath = join(home, "README.md");
    await writeFile(readmePath, "# keep me\n", "utf8");

    await expect(installBazSkill(readmePath, { projectDir: home })).rejects.toThrow(
      /only installs the project-local \.baz\/skills\/tokenjuice\/SKILL\.md skill/u,
    );

    const doctor = await doctorBazSkill(readmePath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(doctor.fixCommand).toContain("project-local .baz/skills/tokenjuice/SKILL.md path");
    await expect(readFile(readmePath, "utf8")).resolves.toBe("# keep me\n");
  });

  it("rejects explicit skill paths under symlinked parents inside or outside projectDir", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const linkedOutsideDir = join(home, "linked-outside");
    const linkedInsideTarget = join(home, "redirected");
    const linkedInsideDir = join(home, "linked-inside");
    await mkdir(linkedInsideTarget, { recursive: true });
    await symlink(outside, linkedOutsideDir);
    await symlink(linkedInsideTarget, linkedInsideDir);

    await expect(installBazSkill(join(linkedOutsideDir, "SKILL.md"), { projectDir: home })).rejects.toThrow(
      /outside/u,
    );
    await expect(installBazSkill(join(linkedInsideDir, "SKILL.md"), { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(outside, "SKILL.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(linkedInsideTarget, "SKILL.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked project roots before writing default skills", async () => {
    const home = await createTempDir();
    const links = await createTempDir();
    const linkedProjectDir = join(links, "project");
    await symlink(home, linkedProjectDir);

    await expect(installBazSkill(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(home, ".baz", "skills", "tokenjuice", "SKILL.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not count absent default skills as installed when the project root is unsafe", async () => {
    const home = await createTempDir();
    const links = await createTempDir();
    const linkedProjectDir = join(links, "project");
    await symlink(home, linkedProjectDir);

    const doctor = await doctorBazSkill(undefined, { projectDir: linkedProjectDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("rejects symlinked project parent directories before writing default skills", async () => {
    const realParent = await createTempDir();
    const links = await createTempDir();
    const realProjectDir = join(realParent, "project");
    const linkedParent = join(links, "linked-parent");
    const linkedProjectDir = join(linkedParent, "project");
    await mkdir(realProjectDir, { recursive: true });
    await symlink(realParent, linkedParent);

    await expect(installBazSkill(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(realProjectDir, ".baz", "skills", "tokenjuice", "SKILL.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not remove markerless user-owned skills", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".baz", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".baz", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, "# custom Baz skill\n", "utf8");

    const removed = await uninstallBazSkill(undefined, { projectDir: home });
    const doctor = await doctorBazSkill(undefined, { projectDir: home });

    expect(removed.removed).toBe(false);
    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    await expect(readFile(skillPath, "utf8")).resolves.toBe("# custom Baz skill\n");
  });

  it("does not remove user-owned skills with tokenjuice-looking headings", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".baz", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".baz", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, "# tokenjuice terminal output compaction\n\nkeep this user skill\n", "utf8");

    const removed = await uninstallBazSkill(undefined, { projectDir: home });
    const doctor = await doctorBazSkill(undefined, { projectDir: home });

    expect(removed.removed).toBe(false);
    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues).toContain("configured Baz skill is missing the tokenjuice ownership marker");
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    await expect(readFile(skillPath, "utf8")).resolves.toContain("keep this user skill");
  });

  it("does not follow unsafe skill symlinks to collect marker evidence", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await mkdir(join(home, ".baz", "skills", "tokenjuice"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# tokenjuice terminal output compaction\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".baz", "skills", "tokenjuice", "SKILL.md"));

    const doctor = await doctorBazSkill(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(isInstalledHookIntegration(doctor)).toBe(true);
  });

  it("surfaces unsafe default skills in aggregate doctor without reading them", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await mkdir(join(home, ".baz", "skills", "tokenjuice"), { recursive: true });
    await writeFile(join(outside, "shared-skill.md"), "# shared Baz skill\n", "utf8");
    await symlink(join(outside, "shared-skill.md"), join(home, ".baz", "skills", "tokenjuice", "SKILL.md"));

    const report = await doctorInstalledHooks();

    expect(report.integrations.baz.status).toBe("broken");
    expect(report.integrations.baz.hasTokenjuiceMarker).toBe(false);
    expect(report.integrations.baz.hasUnsafePathIssue).toBe(true);
    expect(report.status).toBe("broken");
  });

  it("does not surface missing default skills from unsafe projects in aggregate doctor", async () => {
    const home = await createTempDir();
    const links = await createTempDir();
    const linkedProjectDir = join(links, "project");
    await symlink(home, linkedProjectDir);
    for (const key of envKeys) {
      process.env[key] = home;
    }
    process.env.BAZ_PROJECT_DIR = linkedProjectDir;

    const report = await doctorInstalledHooks();

    expect(report.integrations.baz.status).toBe("disabled");
    expect(report.integrations.baz.hasTokenjuiceMarker).toBe(false);
    expect(report.integrations.baz.hasUnsafePathIssue).toBe(false);
    expect(report.status).toBe("disabled");
  });

  it("defaults to the git root skill from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installBazSkill();
    const root = await realpath(home);

    expect(installed.skillPath).toBe(join(root, ".baz", "skills", "tokenjuice", "SKILL.md"));
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installBazSkill(undefined, { projectDir: home });

    const report = await doctorInstalledHooks();

    expect(report.integrations.baz.status).toBe("ok");
    expect(report.integrations.baz.hasTokenjuiceMarker).toBe(true);
    expect(report.integrations.baz.skillPath).toBe(join(home, ".baz", "skills", "tokenjuice", "SKILL.md"));
  });
});
