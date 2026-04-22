import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorCursorHook, installCursorHook, runCursorPreToolUseHook } from "../../src/index.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;
const originalShell = process.env.SHELL;
const originalCursorShell = process.env.TOKENJUICE_CURSOR_SHELL;
const originalPlatform = process.platform;

afterEach(async () => {
  process.env.PATH = originalPath;
  if (originalShell === undefined) {
    delete process.env.SHELL;
  } else {
    process.env.SHELL = originalShell;
  }
  if (originalCursorShell === undefined) {
    delete process.env.TOKENJUICE_CURSOR_SHELL;
  } else {
    process.env.TOKENJUICE_CURSOR_SHELL = originalCursorShell;
  }
  delete process.env.CURSOR_HOME;
  Object.defineProperty(process, "platform", { value: originalPlatform });
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-cursor-test-"));
  tempDirs.push(dir);
  return dir;
}

async function captureStdout(run: () => Promise<number>): Promise<{ code: number; output: string }> {
  let output = "";
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;

  try {
    const code = await run();
    return { code, output };
  } finally {
    process.stdout.write = originalWrite;
  }
}

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value });
}

describe("installCursorHook", () => {
  it("installs a single tokenjuice preToolUse shell hook", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");

    const result = await installCursorHook(hooksPath);
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: Record<string, Array<{ command: string; matcher?: string; type?: string }>>;
    };

    expect(result.hooksPath).toBe(hooksPath);
    expect(result.backupPath).toBeUndefined();
    expect(parsed.hooks.preToolUse).toHaveLength(1);
    expect(parsed.hooks.preToolUse[0]?.matcher).toBe("Shell");
    expect(parsed.hooks.preToolUse[0]?.type).toBe("command");
    expect(parsed.hooks.preToolUse[0]?.command).toContain("cursor-pre-tool-use");
    expect(parsed.hooks.preToolUse[0]?.command).toContain("--wrap-launcher");
  });

  it("prefers a stable tokenjuice launcher from PATH", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const result = await installCursorHook(hooksPath);
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: Record<string, Array<{ command: string }>>;
    };

    expect(result.command).toContain(`${launcherPath} cursor-pre-tool-use`);
    expect(parsed.hooks.preToolUse[0]?.command).toContain(`${launcherPath} cursor-pre-tool-use`);
  });

  it("can force local repo routing instead of the PATH launcher", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const localCliPath = join(home, "dist", "cli", "main.js");
    const localNodePath = join(home, "node");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await mkdir(join(home, "dist", "cli"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(localCliPath, "console.log('tokenjuice');\n", "utf8");
    await writeFile(localNodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const result = await installCursorHook(hooksPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: Record<string, Array<{ command: string }>>;
    };

    const resolvedBinaryPath = resolve(localCliPath);
    const expectedCommand = `${localNodePath} ${resolvedBinaryPath} cursor-pre-tool-use --wrap-launcher ${resolvedBinaryPath}`;
    expect(result.command).toBe(expectedCommand);
    expect(parsed.hooks.preToolUse[0]?.command).toBe(expectedCommand);
  });

  it("persists absolute launcher path when installing from relative binaryPath", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    process.env.PATH = "";

    const result = await installCursorHook(hooksPath, { binaryPath: "dist/cli/main.js", nodePath: "/usr/bin/node" });

    expect(result.command).toContain(`${resolve("dist/cli/main.js")} cursor-pre-tool-use`);
    expect(result.command).toContain("--wrap-launcher");
  });

  it("rejects native Windows installs instead of writing a broken hook", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    setPlatform("win32");

    await expect(installCursorHook(hooksPath)).rejects.toThrow(
      "tokenjuice cursor integration does not support native Windows shells yet. run Cursor in WSL instead.",
    );
  });
});

