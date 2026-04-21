import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorCursorHook, installCursorHook, runCursorPreToolUseHook } from "../src/index.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = originalPath;
  delete process.env.CURSOR_HOME;
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
});

describe("runCursorPreToolUseHook", () => {
  it("wraps shell commands with tokenjuice wrap", async () => {
    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: {
        command: "git status --short",
        working_directory: "/repo",
      },
    });

    const { code, output } = await captureStdout(() => runCursorPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const response = JSON.parse(output) as {
      updated_input: { command: string; working_directory?: string };
    };

    expect(code).toBe(0);
    expect(response.updated_input.command).toBe("/usr/local/bin/tokenjuice wrap -- sh -lc 'git status --short'");
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
    const payload = JSON.stringify({
      tool_name: "Shell",
      tool_input: {
        command: "git status --short",
      },
    });

    const { code, output } = await captureStdout(() =>
      runCursorPreToolUseHook(payload, "/repo/dist/cli/main.js")
    );
    const response = JSON.parse(output) as {
      updated_input: { command: string };
    };

    expect(code).toBe(0);
    expect(response.updated_input.command).toContain(`${process.execPath} /repo/dist/cli/main.js wrap -- sh -lc 'git status --short'`);
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
});
