import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorInstalledHooks, doctorMuxHook, installMuxHook, runMuxPostToolUseHook, uninstallMuxHook } from "../../src/index.js";

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

describe("Mux tool hooks", () => {
  it("installs an executable project tool_post hook", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");

    const result = await installMuxHook(hookPath);
    const script = await readFile(hookPath, "utf8");
    const mode = (await stat(hookPath)).mode;

    expect(result.hookPath).toBe(hookPath);
    expect(result.backupPath).toBeUndefined();
    expect(script).toContain("#!/usr/bin/env bash");
    expect(script).toContain("mux-post-tool-use");
    expect(mode & 0o111).not.toBe(0);
  });

  it("backs up and preserves an existing hook file", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");
    await installMuxHook(hookPath);
    await writeFile(hookPath, "#!/usr/bin/env bash\necho keep\n", "utf8");

    const result = await installMuxHook(hookPath);
    const script = await readFile(hookPath, "utf8");

    expect(result.backupPath).toBe(`${hookPath}.bak`);
    await expect(readFile(`${hookPath}.bak`, "utf8")).resolves.toContain("keep");
    expect(script).toContain("mux-post-tool-use");
    expect(script).toContain("echo keep");
  });

  it("reinstalls tokenjuice-managed hook files idempotently", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");

    await installMuxHook(hookPath);
    const result = await installMuxHook(hookPath);

    expect(result.backupPath).toBeUndefined();
    await expect(stat(`${hookPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("repairs executable bits when reinstalling managed hook files", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");

    await installMuxHook(hookPath);
    await chmod(hookPath, 0o644);

    const result = await installMuxHook(hookPath);
    const mode = (await stat(hookPath)).mode;

    expect(result.backupPath).toBeUndefined();
    expect(mode & 0o777).toBe(0o755);
  });

  it("does not overwrite an existing user backup when preserving a hook file", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");
    await mkdir(join(home, ".mux"), { recursive: true });
    await writeFile(hookPath, "#!/usr/bin/env bash\necho keep\n", "utf8");
    await writeFile(`${hookPath}.bak`, "# user backup\n", "utf8");

    const result = await installMuxHook(hookPath);
    const script = await readFile(hookPath, "utf8");

    expect(result.backupPath).toBe(`${hookPath}.tokenjuice.bak`);
    await expect(readFile(`${hookPath}.bak`, "utf8")).resolves.toContain("user backup");
    await expect(readFile(`${hookPath}.tokenjuice.bak`, "utf8")).resolves.toContain("echo keep");
    expect(script).toContain("mux-post-tool-use");
    expect(script).toContain("echo keep");
  });

  it("preserves existing hook privacy when adding executable bits and backups", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");
    await mkdir(join(home, ".mux"), { recursive: true });
    await writeFile(hookPath, "#!/usr/bin/env bash\necho secret\n", { encoding: "utf8", mode: 0o600 });
    await chmod(hookPath, 0o600);

    const result = await installMuxHook(hookPath);
    const hookMode = (await stat(hookPath)).mode & 0o777;
    const backupMode = (await stat(result.backupPath ?? "")).mode & 0o777;

    expect(result.backupPath).toBe(`${hookPath}.bak`);
    expect(hookMode).toBe(0o700);
    expect(backupMode).toBe(0o600);

    await uninstallMuxHook(hookPath);
    const uninstalledMode = (await stat(hookPath)).mode & 0o777;
    const script = await readFile(hookPath, "utf8");

    expect(uninstalledMode).toBe(0o700);
    expect(script).toContain("echo secret");
    expect(script).not.toContain("mux-post-tool-use");
  });

  it("does not write backups through dangling backup symlinks", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");
    await mkdir(join(home, ".mux"), { recursive: true });
    await writeFile(hookPath, "#!/usr/bin/env bash\necho keep\n", "utf8");
    await symlink(join(home, "missing-backup-target"), `${hookPath}.bak`);

    const result = await installMuxHook(hookPath);

    expect(result.backupPath).toBe(`${hookPath}.tokenjuice.bak`);
    await expect(readFile(`${hookPath}.tokenjuice.bak`, "utf8")).resolves.toContain("echo keep");
  });

  it("refuses to install over existing non-bash hook files", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");
    await installMuxHook(hookPath);
    await writeFile(hookPath, "#!/usr/bin/env python3\nprint('keep')\n", "utf8");

    await expect(installMuxHook(hookPath)).rejects.toThrow("cannot safely install Mux hook over non-bash");
    await expect(readFile(hookPath, "utf8")).resolves.toContain("print('keep')");
    await expect(stat(`${hookPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to install over existing hooks without a bash shebang", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");
    await installMuxHook(hookPath);
    await writeFile(hookPath, "echo keep\n", "utf8");

    await expect(installMuxHook(hookPath)).rejects.toThrow("cannot safely install Mux hook over non-bash");
    await expect(readFile(hookPath, "utf8")).resolves.toBe("echo keep\n");
  });

  it("refuses to install, uninstall, or doctor through a symlinked hook file", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");
    const targetPath = join(home, "outside-hook");
    await mkdir(join(home, ".mux"), { recursive: true });
    await writeFile(targetPath, "#!/usr/bin/env bash\necho outside\n", "utf8");
    await symlink(targetPath, hookPath);

    await expect(installMuxHook(hookPath)).rejects.toThrow("symlinked file");
    await expect(uninstallMuxHook(hookPath)).rejects.toThrow("symlinked file");
    const doctor = await doctorMuxHook(hookPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("symlinked file");
    await expect(readFile(targetPath, "utf8")).resolves.toBe("#!/usr/bin/env bash\necho outside\n");
  });

  it("refuses to install through a symlinked hook directory", async () => {
    const home = await createTempDir();
    const externalDir = join(home, "external-mux");
    await mkdir(externalDir);
    await symlink(externalDir, join(home, ".mux"));

    await expect(installMuxHook(join(home, ".mux", "tool_post"))).rejects.toThrow("symlinked directory");
    const doctor = await doctorMuxHook(join(home, ".mux", "tool_post"));

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("symlinked directory");
  });

  it("does not write backups through existing backup symlinks", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");
    const targetPath = join(home, "outside-backup");
    await mkdir(join(home, ".mux"), { recursive: true });
    await writeFile(hookPath, "#!/usr/bin/env bash\necho keep\n", "utf8");
    await writeFile(targetPath, "outside\n", "utf8");
    await symlink(targetPath, `${hookPath}.bak`);

    const result = await installMuxHook(hookPath);

    expect(result.backupPath).toBe(`${hookPath}.tokenjuice.bak`);
    await expect(readFile(targetPath, "utf8")).resolves.toBe("outside\n");
    await expect(readFile(`${hookPath}.tokenjuice.bak`, "utf8")).resolves.toContain("echo keep");
  });

  it("reports installed and uninstalled hook health", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");

    await installMuxHook(hookPath);
    const installed = await doctorMuxHook(hookPath);

    expect(installed.status).toBe("ok");
    expect(installed.detectedCommand).toContain("mux-post-tool-use");

    const removed = await uninstallMuxHook(hookPath);
    const disabled = await doctorMuxHook(hookPath);

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("reports a non-executable installed hook as broken", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");

    await installMuxHook(hookPath);
    await chmod(hookPath, 0o644);
    const doctor = await doctorMuxHook(hookPath);

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain("configured Mux tool_post hook is not executable; run tokenjuice install mux to repair it");
  });

  it("reports local repair commands for local doctor checks", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");

    const disabled = await doctorMuxHook(hookPath, { local: true });
    expect(disabled.status).toBe("disabled");
    expect(disabled.fixCommand).toBe("tokenjuice install mux --local");

    await installMuxHook(hookPath, { local: true });
    await chmod(hookPath, 0o644);
    const broken = await doctorMuxHook(hookPath, { local: true });

    expect(broken.status).toBe("broken");
    expect(broken.fixCommand).toBe("tokenjuice install mux --local");
    expect(broken.issues).toContain("configured Mux tool_post hook is not executable; run tokenjuice install mux --local to repair it");
  });

  it("does not remove a non-tokenjuice hook on uninstall", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");
    await installMuxHook(hookPath);
    await writeFile(hookPath, "#!/usr/bin/env bash\necho keep\n", "utf8");

    const removed = await uninstallMuxHook(hookPath);

    expect(removed.removed).toBe(false);
    await expect(readFile(hookPath, "utf8")).resolves.toContain("keep");
  });

  it("does not delete unmarked hook content that mentions tokenjuice", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");
    await installMuxHook(hookPath);
    await writeFile(hookPath, "#!/usr/bin/env bash\n# mux-post-tool-use\necho keep\n", "utf8");

    const removed = await uninstallMuxHook(hookPath);

    expect(removed.removed).toBe(false);
    await expect(readFile(hookPath, "utf8")).resolves.toContain("echo keep");
  });

  it("removes only the tokenjuice block on uninstall", async () => {
    const home = await createTempDir();
    const hookPath = join(home, ".mux", "tool_post");
    await installMuxHook(hookPath);
    await writeFile(hookPath, "#!/usr/bin/env bash\necho keep\n", "utf8");
    await installMuxHook(hookPath);

    const removed = await uninstallMuxHook(hookPath);
    const script = await readFile(hookPath, "utf8");

    expect(removed.removed).toBe(true);
    expect(script).toContain("echo keep");
    expect(script).not.toContain("mux-post-tool-use");
  });

  it("uses MUX_PROJECT_DIR for the default hook file", async () => {
    const home = await createTempDir();
    process.env.MUX_PROJECT_DIR = home;

    const installed = await installMuxHook();
    const expectedHookPath = join(home, ".mux", "tool_post");
    const doctor = await doctorMuxHook();

    expect(installed.hookPath).toBe(expectedHookPath);
    expect(doctor.hookPath).toBe(expectedHookPath);
    expect(doctor.status).toBe("ok");
  });

  it("reports mux in aggregate hook doctor", async () => {
    const home = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = home;
    }

    await installMuxHook(undefined, { projectDir: home });
    const report = await doctorInstalledHooks({ projectDir: home });

    expect(report.integrations.mux.hookPath).toBe(join(home, ".mux", "tool_post"));
    expect(report.integrations.mux.status).toBe("ok");
  });

  it("prints compacted context for Mux bash output", async () => {
    const home = await createTempDir();
    const inputPath = join(home, "input.json");
    const resultPath = join(home, "result.json");
    const longOutput = Array.from({ length: 80 }, (_, index) => ` M src/file-${index}.ts`).join("\n");
    await writeFile(inputPath, JSON.stringify({ script: "git status --short" }), "utf8");
    await writeFile(resultPath, JSON.stringify({ stdout: longOutput, exitCode: 0 }), "utf8");

    const { code, output } = await captureStdout(() =>
      runMuxPostToolUseHook({
        MUX_TOOL: "bash",
        MUX_TOOL_INPUT_PATH: inputPath,
        MUX_TOOL_RESULT_PATH: resultPath,
        PWD: home,
      }),
    );

    expect(code).toBe(0);
    expect(output).toContain("M: src/file-0.ts");
    expect(output).toContain("need raw? `tokenjuice wrap --raw -- <command>`");
  });

  it("stays silent for non-bash, missing, or uninteresting hook payloads", async () => {
    const home = await createTempDir();
    const inputPath = join(home, "input.json");
    const resultPath = join(home, "result.json");
    await writeFile(inputPath, JSON.stringify({ script: "echo hi" }), "utf8");
    await writeFile(resultPath, JSON.stringify({ stdout: "hi" }), "utf8");

    await expect(
      captureStdout(() => runMuxPostToolUseHook({ MUX_TOOL: "file_read", MUX_TOOL_INPUT_PATH: inputPath, MUX_TOOL_RESULT_PATH: resultPath })),
    ).resolves.toEqual({ code: 0, output: "" });
    await expect(captureStdout(() => runMuxPostToolUseHook({ MUX_TOOL: "bash" }))).resolves.toEqual({ code: 0, output: "" });
    await expect(
      captureStdout(() => runMuxPostToolUseHook({ MUX_TOOL: "bash", MUX_TOOL_INPUT_PATH: inputPath, MUX_TOOL_RESULT_PATH: resultPath })),
    ).resolves.toEqual({ code: 0, output: "" });
  });

  it("skips oversized Mux hook payload files", async () => {
    const home = await createTempDir();
    const inputPath = join(home, "input.json");
    const resultPath = join(home, "result.json");
    await writeFile(inputPath, JSON.stringify({ script: "cat huge.log" }), "utf8");
    await writeFile(resultPath, JSON.stringify({ stdout: "x".repeat(8 * 1024 * 1024 + 1) }), "utf8");

    await expect(
      captureStdout(() =>
        runMuxPostToolUseHook({
          MUX_TOOL: "bash",
          MUX_TOOL_INPUT_PATH: inputPath,
          MUX_TOOL_RESULT_PATH: resultPath,
        })
      ),
    ).resolves.toEqual({ code: 0, output: "" });
  });
});