describe("doctorCursorHook", () => {
  it("reports a healthy installed launcher hook", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installCursorHook(hooksPath);

    const report = await doctorCursorHook(hooksPath);

    expect(report.status).toBe("ok");
    expect(report.detectedCommand).toContain(`${launcherPath} cursor-pre-tool-use`);
    expect(report.issues).toEqual([]);
  });

  it("reports a healthy local hook when asked to check local mode", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const localCliPath = join(home, "dist", "cli", "main.js");
    const localNodePath = join(home, "node");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await mkdir(join(home, "dist", "cli"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(localCliPath, "console.log('tokenjuice');\n", "utf8");
    await writeFile(localNodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installCursorHook(hooksPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });

    const report = await doctorCursorHook(hooksPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });

    const resolvedBinaryPath = resolve(localCliPath);
    expect(report.status).toBe("ok");
    expect(report.expectedCommand).toBe(`${localNodePath} ${resolvedBinaryPath} cursor-pre-tool-use --wrap-launcher ${resolvedBinaryPath}`);
    expect(report.detectedCommand).toBe(report.expectedCommand);
    expect(report.fixCommand).toBe("tokenjuice install cursor --local");
  });

  it("flags a configured native Windows hook as broken", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks.json");
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [
            {
              type: "command",
              matcher: "Shell",
              command: String.raw`C:\Users\andre\bin\tokenjuice.exe cursor-pre-tool-use --wrap-launcher C:\Users\andre\bin\tokenjuice.exe`,
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );
    setPlatform("win32");

    const report = await doctorCursorHook(hooksPath);

    expect(report.status).toBe("broken");
    expect(report.issues).toContain("configured Cursor hook cannot run on native Windows; use Cursor in WSL instead.");
    expect(report.detectedCommand).toContain("cursor-pre-tool-use");
    expect(report.fixCommand).toBe("run Cursor in WSL, then run tokenjuice install cursor");
  });
});

