import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorCopilotCliHook,
  getCopilotCliInstructionsSnippet,
  installCopilotCliHook,
  runCopilotCliPostToolUseHook,
  uninstallCopilotCliHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalShell = process.env.SHELL;
const originalCopilotHome = process.env.COPILOT_HOME;
const originalPlatform = process.platform;
const originalMaxInline = process.env.TOKENJUICE_COPILOT_CLI_MAX_INLINE_CHARS;
const originalStore = process.env.TOKENJUICE_COPILOT_CLI_STORE;

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
  if (originalMaxInline === undefined) {
    delete process.env.TOKENJUICE_COPILOT_CLI_MAX_INLINE_CHARS;
  } else {
    process.env.TOKENJUICE_COPILOT_CLI_MAX_INLINE_CHARS = originalMaxInline;
  }
  if (originalStore === undefined) {
    delete process.env.TOKENJUICE_COPILOT_CLI_STORE;
  } else {
    process.env.TOKENJUICE_COPILOT_CLI_STORE = originalStore;
  }
  Object.defineProperty(process, "platform", { value: originalPlatform });
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-copilot-cli-test-"));
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

describe("installCopilotCliHook", () => {
  it("writes a postToolUse shell entry at the given path", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    process.env.PATH = "";

    const result = await installCopilotCliHook(hooksPath);
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      version?: number;
      hooks: { postToolUse: Array<{ command: string; matcher?: string; type?: string }> };
    };

    expect(result.hooksPath).toBe(hooksPath);
    expect(parsed.version).toBe(1);
    expect(parsed.hooks.postToolUse).toHaveLength(1);
    expect(parsed.hooks.postToolUse[0]?.matcher).toBe("shell");
    expect(parsed.hooks.postToolUse[0]?.type).toBe("command");
    expect(parsed.hooks.postToolUse[0]?.command).toContain("copilot-cli-post-tool-use");
  });

  it("resolves the install directory from COPILOT_HOME when set", async () => {
    const home = await createTempDir();
    const copilotHome = await createTempDir();
    process.env.HOME = home;
    process.env.COPILOT_HOME = copilotHome;
    process.env.PATH = "";

    const result = await installCopilotCliHook(undefined, {
      binaryPath: join(home, "bin", "tokenjuice"),
    });

    const expectedPath = join(copilotHome, "hooks", "tokenjuice-cli.json");
    expect(result.hooksPath).toBe(expectedPath);
  });

  it("falls back to $HOME/.copilot when COPILOT_HOME is unset", async () => {
    const home = await createTempDir();
    process.env.HOME = home;
    delete process.env.COPILOT_HOME;
    process.env.PATH = "";

    const result = await installCopilotCliHook(undefined, {
      binaryPath: join(home, "bin", "tokenjuice"),
    });

    const expectedPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    expect(result.hooksPath).toBe(expectedPath);
  });

  it("is idempotent", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    process.env.PATH = "";

    await installCopilotCliHook(hooksPath, { binaryPath: join(home, "bin", "tokenjuice") });
    const first = await readFile(hooksPath, "utf8");
    await installCopilotCliHook(hooksPath, { binaryPath: join(home, "bin", "tokenjuice") });
    const second = await readFile(hooksPath, "utf8");

    expect(second).toBe(first);
    const parsed = JSON.parse(second) as { hooks: { postToolUse: unknown[] } };
    expect(parsed.hooks.postToolUse).toHaveLength(1);
  });

  it("preserves unrelated sibling hook entries and top-level keys", async () => {
    const home = await createTempDir();
    const hooksDir = join(home, ".copilot", "hooks");
    const hooksPath = join(hooksDir, "tokenjuice-cli.json");
    process.env.PATH = "";
    await mkdir(hooksDir, { recursive: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        disableAllHooks: false,
        customKey: { hello: "world" },
        hooks: {
          postToolUse: [
            { type: "command", matcher: "shell", command: "echo user-post" },
          ],
          preToolUse: [{ type: "command", matcher: "shell", command: "echo user-pre" }],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    await installCopilotCliHook(hooksPath, { binaryPath: join(home, "bin", "tokenjuice") });

    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      customKey?: { hello?: string };
      disableAllHooks?: boolean;
      hooks: {
        postToolUse: Array<{ command: string }>;
        preToolUse: Array<{ command: string }>;
      };
    };

    expect(parsed.customKey?.hello).toBe("world");
    expect(parsed.disableAllHooks).toBe(false);
    expect(parsed.hooks.preToolUse[0]?.command).toBe("echo user-pre");
    expect(parsed.hooks.postToolUse).toHaveLength(2);
    expect(parsed.hooks.postToolUse.find((entry) => entry.command === "echo user-post")).toBeTruthy();
    expect(parsed.hooks.postToolUse.find((entry) => entry.command.includes("copilot-cli-post-tool-use"))).toBeTruthy();
  });

  it("does not touch a coexisting vscode-copilot hook file in the shared dir", async () => {
    const home = await createTempDir();
    const hooksDir = join(home, ".copilot", "hooks");
    const vscodePath = join(hooksDir, "tokenjuice-vscode.json");
    const cliPath = join(hooksDir, "tokenjuice-cli.json");
    process.env.PATH = "";

    await mkdir(hooksDir, { recursive: true });
    const vscodeContent = `${JSON.stringify({
      version: 1,
      hooks: {
        preToolUse: [
          { type: "command", matcher: "run_in_terminal", command: "tokenjuice vscode-copilot-pre-tool-use" },
        ],
      },
    }, null, 2)}\n`;
    await writeFile(vscodePath, vscodeContent, "utf8");

    await installCopilotCliHook(cliPath, { binaryPath: join(home, "bin", "tokenjuice") });

    expect(await readFile(vscodePath, "utf8")).toBe(vscodeContent);
    const parsed = JSON.parse(await readFile(cliPath, "utf8")) as {
      hooks: { postToolUse: Array<{ command: string }> };
    };
    expect(parsed.hooks.postToolUse[0]?.command).toContain("copilot-cli-post-tool-use");
  });
});

