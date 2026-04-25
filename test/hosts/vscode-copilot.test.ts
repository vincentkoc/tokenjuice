import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorVscodeCopilotHook,
  getVscodeCopilotInstructionsSnippet,
  installVscodeCopilotHook,
  runVscodeCopilotPreToolUseHook,
  uninstallVscodeCopilotHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalShell = process.env.SHELL;
const originalCopilotHome = process.env.COPILOT_HOME;
const originalPlatform = process.platform;

afterEach(async () => {
  process.env.PATH = originalPath;
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalShell === undefined) {
    delete process.env.SHELL;
  } else {
    process.env.SHELL = originalShell;
  }
  if (originalCopilotHome === undefined) {
    delete process.env.COPILOT_HOME;
  } else {
    process.env.COPILOT_HOME = originalCopilotHome;
  }
  Object.defineProperty(process, "platform", { value: originalPlatform });
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-vscode-copilot-test-"));
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

describe("installVscodeCopilotHook", () => {
  it("writes a preToolUse run_in_terminal entry at the given path", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-vscode.json");
    process.env.PATH = "";

    const result = await installVscodeCopilotHook(hooksPath);
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      version?: number;
      hooks: { preToolUse: Array<{ command: string; matcher?: string; type?: string }> };
    };

    expect(result.hooksPath).toBe(hooksPath);
    expect(parsed.version).toBe(1);
    expect(parsed.hooks.preToolUse).toHaveLength(1);
    expect(parsed.hooks.preToolUse[0]?.matcher).toBe("run_in_terminal");
    expect(parsed.hooks.preToolUse[0]?.type).toBe("command");
    expect(parsed.hooks.preToolUse[0]?.command).toContain("vscode-copilot-pre-tool-use");
    expect(parsed.hooks.preToolUse[0]?.command).toContain("--wrap-launcher");
  });

  it("resolves the install directory from HOME and ignores COPILOT_HOME", async () => {
    const home = await createTempDir();
    const decoy = await createTempDir();
    process.env.HOME = home;
    process.env.COPILOT_HOME = decoy;
    process.env.PATH = "";

    const result = await installVscodeCopilotHook(undefined, {
      binaryPath: join(home, "bin", "tokenjuice"),
    });

    const expectedPath = join(home, ".copilot", "hooks", "tokenjuice-vscode.json");
    expect(result.hooksPath).toBe(expectedPath);
    expect(result.hooksPath.startsWith(decoy)).toBe(false);
  });

  it("is idempotent", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-vscode.json");
    process.env.PATH = "";

    await installVscodeCopilotHook(hooksPath, { binaryPath: join(home, "bin", "tokenjuice") });
    const first = await readFile(hooksPath, "utf8");
    await installVscodeCopilotHook(hooksPath, { binaryPath: join(home, "bin", "tokenjuice") });
    const second = await readFile(hooksPath, "utf8");

    expect(second).toBe(first);
    const parsed = JSON.parse(second) as { hooks: { preToolUse: unknown[] } };
    expect(parsed.hooks.preToolUse).toHaveLength(1);
  });

  it("preserves unrelated sibling hook entries and top-level keys", async () => {
    const home = await createTempDir();
    const hooksDir = join(home, ".copilot", "hooks");
    const hooksPath = join(hooksDir, "tokenjuice-vscode.json");
    process.env.PATH = "";
    await mkdir(hooksDir, { recursive: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        disableAllHooks: false,
        customKey: { hello: "world" },
        hooks: {
          preToolUse: [
            { type: "command", matcher: "run_in_terminal", command: "echo user-entry" },
          ],
          postToolUse: [{ type: "command", matcher: "run_in_terminal", command: "echo user-post" }],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    await installVscodeCopilotHook(hooksPath, { binaryPath: join(home, "bin", "tokenjuice") });

    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      customKey?: { hello?: string };
      disableAllHooks?: boolean;
      hooks: {
        preToolUse: Array<{ command: string }>;
        postToolUse: Array<{ command: string }>;
      };
    };

    expect(parsed.customKey?.hello).toBe("world");
    expect(parsed.disableAllHooks).toBe(false);
    expect(parsed.hooks.postToolUse[0]?.command).toBe("echo user-post");
    expect(parsed.hooks.preToolUse).toHaveLength(2);
    expect(parsed.hooks.preToolUse.find((entry) => entry.command === "echo user-entry")).toBeTruthy();
    expect(parsed.hooks.preToolUse.find((entry) => entry.command.includes("vscode-copilot-pre-tool-use"))).toBeTruthy();
  });

  it("does not touch a coexisting copilot-cli hook file in the shared dir", async () => {
    const home = await createTempDir();
    const hooksDir = join(home, ".copilot", "hooks");
    const cliPath = join(hooksDir, "tokenjuice-cli.json");
    const vscodePath = join(hooksDir, "tokenjuice-vscode.json");
    process.env.PATH = "";

    await mkdir(hooksDir, { recursive: true });
    const cliContent = `${JSON.stringify({
      version: 1,
      hooks: {
        postToolUse: [
          { type: "command", matcher: "shell", command: "tokenjuice copilot-cli-post-tool-use" },
        ],
      },
    }, null, 2)}\n`;
    await writeFile(cliPath, cliContent, "utf8");

    await installVscodeCopilotHook(vscodePath, { binaryPath: join(home, "bin", "tokenjuice") });

    expect(await readFile(cliPath, "utf8")).toBe(cliContent);
    const parsed = JSON.parse(await readFile(vscodePath, "utf8")) as {
      hooks: { preToolUse: Array<{ command: string }> };
    };
    expect(parsed.hooks.preToolUse[0]?.command).toContain("vscode-copilot-pre-tool-use");
  });

  it("migrates a legacy tokenjuice.json install to the per-host filename", async () => {
    const home = await createTempDir();
    const hooksDir = join(home, ".copilot", "hooks");
    const legacyPath = join(hooksDir, "tokenjuice.json");
    const newPath = join(hooksDir, "tokenjuice-vscode.json");
    process.env.PATH = "";

    await mkdir(hooksDir, { recursive: true });
    await writeFile(
      legacyPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [
            {
              type: "command",
              matcher: "run_in_terminal",
              command: "/old/tokenjuice vscode-copilot-pre-tool-use --wrap-launcher /old/tokenjuice",
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const result = await installVscodeCopilotHook(newPath, {
      binaryPath: join(home, "bin", "tokenjuice"),
    });

    expect(result.migratedFromPath).toBe(legacyPath);
    await expect(readFile(legacyPath, "utf8")).rejects.toThrow(/ENOENT/);
    const parsed = JSON.parse(await readFile(newPath, "utf8")) as {
      hooks: { preToolUse: Array<{ command: string }> };
    };
    expect(parsed.hooks.preToolUse).toHaveLength(1);
    expect(parsed.hooks.preToolUse[0]?.command).toContain("vscode-copilot-pre-tool-use");
  });
});

describe("uninstallVscodeCopilotHook", () => {
  it("removes only the tokenjuice entry and preserves siblings", async () => {
    const home = await createTempDir();
    const hooksDir = join(home, ".copilot", "hooks");
    const hooksPath = join(hooksDir, "tokenjuice-vscode.json");
    process.env.PATH = "";
    await installVscodeCopilotHook(hooksPath, { binaryPath: join(home, "bin", "tokenjuice") });

    const config = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: { preToolUse: unknown[] };
    };
    config.hooks.preToolUse.unshift({ type: "command", matcher: "run_in_terminal", command: "echo keep" });
    await writeFile(hooksPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = await uninstallVscodeCopilotHook(hooksPath);

    expect(result.removed).toBe(1);
    expect(result.deletedFile).toBe(false);
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: { preToolUse: Array<{ command: string }> };
    };
    expect(parsed.hooks.preToolUse).toHaveLength(1);
    expect(parsed.hooks.preToolUse[0]?.command).toBe("echo keep");
  });

  it("deletes the file when it becomes empty", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-vscode.json");
    process.env.PATH = "";
    await installVscodeCopilotHook(hooksPath, { binaryPath: join(home, "bin", "tokenjuice") });

    const result = await uninstallVscodeCopilotHook(hooksPath);

    expect(result.removed).toBe(1);
    expect(result.deletedFile).toBe(true);
    await expect(readFile(hooksPath, "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("is a no-op when nothing is installed", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-vscode.json");

    const result = await uninstallVscodeCopilotHook(hooksPath);

    expect(result.removed).toBe(0);
    expect(result.deletedFile).toBe(false);
  });
});

describe("doctorVscodeCopilotHook", () => {
  it("reports disabled when no file exists", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-vscode.json");
    process.env.PATH = "";

    const report = await doctorVscodeCopilotHook(hooksPath, {
      binaryPath: join(home, "bin", "tokenjuice"),
    });

    expect(report.status).toBe("disabled");
    expect(report.advisories.some((text) => text.includes("chat.useHooks"))).toBe(true);
    expect(
      report.advisories.some((text) => /copilot-instructions|AGENTS\.md/i.test(text)),
    ).toBe(true);
  });

  it("reports ok for a fresh install with an existing launcher", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-vscode.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installVscodeCopilotHook(hooksPath);

    const report = await doctorVscodeCopilotHook(hooksPath);

    expect(report.status).toBe("ok");
    expect(report.detectedCommand).toContain(`${launcherPath} vscode-copilot-pre-tool-use`);
    expect(report.issues).toEqual([]);
  });

  it("reports warn when the installed command drifts", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-vscode.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await mkdir(join(home, ".copilot", "hooks"), { recursive: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [
            {
              type: "command",
              matcher: "run_in_terminal",
              command: `${launcherPath} vscode-copilot-pre-tool-use --wrap-launcher /old/tokenjuice`,
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorVscodeCopilotHook(hooksPath);

    expect(report.status).toBe("warn");
    expect(report.issues[0]).toContain("does not match");
  });

  it("reports broken when the referenced binary is missing", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-vscode.json");
    process.env.PATH = "";
    await mkdir(join(home, ".copilot", "hooks"), { recursive: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [
            {
              type: "command",
              matcher: "run_in_terminal",
              command: "/does/not/exist/tokenjuice vscode-copilot-pre-tool-use --wrap-launcher /does/not/exist/tokenjuice",
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorVscodeCopilotHook(hooksPath);

    expect(report.status).toBe("broken");
    expect(report.missingPaths.length).toBeGreaterThan(0);
  });

  it("reports disabled when disableAllHooks is true", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-vscode.json");
    process.env.PATH = "";
    await mkdir(join(home, ".copilot", "hooks"), { recursive: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        disableAllHooks: true,
        hooks: {
          preToolUse: [
            { type: "command", matcher: "run_in_terminal", command: "tokenjuice vscode-copilot-pre-tool-use" },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorVscodeCopilotHook(hooksPath);

    expect(report.status).toBe("disabled");
    expect(report.issues[0]).toContain("disableAllHooks");
  });
});

describe("runVscodeCopilotPreToolUseHook", () => {
  it("rewrites run_in_terminal commands and preserves sibling fields", async () => {
    process.env.SHELL = "/bin/bash";
    setPlatform("darwin");

    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "run_in_terminal",
      tool_input: {
        command: "git status --short",
        explanation: "List contents",
        goal: "check repo",
        mode: "sync",
        timeout: 30,
      },
    });

    const { code, output } = await captureStdout(() =>
      runVscodeCopilotPreToolUseHook(payload, "/usr/local/bin/tokenjuice"),
    );

    expect(code).toBe(0);
    const response = JSON.parse(output) as {
      hookSpecificOutput: {
        hookEventName: string;
        updatedInput: {
          command: string;
          explanation?: string;
          goal?: string;
          mode?: string;
          timeout?: number;
        };
      };
    };
    expect(response.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(response.hookSpecificOutput.updatedInput.command).toBe(
      "/usr/local/bin/tokenjuice wrap -- /bin/bash -lc 'git status --short'",
    );
    expect(response.hookSpecificOutput.updatedInput.explanation).toBe("List contents");
    expect(response.hookSpecificOutput.updatedInput.goal).toBe("check repo");
    expect(response.hookSpecificOutput.updatedInput.mode).toBe("sync");
    expect(response.hookSpecificOutput.updatedInput.timeout).toBe(30);
  });

  it("escapes commands containing single quotes and $VAR sequences", async () => {
    process.env.SHELL = "/bin/bash";
    setPlatform("linux");

    const payload = JSON.stringify({
      tool_name: "run_in_terminal",
      tool_input: { command: "echo 'it''s $HOME'" },
    });

    const { code, output } = await captureStdout(() =>
      runVscodeCopilotPreToolUseHook(payload, "/usr/local/bin/tokenjuice"),
    );
    expect(code).toBe(0);
    const response = JSON.parse(output) as {
      hookSpecificOutput: { updatedInput: { command: string } };
    };
    expect(response.hookSpecificOutput.updatedInput.command).toContain("/bin/bash -lc ");
    expect(response.hookSpecificOutput.updatedInput.command).toContain("$HOME");
  });

  it("wraps on win32 with powershell", async () => {
    setPlatform("win32");

    const payload = JSON.stringify({
      tool_name: "run_in_terminal",
      tool_input: { command: "Get-ChildItem" },
    });

    const { code, output } = await captureStdout(() =>
      runVscodeCopilotPreToolUseHook(payload, "tokenjuice"),
    );
    expect(code).toBe(0);
    const response = JSON.parse(output) as {
      hookSpecificOutput: { updatedInput: { command: string } };
    };
    expect(response.hookSpecificOutput.updatedInput.command).toContain("powershell");
    expect(response.hookSpecificOutput.updatedInput.command).toContain("-Command");
  });

  it("emits {} on non-matching tool names", async () => {
    const payload = JSON.stringify({
      tool_name: "something_else",
      tool_input: { command: "echo hi" },
    });

    const { code, output } = await captureStdout(() => runVscodeCopilotPreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("emits {} on malformed input", async () => {
    const { code, output } = await captureStdout(() => runVscodeCopilotPreToolUseHook("not-json"));
    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("skips commands that are already wrapped", async () => {
    const payload = JSON.stringify({
      tool_name: "run_in_terminal",
      tool_input: { command: "tokenjuice wrap -- git status" },
    });

    const { code, output } = await captureStdout(() => runVscodeCopilotPreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("skips already wrapped commands after a leading cd prefix", async () => {
    const payload = JSON.stringify({
      tool_name: "run_in_terminal",
      tool_input: { command: "cd /repo && tokenjuice wrap -- git status" },
    });

    const { code, output } = await captureStdout(() => runVscodeCopilotPreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("honors explicit raw bypass inside the command", async () => {
    const payload = JSON.stringify({
      tool_name: "run_in_terminal",
      tool_input: { command: "tokenjuice wrap --raw -- git status" },
    });

    const { code, output } = await captureStdout(() => runVscodeCopilotPreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("honors explicit raw bypass after a leading cd prefix", async () => {
    const payload = JSON.stringify({
      tool_name: "run_in_terminal",
      tool_input: { command: "cd /repo && tokenjuice wrap --raw -- git status" },
    });

    const { code, output } = await captureStdout(() => runVscodeCopilotPreToolUseHook(payload));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("handles the captured VS Code Copilot PreToolUse fixture", async () => {
    process.env.SHELL = "/bin/zsh";
    setPlatform("darwin");
    const fixture = await readFile(resolve("test/hosts/fixtures/vscode-copilot-pretool.json"), "utf8");

    const { code, output } = await captureStdout(() =>
      runVscodeCopilotPreToolUseHook(fixture, "/usr/local/bin/tokenjuice"),
    );

    expect(code).toBe(0);
    const response = JSON.parse(output) as {
      hookSpecificOutput: {
        updatedInput: { command: string; explanation?: string; goal?: string; mode?: string };
      };
    };
    expect(response.hookSpecificOutput.updatedInput.command).toContain("/usr/local/bin/tokenjuice wrap --");
    expect(response.hookSpecificOutput.updatedInput.command).toContain("ls /tmp");
    expect(response.hookSpecificOutput.updatedInput.explanation).toBe("List contents of /tmp");
    expect(response.hookSpecificOutput.updatedInput.goal).toBe("List /tmp");
    expect(response.hookSpecificOutput.updatedInput.mode).toBe("sync");
  });
});

describe("getVscodeCopilotInstructionsSnippet", () => {
  it("returns a non-empty snippet with tokenjuice markers and guidance", () => {
    const snippet = getVscodeCopilotInstructionsSnippet();
    expect(snippet).toContain("tokenjuice:vscode-copilot BEGIN");
    expect(snippet).toContain("tokenjuice:vscode-copilot END");
    expect(snippet).toContain("tokenjuice wrap --raw --");
    expect(snippet).toContain("authoritative");
  });
});
