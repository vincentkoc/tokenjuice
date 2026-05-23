import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorGreptileRule,
  doctorInstalledHooks,
  installGreptileRule,
  uninstallGreptileRule,
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-greptile-test-"));
  const realDir = await realpath(dir);
  tempDirs.push(realDir);
  return realDir;
}

describe("Greptile rules", () => {
  function countTokenjuiceBlocks(text: string): number {
    return text.match(/<!-- tokenjuice:greptile begin -->/gu)?.length ?? 0;
  }

  it("installs a marker-delimited rules block", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".greptile", "rules.md");

    const result = await installGreptileRule(rulePath, { projectDir: home });
    const rule = await readFile(rulePath, "utf8");

    expect(result.rulePath).toBe(rulePath);
    expect(result.backupPath).toBeUndefined();
    expect(rule).toContain("<!-- tokenjuice:greptile begin -->");
    expect(rule).toContain("tokenjuice terminal output compaction");
    expect(rule).toContain("tokenjuice wrap -- <command>");
    expect(rule).toContain("tokenjuice wrap --raw -- <command>");
    expect(rule).not.toContain("wrap --full");
  });

  it("preserves existing Greptile rules and backs them up", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".greptile", "rules.md");
    await installGreptileRule(rulePath, { projectDir: home });
    await writeFile(rulePath, "# Review standards\n\n- keep this\n", "utf8");

    const result = await installGreptileRule(rulePath, { projectDir: home });
    const rule = await readFile(rulePath, "utf8");

    expect(result.backupPath).toBe(`${rulePath}.bak`);
    await expect(readFile(`${rulePath}.bak`, "utf8")).resolves.toContain("keep this");
    expect(rule).toContain("- keep this");
    expect(rule).toContain("<!-- tokenjuice:greptile begin -->");
  });

  it("replaces stale tokenjuice rules without duplicating the block", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".greptile", "rules.md");
    await mkdir(join(home, ".greptile"), { recursive: true });
    await writeFile(
      rulePath,
      [
        "# Review standards",
        "",
        "- keep this",
        "",
        "<!-- tokenjuice:greptile begin -->",
        "stale tokenjuice block",
        "<!-- tokenjuice:greptile end -->",
      ].join("\n"),
      "utf8",
    );

    await installGreptileRule(rulePath, { projectDir: home });
    const rule = await readFile(rulePath, "utf8");

    expect(rule).toContain("- keep this");
    expect(rule).not.toContain("stale tokenjuice block");
    expect(countTokenjuiceBlocks(rule)).toBe(1);
  });

  it("reports installed and uninstalled rule health", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".greptile", "rules.md");

    await installGreptileRule(rulePath, { projectDir: home });
    const installed = await doctorGreptileRule(rulePath, { projectDir: home });

    expect(installed.status).toBe("ok");
    expect(installed.hasTokenjuiceMarker).toBe(true);
    expect(installed.advisories[0]).toContain("rules-based");

    const removed = await uninstallGreptileRule(rulePath, { projectDir: home });
    const disabled = await doctorGreptileRule(rulePath, { projectDir: home });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(disabled.hasTokenjuiceMarker).toBe(false);
  });

  it("reports broken rules with unmatched tokenjuice markers", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".greptile", "rules.md");
    await mkdir(join(home, ".greptile"), { recursive: true });
    await writeFile(rulePath, "<!-- tokenjuice:greptile begin -->\nmissing end marker\n", "utf8");

    const doctor = await doctorGreptileRule(rulePath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(doctor.issues[0]).toContain("without an end marker");
  });

  it("leaves unrelated rules untouched when uninstall finds no tokenjuice block", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".greptile", "rules.md");
    await mkdir(join(home, ".greptile"), { recursive: true });
    await writeFile(rulePath, "# Review standards\n\n- keep this\n", "utf8");

    const removed = await uninstallGreptileRule(rulePath, { projectDir: home });
    const rule = await readFile(rulePath, "utf8");

    expect(removed.removed).toBe(false);
    expect(rule).toBe("# Review standards\n\n- keep this\n");
  });

  it("uses GREPTILE_PROJECT_DIR for the default rule file", async () => {
    const home = await createTempDir();
    process.env.GREPTILE_PROJECT_DIR = home;

    const installed = await installGreptileRule();
    const expectedRulePath = join(home, ".greptile", "rules.md");
    const doctor = await doctorGreptileRule();

    expect(installed.rulePath).toBe(expectedRulePath);
    expect(doctor.rulePath).toBe(expectedRulePath);
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
  });

  it("rejects symlinked rule files before reading or backing them up", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    process.env.GREPTILE_PROJECT_DIR = home;
    await mkdir(join(home, ".greptile"), { recursive: true });
    await writeFile(join(outside, "private.md"), "# private context\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".greptile", "rules.md"));

    await expect(installGreptileRule()).rejects.toThrow(/will not read or write through instruction symlinks/u);
    await expect(access(join(home, ".greptile", "rules.md.bak"))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorGreptileRule();

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(doctor.issues[0]).toContain("will not read or write through instruction symlinks");
    await expect(doctorGreptileRule(join(home, ".greptile", "rules.md"), { projectDir: home })).resolves.toMatchObject({
      status: "broken",
      hasTokenjuiceMarker: false,
      hasUnsafePathIssue: true,
      issues: [expect.stringContaining("will not read or write through instruction symlinks")],
    });
  });

  it("rejects sidecar symlinks before installing rules", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const rulePath = join(home, ".greptile", "rules.md");
    await mkdir(join(home, ".greptile"), { recursive: true });
    await writeFile(rulePath, "# project context\n", "utf8");
    await writeFile(join(outside, "private-bak.md"), "# private backup\n", "utf8");
    await writeFile(join(outside, "private-tmp.md"), "# private temp\n", "utf8");

    await symlink(join(outside, "private-bak.md"), `${rulePath}.bak`);
    await expect(installGreptileRule(undefined, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await rm(`${rulePath}.bak`);

    await symlink(join(outside, "private-tmp.md"), `${rulePath}.tmp`);
    await expect(installGreptileRule(undefined, { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );

    await expect(readFile(join(outside, "private-bak.md"), "utf8")).resolves.toBe("# private backup\n");
    await expect(readFile(join(outside, "private-tmp.md"), "utf8")).resolves.toBe("# private temp\n");
  });

  it("constrains explicit rule paths to the project boundary", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const outsideRulePath = join(outside, ".greptile", "rules.md");

    process.chdir(home);
    await expect(installGreptileRule(outsideRulePath)).rejects.toThrow(/outside/u);
    await expect(installGreptileRule(outsideRulePath, { projectDir: home })).rejects.toThrow(/outside/u);
    await expect(uninstallGreptileRule(outsideRulePath, { projectDir: home })).rejects.toThrow(/outside/u);

    const doctor = await doctorGreptileRule(outsideRulePath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(doctor.issues[0]).toContain("outside");
    expect(doctor.fixCommand).toContain("project-local .greptile/rules.md path");
    await expect(access(outsideRulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects arbitrary in-project explicit rule paths", async () => {
    const home = await createTempDir();
    const readmePath = join(home, "README.md");
    await writeFile(readmePath, "# keep me\n", "utf8");

    await expect(installGreptileRule(readmePath, { projectDir: home })).rejects.toThrow(
      /only installs the project-local \.greptile\/rules\.md rule/u,
    );

    const doctor = await doctorGreptileRule(readmePath, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(doctor.fixCommand).toContain("project-local .greptile/rules.md path");
    await expect(readFile(readmePath, "utf8")).resolves.toBe("# keep me\n");
  });

  it("rejects explicit rule paths under symlinked parents inside or outside projectDir", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const linkedOutsideDir = join(home, "linked-outside");
    const linkedInsideTarget = join(home, "redirected");
    const linkedInsideDir = join(home, "linked-inside");
    await mkdir(linkedInsideTarget, { recursive: true });
    await symlink(outside, linkedOutsideDir);
    await symlink(linkedInsideTarget, linkedInsideDir);

    await expect(installGreptileRule(join(linkedOutsideDir, "rules.md"), { projectDir: home })).rejects.toThrow(
      /outside/u,
    );
    await expect(installGreptileRule(join(linkedInsideDir, "rules.md"), { projectDir: home })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(outside, "rules.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(linkedInsideTarget, "rules.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked project roots before writing default rules", async () => {
    const home = await createTempDir();
    const links = await createTempDir();
    const linkedProjectDir = join(links, "project");
    await symlink(home, linkedProjectDir);

    await expect(installGreptileRule(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(home, ".greptile", "rules.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not count absent default rules as installed when the project root is unsafe", async () => {
    const home = await createTempDir();
    const links = await createTempDir();
    const linkedProjectDir = join(links, "project");
    await symlink(home, linkedProjectDir);

    const doctor = await doctorGreptileRule(undefined, { projectDir: linkedProjectDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("rejects symlinked project parent directories before writing default rules", async () => {
    const realParent = await createTempDir();
    const links = await createTempDir();
    const realProjectDir = join(realParent, "project");
    const linkedParent = join(links, "linked-parent");
    const linkedProjectDir = join(linkedParent, "project");
    await mkdir(realProjectDir, { recursive: true });
    await symlink(realParent, linkedParent);

    await expect(installGreptileRule(undefined, { projectDir: linkedProjectDir })).rejects.toThrow(
      /will not read or write through instruction symlinks/u,
    );
    await expect(access(join(realProjectDir, ".greptile", "rules.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not count markerless user-owned rules as installed", async () => {
    const home = await createTempDir();
    const rulePath = join(home, ".greptile", "rules.md");
    await mkdir(join(home, ".greptile"), { recursive: true });
    await writeFile(rulePath, "# custom Greptile rules\n", "utf8");

    const doctor = await doctorGreptileRule(undefined, { projectDir: home });

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    await expect(readFile(rulePath, "utf8")).resolves.toBe("# custom Greptile rules\n");
  });

  it("does not follow unsafe rule symlinks to collect marker evidence", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    await mkdir(join(home, ".greptile"), { recursive: true });
    await writeFile(join(outside, "private.md"), "<!-- tokenjuice:greptile begin -->\n", "utf8");
    await symlink(join(outside, "private.md"), join(home, ".greptile", "rules.md"));

    const doctor = await doctorGreptileRule(undefined, { projectDir: home });

    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(doctor.hasUnsafePathIssue).toBe(true);
    expect(isInstalledHookIntegration(doctor)).toBe(true);
  });

  it("surfaces unsafe default rules in aggregate doctor without reading them", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }
    await mkdir(join(home, ".greptile"), { recursive: true });
    await writeFile(join(outside, "shared-rule.md"), "<!-- tokenjuice:greptile begin -->\n", "utf8");
    await symlink(join(outside, "shared-rule.md"), join(home, ".greptile", "rules.md"));

    const report = await doctorInstalledHooks();

    expect(report.integrations.greptile.status).toBe("broken");
    expect(report.integrations.greptile.hasTokenjuiceMarker).toBe(false);
    expect(report.integrations.greptile.hasUnsafePathIssue).toBe(true);
    expect(report.status).toBe("broken");
  });

  it("does not surface missing default rules from unsafe projects in aggregate doctor", async () => {
    const home = await createTempDir();
    const links = await createTempDir();
    const linkedProjectDir = join(links, "project");
    await symlink(home, linkedProjectDir);
    for (const key of envKeys) {
      process.env[key] = home;
    }
    process.env.GREPTILE_PROJECT_DIR = linkedProjectDir;

    const report = await doctorInstalledHooks();

    expect(report.integrations.greptile.status).toBe("disabled");
    expect(report.integrations.greptile.hasTokenjuiceMarker).toBe(false);
    expect(report.integrations.greptile.hasUnsafePathIssue).toBe(false);
    expect(report.status).toBe("disabled");
  });

  it("defaults to the git root rule from nested directories", async () => {
    const home = await createTempDir();
    await mkdir(join(home, ".git"));
    const nestedDir = join(home, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const installed = await installGreptileRule();
    const root = await realpath(home);

    expect(installed.rulePath).toBe(join(root, ".greptile", "rules.md"));
  });

  it("reports greptile in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installGreptileRule(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.greptile.rulePath).toBe(join(home, ".greptile", "rules.md"));
    expect(report.integrations.greptile.status).toBe("ok");
    expect(report.integrations.greptile.hasTokenjuiceMarker).toBe(true);
    expect(report.integrations.greptile.hasUnsafePathIssue).toBe(false);
  });

  it("removes the default rule file when only tokenjuice content remains", async () => {
    const home = await createTempDir();
    process.env.GREPTILE_PROJECT_DIR = home;
    const rulePath = join(home, ".greptile", "rules.md");

    await installGreptileRule();
    await uninstallGreptileRule(rulePath, { projectDir: home });

    await expect(access(rulePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
