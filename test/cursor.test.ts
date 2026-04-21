import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorCursorHook, installCursorHook, runCursorPreToolUseHook } from "../src/index.js";

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
    expect(response.updated_input.command).toContain(`${process.execPath} /repo/dist/cli/main.js wrap -- ${hostShellPath} -lc 'git status --short'`);
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
