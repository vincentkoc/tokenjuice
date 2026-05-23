import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorPiGoSkill,
  doctorInstalledHooks,
  installPiGoSkill,
  uninstallPiGoSkill,
} from "../../src/index.js";
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
  "BOB_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
  "CAGENT_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEBUFF_PROJECT_DIR",
  "CODEGEN_PROJECT_DIR",
  "CODER_AGENTS_PROJECT_DIR",
  "PI_GO_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-pi-go-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

describe("pi-go skill", () => {
  it("installs a workspace skill with pi-go-compatible frontmatter", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".pi", "skills", "tokenjuice", "SKILL.md");

    const result = await installPiGoSkill(skillPath, { projectDir: home });
    const skill = await readFile(skillPath, "utf8");

    expect(result.skillPath).toBe(skillPath);
    expect(result.backupPath).toBeUndefined();
    expect(skill.startsWith("---\nname: tokenjuice\n")).toBe(true);
    expect(skill).toContain("name: tokenjuice");
    expect(skill).toContain("description:");
    expect(skill).toContain("tools: bash");
    expect(skill).toContain("<!-- tokenjuice:pi-go-skill -->");
    expect(skill).toContain("# tokenjuice terminal output compaction");
    expect(skill).toContain("pi-go");
    expect(skill).toContain("tokenjuice wrap -- <command>");
    expect(skill).toContain("tokenjuice wrap --raw -- <command>");
    expect(skill).toContain(".pi/skills/tokenjuice/SKILL.md");
    expect(skill).not.toContain("wrap --full");
  });

  it("backs up an existing skill without clobbering older backups", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".pi", "skills", "tokenjuice", "SKILL.md");
    await installPiGoSkill(skillPath, { projectDir: home });
    await writeFile(skillPath, "# custom skill\n\nkeep me\n", "utf8");
    await writeFile(`${skillPath}.bak`, "# older backup\n", "utf8");

    const result = await installPiGoSkill(skillPath, { projectDir: home });

    expect(result.backupPath).toBe(`${skillPath}.bak.1`);
    await expect(readFile(`${skillPath}.bak`, "utf8")).resolves.toBe("# older backup\n");
    await expect(readFile(`${skillPath}.bak.1`, "utf8")).resolves.toBe("# custom skill\n\nkeep me\n");
    const skill = await readFile(skillPath, "utf8");
    expect(skill).toContain("<!-- tokenjuice:pi-go-skill -->");
    expect(skill).toContain("<!-- tokenjuice:pi-go-restore-backup=.bak.1 -->");
  });

  it("does not create backups on idempotent reinstall", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".pi", "skills", "tokenjuice", "SKILL.md");

    const first = await installPiGoSkill(skillPath, { projectDir: home });
    const second = await installPiGoSkill(skillPath, { projectDir: home });
    const skill = await readFile(skillPath, "utf8");

    expect(first.backupPath).toBeUndefined();
    expect(second.backupPath).toBeUndefined();
    expect(skill).toContain("<!-- tokenjuice:pi-go-skill -->");
    await expect(access(`${skillPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores an exact pre-existing skill on uninstall", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".pi", "skills", "tokenjuice", "SKILL.md");
    const customSkill = "# custom skill\n\nkeep me exactly\n";
    await mkdir(join(home, ".pi", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, customSkill, "utf8");
    await writeFile(`${skillPath}.bak`, "# older backup\n", "utf8");

    const installed = await installPiGoSkill(skillPath, { projectDir: home });
    const removed = await uninstallPiGoSkill(skillPath, { projectDir: home });

    expect(installed.backupPath).toBe(`${skillPath}.bak.1`);
    expect(removed.removed).toBe(true);
    await expect(readFile(skillPath, "utf8")).resolves.toBe(customSkill);
    await expect(readFile(`${skillPath}.bak`, "utf8")).resolves.toBe("# older backup\n");
    await expect(access(`${skillPath}.bak.1`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports installed and uninstalled skill health", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".pi", "skills", "tokenjuice", "SKILL.md");

    await installPiGoSkill(skillPath, { projectDir: home });
    const installed = await doctorPiGoSkill(skillPath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("skill-based");

    const removed = await uninstallPiGoSkill(skillPath, { projectDir: home });
    const disabled = await doctorPiGoSkill(skillPath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
    await expect(access(skillPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("leaves markerless user-owned skills untouched during uninstall", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".pi", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".pi", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, "# tokenjuice terminal output compaction\n\nmanual note\n", "utf8");

    const removed = await uninstallPiGoSkill(skillPath, { projectDir: home });
    const doctor = await doctorPiGoSkill(skillPath, { projectDir: home });

    expect(removed.removed).toBe(false);
    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    await expect(readFile(skillPath, "utf8")).resolves.toBe("# tokenjuice terminal output compaction\n\nmanual note\n");
  });

  it("rejects restore backup symlinks during uninstall without touching the target", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const skillPath = join(home, ".pi", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".pi", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        "name: tokenjuice",
        'description: "Use tokenjuice to compact noisy terminal output in pi-go workspaces."',
        "tools: bash",
        "---",
        "<!-- tokenjuice:pi-go-skill -->",
        "<!-- tokenjuice:pi-go-restore-backup=.bak -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- When pi-go runs terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --raw -- <command>`.",
        "- pi-go discovers this reusable skill from `.pi/skills/tokenjuice/SKILL.md` and still owns shell execution and tool output delivery.",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(outside, "private.md"), "# private backup\n", "utf8");
    await symlink(join(outside, "private.md"), `${skillPath}.bak`);

    await expect(uninstallPiGoSkill(skillPath, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(readFile(skillPath, "utf8")).resolves.toContain("<!-- tokenjuice:pi-go-skill -->");
    await expect(readFile(join(outside, "private.md"), "utf8")).resolves.toBe("# private backup\n");
  });

  it("reports broken skills when required tokenjuice guidance is stale", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".pi", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".pi", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        "name: tokenjuice",
        "---",
        "<!-- tokenjuice:pi-go-skill -->",
        "# tokenjuice terminal output compaction",
        "",
        "- Prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --full -- <command>`.",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorPiGoSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured pi-go skill is missing discovery frontmatter");
    expect(doctor.issues).toContain("configured pi-go skill is missing tool frontmatter");
    expect(doctor.issues).toContain("configured pi-go skill is missing the raw escape hatch");
    expect(doctor.issues).toContain("configured pi-go skill is missing workspace skill path guidance");
    expect(doctor.issues).toContain("configured pi-go skill still suggests the full escape hatch");
  });

  it("reports broken owned skills when discovery frontmatter is not first", async () => {
    const home = await createTempDir();
    const skillPath = join(home, ".pi", "skills", "tokenjuice", "SKILL.md");
    await mkdir(join(home, ".pi", "skills", "tokenjuice"), { recursive: true });
    await writeFile(
      skillPath,
      [
        "<!-- misplaced comment -->",
        "---",
        "name: tokenjuice",
        'description: "Use tokenjuice to compact noisy terminal output in pi-go workspaces."',
        "tools: bash",
        "---",
        "<!-- tokenjuice:pi-go-skill -->",
        "",
        "# tokenjuice terminal output compaction",
        "",
        "- When pi-go runs terminal commands likely to produce long output, prefer `tokenjuice wrap -- <command>`.",
        "- If output looks wrong, rerun with `tokenjuice wrap --raw -- <command>`.",
        "- pi-go discovers this reusable skill from `.pi/skills/tokenjuice/SKILL.md` and still owns shell execution and tool output delivery.",
        "",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorPiGoSkill(skillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues).toContain("configured pi-go skill is missing leading discovery frontmatter");
  });

  it("uses PI_GO_PROJECT_DIR for the default skill path", async () => {
    const home = await createTempDir();
    process.env.PI_GO_PROJECT_DIR = home;

    const installed = await installPiGoSkill();
    const expectedSkillPath = join(home, ".pi", "skills", "tokenjuice", "SKILL.md");
    const doctor = await doctorPiGoSkill();

    expect(installed.skillPath).toBe(expectedSkillPath);
    expect(doctor.skillPath).toBe(expectedSkillPath);
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it("rejects symlinked skill files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.PI_GO_PROJECT_DIR = home;
    await mkdir(join(home, ".pi", "skills", "tokenjuice"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# private context\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".pi", "skills", "tokenjuice", "SKILL.md"));

    await expect(installPiGoSkill()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, ".pi", "skills", "tokenjuice", "SKILL.md.bak"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const doctor = await doctorPiGoSkill();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
  });

  it("rejects sidecar symlinks before installing skills", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const skillPath = join(home, ".pi", "skills", "tokenjuice", "SKILL.md");
    process.env.PI_GO_PROJECT_DIR = home;
    await mkdir(join(home, ".pi", "skills", "tokenjuice"), { recursive: true });
    await writeFile(skillPath, "# project context\n", "utf8");
    await writeFile(join(outside, "private-bak.md"), "# private backup\n", "utf8");
    await writeFile(join(outside, "private-tmp.md"), "# private temp\n", "utf8");

    await symlink(join(outside, "private-bak.md"), `${skillPath}.bak`);
    await expect(installPiGoSkill()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await rm(`${skillPath}.bak`);

    await symlink(join(outside, "private-tmp.md"), `${skillPath}.tmp`);
    await expect(installPiGoSkill()).rejects.toThrow(/will not read or write through instruction symlinks/u);

    await expect(readFile(join(outside, "private-bak.md"), "utf8")).resolves.toBe("# private backup\n");
    await expect(readFile(join(outside, "private-tmp.md"), "utf8")).resolves.toBe("# private temp\n");
  });

  it("constrains explicit skill paths to the project boundary", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideSkillPath = join(outside, ".pi", "skills", "tokenjuice", "SKILL.md");

    process.chdir(home);
    await expect(installPiGoSkill(outsideSkillPath)).rejects.toThrow(/outside/u);
    await expect(installPiGoSkill(outsideSkillPath, { projectDir: home })).rejects.toThrow(/outside/u);
    await expect(uninstallPiGoSkill(outsideSkillPath, { projectDir: home })).rejects.toThrow(/outside/u);

    const doctor = await doctorPiGoSkill(outsideSkillPath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.issues[0]).toContain("outside");
    expect(doctor.fixCommand).toContain("project-local .pi/skills/tokenjuice/SKILL.md path");
    await expect(access(outsideSkillPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects arbitrary in-project explicit skill paths", async () => {
    const home = await createTempDir();
    const readmePath = join(home, "README.md");
    await writeFile(readmePath, "# keep me\n", "utf8");

    await expect(installPiGoSkill(readmePath, { projectDir: home })).rejects.toThrow(
      /only installs the project-local \.pi\/skills\/tokenjuice\/SKILL\.md skill/u,
    );

    const doctor = await doctorPiGoSkill(readmePath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.fixCommand).toContain("project-local .pi/skills/tokenjuice/SKILL.md path");
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

    await expect(installPiGoSkill(join(linkedOutsideDir, "SKILL.md"), { projectDir: home })).rejects.toThrow(
      /outside/u,
    );
    await expect(installPiGoSkill(join(linkedInsideDir, "SKILL.md"), { projectDir: home })).rejects.toThrow(
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

    await expect(installPiGoSkill(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(home, ".pi", "skills", "tokenjuice", "SKILL.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects symlinked project parent directories before writing default skills", async () => {
    const realParent = await createTempDir();
    const links = await createTempDir();
    const realProjectDir = join(realParent, "project");
    const linkedParent = join(links, "linked-parent");
    const linkedProjectDir = join(linkedParent, "project");
    await mkdir(realProjectDir, { recursive: true });
    await symlink(realParent, linkedParent);

    await expect(installPiGoSkill(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(realProjectDir, ".pi", "skills", "tokenjuice", "SKILL.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not count an unsafe uninstalled skill as installed", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await mkdir(join(home, ".pi", "skills", "tokenjuice"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# private context\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".pi", "skills", "tokenjuice", "SKILL.md"));

    const doctor = await doctorPiGoSkill(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("does not read unsafe skill paths for marker evidence", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await mkdir(join(home, ".pi", "skills", "tokenjuice"), { recursive: true });
    await writeFile(join(outside, "private.md"), "<!-- tokenjuice:pi-go-skill -->\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".pi", "skills", "tokenjuice", "SKILL.md"));

    const doctor = await doctorPiGoSkill(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("does not make aggregate doctor fail for an unrelated symlinked default skill", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await mkdir(join(home, ".pi", "skills", "tokenjuice"), { recursive: true });
    await writeFile(join(outside, "shared-skill.md"), "# shared pi-go skill\n", "utf8");
    await symlink(join(outside, "shared-skill.md"), join(home, ".pi", "skills", "tokenjuice", "SKILL.md"));

    const report = await doctorInstalledHooks();

    expect(report.integrations["pi-go"].status).toBe("broken");
    expect(report.integrations["pi-go"].hasTokenjuiceMarker).toBe(false);
    expect(report.status).toBe("disabled");
  });

  it("defaults to the git root skill from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installPiGoSkill();
    const root = await realpath(home);

    expect(installed.skillPath).toBe(join(root, ".pi", "skills", "tokenjuice", "SKILL.md"));
  });

  it("is included in aggregate hook doctor output", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await installPiGoSkill(undefined, { projectDir: home });

    const report = await doctorInstalledHooks();

    expect(report.integrations["pi-go"].status).toBe("ok");
    expect(report.integrations["pi-go"].hasTokenjuiceMarker).toBe(true);
    expect(report.integrations["pi-go"].skillPath).toBe(join(home, ".pi", "skills", "tokenjuice", "SKILL.md"));
  });
});