describe("runCursorPreToolUseHook", () => {
  it("wraps shell commands with tokenjuice wrap using the provided host shell", async () => {
    const home = await createTempDir();
    const hostShellPath = join(home, "host-shell");
    await writeFile(hostShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: {
        command: "git status --short",
        shell: hostShellPath,
        working_directory: "/repo",
      },
    });

    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as {
      updated_input: { command: string; working_directory?: string };
    };

    expect(code).toBe(0);
    expect(response.updated_input.command).toBe(`/usr/local/bin/tokenjuice wrap -- ${hostShellPath} -lc 'git status --short'`);
    expect(response.updated_input.working_directory).toBe("/repo");
  });

  it("skips commands that are already wrapped", async () => {
    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: {
        command: "tokenjuice wrap -- git status",
      },
    });

    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it.each([
    ["/usr/local/bin/tokenjuice wrap -- bash -lc 'git status'", "absolute POSIX path"],
    ["/root/.local/share/pnpm/tokenjuice wrap --raw -- git log", "pnpm-linked absolute path"],
  ])(
    "skips already-wrapped commands invoked via %s (%s)",
    async (command) => {
      // Mirror of the codebuddy P3 regression: cursor's commandAlreadyWrapped
      // must also recognise absolute tokenjuice paths so the shell input
      // rewrite does not nest `tokenjuice wrap` invocations.
      const payload = JSON.stringify({
        tool_name: "Shell",
        tool_input: { command },
      });

      const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));

      expect(code).toBe(0);
      expect(output).toBe("");
    },
  );

  it("uses node to execute a js wrap launcher path", async () => {
    const home = await createTempDir();
    const hostShellPath = join(home, "host-shell");
    await writeFile(hostShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: {
        command: "git status --short",
        shell: hostShellPath,
      },
    });

    const { code, output } = await captureStdout(() =>
      runCursorPreToolUseHook(payload, "/repo/dist/cli/main.js")
    );
    const response = JSON.parse(output) as {
      updated_input: { command: string };
    };

    expect(code).toBe(0);
    expect(response.updated_input.command).toContain(`/repo/dist/cli/main.js wrap -- ${hostShellPath} -lc 'git status --short'`);
    expect(response.updated_input.command).toContain(process.execPath);
  });

  it("skips node-based local wrap commands to preserve raw bypass", async () => {
    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: {
        command: "node dist/cli/main.js wrap --raw -- git status",
      },
    });

    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it("skips cd-prefixed commands that are already wrapped", async () => {
    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: {
        command: "cd /repo && tokenjuice wrap --raw -- git status",
      },
    });

    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it("falls back to SHELL when tool_input.shell is absent", async () => {
    const home = await createTempDir();
    const shellDir = join(home, "bin");
    const hostShellPath = join(shellDir, "zsh");
    process.env.PATH = shellDir;
    process.env.SHELL = "zsh";
    await mkdir(shellDir, { recursive: true });
    await writeFile(hostShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: {
        command: "git status --short",
      },
    });
    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as {
      updated_input: { command: string };
    };

    expect(code).toBe(0);
    expect(response.updated_input.command).toBe(`/usr/local/bin/tokenjuice wrap -- ${hostShellPath} -lc 'git status --short'`);
  });

  it("prefers TOKENJUICE_CURSOR_SHELL over SHELL when both resolve", async () => {
    // Pins precedence of the candidate chain:
    //   tool_input.shell > TOKENJUICE_CURSOR_SHELL > SHELL > sh
    // This would silently regress if a refactor reshuffled the list.
    const home = await createTempDir();
    const shellDir = join(home, "bin");
    const tjShellPath = join(shellDir, "fish");
    const defaultShellPath = join(shellDir, "zsh");
    process.env.PATH = shellDir;
    process.env.SHELL = "zsh";
    process.env.TOKENJUICE_CURSOR_SHELL = "fish";
    await mkdir(shellDir, { recursive: true });
    await writeFile(tjShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(defaultShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: { command: "git status --short" },
    });
    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as { updated_input: { command: string } };

    expect(code).toBe(0);
    expect(response.updated_input.command).toBe(`/usr/local/bin/tokenjuice wrap -- ${tjShellPath} -lc 'git status --short'`);
  });

  it("prefers tool_input.shell over TOKENJUICE_CURSOR_SHELL and SHELL", async () => {
    const home = await createTempDir();
    const shellDir = join(home, "bin");
    const payloadShellPath = join(home, "payload-shell");
    const tjShellPath = join(shellDir, "fish");
    const defaultShellPath = join(shellDir, "zsh");
    process.env.PATH = shellDir;
    process.env.SHELL = "zsh";
    process.env.TOKENJUICE_CURSOR_SHELL = "fish";
    await mkdir(shellDir, { recursive: true });
    await writeFile(payloadShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(tjShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(defaultShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: { command: "git status --short", shell: payloadShellPath },
    });
    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as { updated_input: { command: string } };

    expect(code).toBe(0);
    expect(response.updated_input.command).toBe(`/usr/local/bin/tokenjuice wrap -- ${payloadShellPath} -lc 'git status --short'`);
  });

  it("falls back to sh when SHELL and TOKENJUICE_CURSOR_SHELL are unresolvable", async () => {
    const home = await createTempDir();
    const shellDir = join(home, "bin");
    const shPath = join(shellDir, "sh");
    process.env.PATH = shellDir;
    process.env.SHELL = "/definitely/missing";
    process.env.TOKENJUICE_CURSOR_SHELL = "/also/missing";
    await mkdir(shellDir, { recursive: true });
    await writeFile(shPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: { command: "git status --short" },
    });
    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as { updated_input: { command: string } };

    expect(code).toBe(0);
    expect(response.updated_input.command).toBe(`/usr/local/bin/tokenjuice wrap -- ${shPath} -lc 'git status --short'`);
  });

  it("leaves command unchanged when no host shell can be resolved", async () => {
    process.env.PATH = "";
    process.env.SHELL = "/definitely/missing-shell";
    process.env.TOKENJUICE_CURSOR_SHELL = "/definitely/missing-shell";

    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: {
        command: "git status --short",
      },
    });
    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));

    expect(code).toBe(0);
    expect(output).toBe("");
  });

  it("quotes commands containing single quotes using POSIX '\\'' escape", async () => {
    // Pins the exact POSIX quoting of the wrapped command string so that
    // swapping the host's local shellQuote for the shared implementation
    // during refactor cannot silently change escape semantics.
    const home = await createTempDir();
    const hostShellPath = join(home, "host-shell");
    await writeFile(hostShellPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: {
        command: "echo it's raining",
        shell: hostShellPath,
      },
    });

    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as { updated_input: { command: string } };

    expect(code).toBe(0);
    expect(response.updated_input.command).toBe(
      `/usr/local/bin/tokenjuice wrap -- ${hostShellPath} -lc 'echo it'\\''s raining'`,
    );
  });

  it("denies native Windows shell interception with a WSL message", async () => {
    setPlatform("win32");
    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: {
        command: "git status --short",
      },
    });

    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as {
      permission: string;
      user_message: string;
    };

    expect(code).toBe(0);
    expect(response.permission).toBe("deny");
    expect(response.user_message).toBe("tokenjuice cursor integration does not support native Windows shells yet. run Cursor in WSL instead.");
  });
});
