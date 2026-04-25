import { access, constants as fsConstants } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorClineHook,
  installClineHook,
  runClinePostToolUseHook,
  uninstallClineHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalHooksDir = process.env.CLINE_HOOKS_DIR;

afterEach(async () => {
  if (originalHooksDir === undefined) {
    delete process.env.CLINE_HOOKS_DIR;
  } else {
    process.env.CLINE_HOOKS_DIR = originalHooksDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-cline-test-"));
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

async function isExecutable(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    access(path, fsConstants.X_OK, (error) => resolve(!error));
  });
}

describe("cline hooks", () => {
  it("installs an executable PostToolUse hook script", async () => {
    const home = await createTempDir();
    const hookPath = join(home, "Hooks", "tokenjuice-post-tool-use");
    const launcherPath = join(home, "bin", "tokenjuice");

    const result = await installClineHook(hookPath, { binaryPath: launcherPath, local: true });
    const script = await readFile(hookPath, "utf8");

    expect(result.hookPath).toBe(hookPath);
    expect(result.command).toBe(`${launcherPath} cline-post-tool-use`);
    expect(script).toContain("#!/usr/bin/env bash");
    expect(script).toContain(`exec ${launcherPath} cline-post-tool-use`);
    expect(process.platform === "win32" || await isExecutable(hookPath)).toBe(true);
  });

  it("reports installed and uninstalled hook health", async () => {
    const home = await createTempDir();
    const hookPath = join(home, "Hooks", "tokenjuice-post-tool-use");
    const launcherPath = join(home, "tokenjuice");
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    await installClineHook(hookPath, { binaryPath: launcherPath, local: true });
    const installed = await doctorClineHook(hookPath, { binaryPath: launcherPath, local: true });

    expect(installed.status).toBe("ok");
    expect(installed.detectedCommand).toBe(`${launcherPath} cline-post-tool-use`);
    expect(installed.advisories[0]).toContain("beta");

    const removed = await uninstallClineHook(hookPath);
    const disabled = await doctorClineHook(hookPath, { binaryPath: launcherPath, local: true });

    expect(removed.removed).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("uses CLINE_HOOKS_DIR for default global hooks", async () => {
    const home = await createTempDir();
    process.env.CLINE_HOOKS_DIR = home;

    const installed = await installClineHook(undefined, { local: true });
    const expectedHookPath = join(home, "tokenjuice-post-tool-use");
    const doctor = await doctorClineHook(undefined, { local: true });

    expect(installed.hookPath).toBe(expectedHookPath);
    expect(doctor.hookPath).toBe(expectedHookPath);
    expect(doctor.status).toBe("ok");
  });

  it("injects compacted context for noisy execute_command output", async () => {
    const payload = JSON.stringify({
      hookName: "PostToolUse",
      workspaceRoots: ["/repo"],
      postToolUse: {
        toolName: "execute_command",
        parameters: {
          command: "git status",
        },
        result: [
          "On branch pr-65478-security-fix",
          "Your branch and 'origin/pr-65478-security-fix' have diverged,",
          "and have 8 and 642 different commits each, respectively.",
          "",
          "Changes not staged for commit:",
          "\tmodified:   src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts",
          "\tmodified:   src/agents/pi-embedded-runner/run/attempt.test.ts",
          "",
          "no changes added to commit",
        ].join("\n"),
        success: true,
        executionTimeMs: 3450,
      },
    });

    const { code, output } = await captureStdout(() => runClinePostToolUseHook(payload));
    const response = JSON.parse(output) as {
      cancel?: boolean;
      contextModification?: string;
      errorMessage?: string;
    };

    expect(code).toBe(0);
    expect(response.cancel).toBe(false);
    expect(response.errorMessage).toBe("");
    expect(response.contextModification).toContain("Changes not staged:");
    expect(response.contextModification).toContain("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts");
    expect(response.contextModification).not.toContain("and have 8 and 642");
    expect(response.contextModification).toContain("tokenjuice wrap --raw -- <command>");
  });

  it("keeps non-command hook payloads silent", async () => {
    const payload = JSON.stringify({
      hookName: "PostToolUse",
      postToolUse: {
        toolName: "read_file",
        parameters: { path: "README.md" },
        result: "hello",
      },
    });

    const { code, output } = await captureStdout(() => runClinePostToolUseHook(payload));
    const response = JSON.parse(output) as {
      cancel?: boolean;
      contextModification?: string;
      errorMessage?: string;
    };

    expect(code).toBe(0);
    expect(response).toEqual({ cancel: false, contextModification: "", errorMessage: "" });
  });
});