describe("uninstallCopilotCliHook", () => {
  it("removes only the tokenjuice entry and preserves siblings", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    process.env.PATH = "";
    await installCopilotCliHook(hooksPath, { binaryPath: join(home, "bin", "tokenjuice") });

    const config = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: { postToolUse: unknown[] };
    };
    config.hooks.postToolUse.unshift({ type: "command", matcher: "shell", command: "echo keep" });
    await writeFile(hooksPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = await uninstallCopilotCliHook(hooksPath);

    expect(result.removed).toBe(1);
    expect(result.deletedFile).toBe(false);
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: { postToolUse: Array<{ command: string }> };
    };
    expect(parsed.hooks.postToolUse).toHaveLength(1);
    expect(parsed.hooks.postToolUse[0]?.command).toBe("echo keep");
  });

  it("deletes the file when it becomes empty", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    process.env.PATH = "";
    await installCopilotCliHook(hooksPath, { binaryPath: join(home, "bin", "tokenjuice") });

    const result = await uninstallCopilotCliHook(hooksPath);

    expect(result.removed).toBe(1);
    expect(result.deletedFile).toBe(true);
    await expect(readFile(hooksPath, "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("is a no-op when nothing is installed", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");

    const result = await uninstallCopilotCliHook(hooksPath);

    expect(result.removed).toBe(0);
    expect(result.deletedFile).toBe(false);
  });

  it("does not touch a sibling vscode-copilot hook file", async () => {
    const home = await createTempDir();
    const hooksDir = join(home, ".copilot", "hooks");
    const vscodePath = join(hooksDir, "tokenjuice-vscode.json");
    const cliPath = join(hooksDir, "tokenjuice-cli.json");
    process.env.PATH = "";

    await mkdir(hooksDir, { recursive: true });
    const vscodeContent = `${JSON.stringify({
      version: 1,
      hooks: {
        preToolUse: [
          { type: "command", matcher: "run_in_terminal", command: "tokenjuice vscode-copilot-pre-tool-use" },
        ],
      },
    }, null, 2)}\n`;
    await writeFile(vscodePath, vscodeContent, "utf8");
    await installCopilotCliHook(cliPath, { binaryPath: join(home, "bin", "tokenjuice") });

    await uninstallCopilotCliHook(cliPath);

    expect(await readFile(vscodePath, "utf8")).toBe(vscodeContent);
  });
});

