import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorMuxHook, installMuxHook, runMuxPostToolUseHook, uninstallMuxHook } from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "BOB_PROJECT_DIR",
  "BUILDER_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEBUFF_PROJECT_DIR",
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
  "JETBRAINS_AI_PROJECT_DIR",
  "JULES_PROJECT_DIR",
  "JUNIE_PROJECT_DIR",
  "KILO_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KIRO_PROJECT_DIR",
  "MISTRAL_VIBE_PROJECT_DIR",
  "MUX_PROJECT_DIR",
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
  "TABNINE_PROJECT_DIR",
  "TRAE_PROJECT_DIR",
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-mux-test-"));
  tempDirs.push(dir);
  return dir;
}

async function captureStdout(fn: () => Promise<number>): Promise<{ code: number; output: string }> {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let output = "";
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = await fn();
    return { code, output };
  } finally {
    process.stdout.write = originalWrite;
  }
}

function legacyBlock(command = "tokenjuice mux-post-tool-use"): string {
  return `# tokenjuice:mux begin\n(\n  set -euo pipefail\n  ${command}\n) || true\n# tokenjuice:mux end\n`;
}

async function writeHook(home: string, body: string): Promise<string> {
  const path = join(home, ".mux", "tool_post");
  await mkdir(join(home, ".mux"), { recursive: true });
  await writeFile(path, body, { mode: 0o750 });
  return path;
}

describe("retired Mux additive hooks", () => {
  it("rejects installation before creating or changing hook files", async () => {
    const home = await createTempDir();
    const path = join(home, ".mux", "tool_post");
    await expect(installMuxHook(path)).rejects.toThrow("additive hooks do not replace tool output");
    await expect(stat(join(home, ".mux"))).rejects.toMatchObject({ code: "ENOENT" });
    await writeHook(home, "#!/usr/bin/env bash\necho keep\n");
    await expect(installMuxHook(path)).rejects.toThrow("Use tokenjuice wrap");
    expect(await readFile(path, "utf8")).toBe("#!/usr/bin/env bash\necho keep\n");
    await expect(stat(`${path}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports a retired hook and removes only its generated block", async () => {
    const home = await createTempDir();
    const prefix = "#!/usr/bin/env bash\n";
    const suffix = "\n# custom hook\nprintf 'keep\\n'\n";
    const path = await writeHook(home, prefix + legacyBlock() + suffix);
    await writeFile(`${path}.bak`, "existing backup");
    const doctor = await doctorMuxHook(path);
    expect(doctor.status).toBe("broken");
    expect(doctor.fixCommand).toBe("tokenjuice uninstall mux");
    expect(doctor.detectedCommand).toBe("tokenjuice mux-post-tool-use");
    expect(await uninstallMuxHook(path)).toEqual({ hookPath: path, removed: true });
    expect(await readFile(path, "utf8")).toBe(prefix + suffix);
    expect((await stat(path)).mode & 0o777).toBe(0o750);
    expect(await readFile(`${path}.bak`, "utf8")).toBe("existing backup");
    expect((await uninstallMuxHook(path)).removed).toBe(false);
    expect((await doctorMuxHook(path)).status).toBe("disabled");
  });

  it("removes a standalone generated hook and resolves the legacy project target", async () => {
    const home = await createTempDir();
    process.env.MUX_PROJECT_DIR = home;
    const path = await writeHook(home, "#!/usr/bin/env bash\n" + legacyBlock());
    expect((await doctorMuxHook()).hookPath).toBe(path);
    expect((await uninstallMuxHook()).removed).toBe(true);
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await uninstallMuxHook(undefined, { projectDir: home })).removed).toBe(false);
  });

  it("preserves custom command mentions and malformed marker blocks", async () => {
    const home = await createTempDir();
    for (const body of [
      "#!/usr/bin/env bash\n# mux-post-tool-use\necho keep\n",
      "#!/usr/bin/env bash\n" + legacyBlock("echo mux-post-tool-use"),
      "#!/usr/bin/env bash\n" + legacyBlock("tokenjuice mux-post-tool-use; echo keep"),
      "#!/usr/bin/env bash\n" + legacyBlock().replace("# tokenjuice:mux end", "# missing end"),
    ]) {
      const path = await writeHook(home, body);
      expect((await uninstallMuxHook(path)).removed).toBe(false);
      expect(await readFile(path, "utf8")).toBe(body);
      expect((await doctorMuxHook(path)).status).toBe("disabled");
    }
  });

  it("refuses cleanup through symlinked hooks or directories", async () => {
    const home = await createTempDir();
    const target = join(home, "target");
    await writeFile(target, "#!/usr/bin/env bash\n" + legacyBlock());
    await mkdir(join(home, ".mux"));
    const path = join(home, ".mux", "tool_post");
    await symlink(target, path);
    await expect(uninstallMuxHook(path)).rejects.toThrow("symlinked file");
    expect((await doctorMuxHook(path)).status).toBe("broken");
    const other = await createTempDir();
    await symlink(join(home, ".mux"), join(other, ".mux"));
    await expect(uninstallMuxHook(join(other, ".mux", "tool_post"))).rejects.toThrow("symlinked directory");
    expect(await readFile(target, "utf8")).toContain("tokenjuice:mux begin");
  });

  it("keeps stale runtime hooks silent without reading their payloads", async () => {
    expect(await captureStdout(() => runMuxPostToolUseHook({
      MUX_TOOL: "bash", MUX_TOOL_INPUT_PATH: "/missing/input", MUX_TOOL_RESULT_PATH: "/missing/result",
    }))).toEqual({ code: 0, output: "" });
    expect(await captureStdout(() => runMuxPostToolUseHook({ XUM_TOOL: "bash" }))).toEqual({ code: 0, output: "" });
  });
});