describe("doctorCopilotCliHook", () => {
  it("reports disabled when no file exists", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    process.env.PATH = "";

    const report = await doctorCopilotCliHook(hooksPath, {
      binaryPath: join(home, "bin", "tokenjuice"),
    });

    expect(report.status).toBe("disabled");
    expect(
      report.advisories.some((text) => /copilot-instructions|AGENTS\.md/i.test(text)),
    ).toBe(true);
  });

  it("reports ok for a fresh install with an existing launcher", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installCopilotCliHook(hooksPath);

    const report = await doctorCopilotCliHook(hooksPath);

    expect(report.status).toBe("ok");
    expect(report.detectedCommand).toContain(`${launcherPath} copilot-cli-post-tool-use`);
    expect(report.issues).toEqual([]);
  });

  it("reports warn when the installed command drifts", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");
    const cellarDir = join(home, "Cellar", "tokenjuice", "0.0.1", "bin");
    const cellarLauncher = join(cellarDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await mkdir(cellarDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(cellarLauncher, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await mkdir(join(home, ".copilot", "hooks"), { recursive: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          postToolUse: [
            {
              type: "command",
              matcher: "shell",
              command: `${cellarLauncher} copilot-cli-post-tool-use`,
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCopilotCliHook(hooksPath);

    expect(report.status).toBe("warn");
    expect(report.issues.some((issue) => issue.includes("Cellar"))).toBe(true);
  });

  it("reports broken when the referenced binary is missing", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    process.env.PATH = "";
    await mkdir(join(home, ".copilot", "hooks"), { recursive: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          postToolUse: [
            {
              type: "command",
              matcher: "shell",
              command: "/does/not/exist/tokenjuice copilot-cli-post-tool-use",
            },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCopilotCliHook(hooksPath);

    expect(report.status).toBe("broken");
    expect(report.missingPaths.length).toBeGreaterThan(0);
  });

  it("reports disabled when disableAllHooks is true", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    process.env.PATH = "";
    await mkdir(join(home, ".copilot", "hooks"), { recursive: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        disableAllHooks: true,
        hooks: {
          postToolUse: [
            { type: "command", matcher: "shell", command: "tokenjuice copilot-cli-post-tool-use" },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCopilotCliHook(hooksPath);

    expect(report.status).toBe("disabled");
    expect(report.issues[0]).toContain("disableAllHooks");
  });

  it("reports stray tokenjuice entries in sibling hook files", async () => {
    const home = await createTempDir();
    const hooksDir = join(home, ".copilot", "hooks");
    const hooksPath = join(hooksDir, "tokenjuice-cli.json");
    const strayPath = join(hooksDir, "stray.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installCopilotCliHook(hooksPath);
    await writeFile(
      strayPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          postToolUse: [
            { type: "command", matcher: "shell", command: "tokenjuice copilot-cli-post-tool-use" },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCopilotCliHook(hooksPath);

    expect(report.issues.some((issue) => issue.includes(strayPath))).toBe(true);
    expect(report.status).toBe("warn");
  });
});

describe("runCopilotCliPostToolUseHook", () => {
  it("rewrites compactable bash output into modifiedResult", async () => {
    const longOutput = Array.from({ length: 120 }, (_, i) => `src/file-${i}.ts`).join("\n");
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "bash",
      tool_input: { command: "git ls-files" },
      tool_result: {
        result_type: "success",
        text_result_for_llm: longOutput,
      },
    });

    const { code, output } = await captureStdout(() => runCopilotCliPostToolUseHook(payload));

    expect(code).toBe(0);
    const response = JSON.parse(output) as {
      modifiedResult?: { text_result_for_llm?: string; textResultForLlm?: string };
    };
    expect(response.modifiedResult).toBeDefined();
    const compacted = response.modifiedResult?.text_result_for_llm ?? "";
    expect(compacted.length).toBeGreaterThan(0);
    expect(compacted.length).toBeLessThan(longOutput.length);
    // Both snake_case and camelCase keys are present for wire-format
    // compatibility until the Copilot CLI stdout shape is pinned empirically.
    expect(response.modifiedResult?.textResultForLlm).toBe(compacted);
  });

  it("rewrites camelCase live-wire payloads (Copilot CLI 1.0.35)", async () => {
    // Live Copilot CLI PostToolUse payloads are camelCase on the wire,
    // even though the design brief and captured fixture used snake_case.
    const longOutput = Array.from({ length: 120 }, (_, i) => `src/file-${i}.ts`).join("\n");
    const payload = JSON.stringify({
      sessionId: "abc",
      timestamp: 1700000000000,
      cwd: "/tmp",
      toolName: "bash",
      toolArgs: { command: "git ls-files" },
      toolResult: {
        resultType: "success",
        textResultForLlm: longOutput,
      },
    });

    const { code, output } = await captureStdout(() => runCopilotCliPostToolUseHook(payload));

    expect(code).toBe(0);
    const response = JSON.parse(output) as {
      modifiedResult?: { textResultForLlm?: string; text_result_for_llm?: string };
    };
    expect(response.modifiedResult).toBeDefined();
    const compacted = response.modifiedResult?.textResultForLlm ?? "";
    expect(compacted.length).toBeGreaterThan(0);
    expect(compacted.length).toBeLessThan(longOutput.length);
    expect(response.modifiedResult?.text_result_for_llm).toBe(compacted);
  });

  it("handles the captured Copilot CLI PostToolUse fixture without throwing", async () => {
    const fixture = await readFile(resolve("test/hosts/fixtures/copilot-cli-posttool.json"), "utf8");

    const { code, output } = await captureStdout(() => runCopilotCliPostToolUseHook(fixture));

    expect(code).toBe(0);
    // Fixture command is `echo hi` — nothing to compact, so skip.
    expect(output.trim()).toBe("{}");
  });

  it("handles the captured live camelCase PostToolUse fixture without throwing", async () => {
    const fixture = await readFile(
      resolve("test/hosts/fixtures/copilot-cli-posttool-live.json"),
      "utf8",
    );

    const { code, output } = await captureStdout(() => runCopilotCliPostToolUseHook(fixture));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("emits {} for non-bash tools", async () => {
    const payload = JSON.stringify({
      tool_name: "str_replace_editor",
      tool_input: { command: "echo hi" },
      tool_result: { result_type: "success", text_result_for_llm: "hi\n" },
    });

    const { code, output } = await captureStdout(() => runCopilotCliPostToolUseHook(payload));
    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("emits {} on malformed input", async () => {
    const { code, output } = await captureStdout(() => runCopilotCliPostToolUseHook("not-json"));
    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("passes through failure result_type untouched", async () => {
    const payload = JSON.stringify({
      tool_name: "bash",
      tool_input: { command: "exit 1" },
      tool_result: {
        result_type: "failure",
        text_result_for_llm: "some error output\n<exited with exit code 1>",
      },
    });

    const { code, output } = await captureStdout(() => runCopilotCliPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("honors explicit raw bypass in the command", async () => {
    const payload = JSON.stringify({
      tool_name: "bash",
      tool_input: { command: "tokenjuice wrap --raw -- cat large.log" },
      tool_result: {
        result_type: "success",
        text_result_for_llm: Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n"),
      },
    });

    const { code, output } = await captureStdout(() => runCopilotCliPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("honors explicit raw bypass after a leading cd prefix", async () => {
    const payload = JSON.stringify({
      tool_name: "bash",
      tool_input: { command: "cd /repo && tokenjuice wrap --raw -- cat large.log" },
      tool_result: {
        result_type: "success",
        text_result_for_llm: Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n"),
      },
    });

    const { code, output } = await captureStdout(() => runCopilotCliPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("emits {} when tool_result is absent", async () => {
    const payload = JSON.stringify({
      tool_name: "bash",
      tool_input: { command: "echo hi" },
    });

    const { code, output } = await captureStdout(() => runCopilotCliPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });
});

describe("getCopilotCliInstructionsSnippet", () => {
  it("returns a non-empty snippet with tokenjuice markers and guidance", () => {
    const snippet = getCopilotCliInstructionsSnippet();
    expect(snippet).toContain("tokenjuice:copilot-cli BEGIN");
    expect(snippet).toContain("tokenjuice:copilot-cli END");
    expect(snippet).toContain("tokenjuice wrap --raw --");
    expect(snippet).toContain("authoritative");
  });
});
