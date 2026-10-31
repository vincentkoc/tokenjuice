import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
const originalStats = process.env.TOKENJUICE_STATS;
beforeEach(() => { process.env.TOKENJUICE_STATS = "off"; });

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
  if (originalStats === undefined) delete process.env.TOKENJUICE_STATS;
  else process.env.TOKENJUICE_STATS = originalStats;
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
  it("writes a postToolUse bash entry at the given path", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    process.env.PATH = "";

    const result = await installCopilotCliHook(hooksPath);
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      version?: number;
      hooks: { postToolUse: Array<{ command: string; matcher?: string; type?: string; timeoutSec?: number }> };
    };

    expect(result.hooksPath).toBe(hooksPath);
    expect(parsed.version).toBe(1);
    expect(parsed.hooks.postToolUse).toHaveLength(1);
    expect(parsed.hooks.postToolUse[0]?.matcher).toBe("bash");
    expect(parsed.hooks.postToolUse[0]?.type).toBe("command");
    expect(parsed.hooks.postToolUse[0]?.command).toContain("copilot-cli-post-tool-use");
    expect(parsed.hooks.postToolUse[0]?.timeoutSec).toBe(10);
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

  it("warns about the inactive shell matcher and migrates it on reinstall", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, "hooks", "tokenjuice-cli.json");
    const launcher = join(home, "tokenjuice");
    process.env.PATH = "";
    await writeFile(launcher, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const options = { local: true, binaryPath: launcher };
    await installCopilotCliHook(hooksPath, options);
    const config = JSON.parse(await readFile(hooksPath, "utf8"));
    config.hooks.postToolUse[0].matcher = "shell";
    await writeFile(hooksPath, JSON.stringify(config));
    const report = await doctorCopilotCliHook(hooksPath, options);
    expect(report.status).toBe("warn");
    expect(report.issues).toEqual([
      "configured copilot-cli tokenjuice hook matcher is stale; run tokenjuice install copilot-cli --local to match the bash tool",
    ]);
    await installCopilotCliHook(hooksPath, options);
    expect((await doctorCopilotCliHook(hooksPath, options)).status).toBe("ok");
    expect(JSON.parse(await readFile(hooksPath, "utf8")).hooks.postToolUse).toHaveLength(1);
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

  it("warns when the tokenjuice copilot-cli hook is missing the timeout safety cap", async () => {
    const home = await createTempDir();
    const hooksPath = join(home, ".copilot", "hooks", "tokenjuice-cli.json");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await mkdir(join(home, ".copilot", "hooks"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          postToolUse: [
            { type: "command", matcher: "shell", command: `${launcherPath} copilot-cli-post-tool-use` },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCopilotCliHook(hooksPath);

    expect(report.status).toBe("warn");
    expect(report.issues).toContain(
      "configured copilot-cli tokenjuice hook timeout is missing or stale; run tokenjuice install copilot-cli to add the 10s safety cap",
    );
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
  const longOutput = ["On branch main", "Changes not staged for commit:",
    ...Array.from({ length: 120 }, (_, i) => `  modified: src/file-${i}.ts`)].join("\n");
  const payload = (footer = "\n<shellId: 0 completed with exit code 0>") => ({
    toolName: "bash", toolArgs: { command: "git status" },
    toolResult: { resultType: "success", textResultForLlm: longOutput + footer, metadata: { retained: true } },
  });

  it.each(["camelCase", "snake_case"])("rewrites documented %s input with canonical output and an unchanged status footer", async (format) => {
    const input = payload();
    const wire = format === "camelCase" ? input : {
      hook_event_name: "PostToolUse", tool_name: input.toolName, tool_input: input.toolArgs,
      tool_result: { result_type: "success", text_result_for_llm: input.toolResult.textResultForLlm, metadata: input.toolResult.metadata },
    };
    const { code, output } = await captureStdout(() => runCopilotCliPostToolUseHook(JSON.stringify(wire)));
    expect(code).toBe(0);
    const { modifiedResult } = JSON.parse(output);
    expect(modifiedResult.resultType).toBe("success");
    expect(modifiedResult.textResultForLlm.length).toBeLessThan(input.toolResult.textResultForLlm.length);
    expect(modifiedResult.textResultForLlm).toContain("lines omitted");
    expect(modifiedResult.textResultForLlm).toMatch(/\n<shellId: 0 completed with exit code 0>$/u);
    expect(modifiedResult.metadata).toEqual({ retained: true });
  });

  it("preserves the earlier completed-status format", async () => {
    const { output } = await captureStdout(() => runCopilotCliPostToolUseHook(JSON.stringify(payload("\n<exited with exit code 0>"))));
    expect(JSON.parse(output).modifiedResult.textResultForLlm).toMatch(/\n<exited with exit code 0>$/u);
  });

  it.each(["\n<shellId: 0 completed with exit code 7>", "\n<exited with exit code 1>",
    "\n<shellId: 0 running>", "", "\n<shellId: 0 completed with exit code 0>\nunknown",
  ])("keeps nonzero or unproven shell completion: %j", async (footer) => {
    const { output } = await captureStdout(() => runCopilotCliPostToolUseHook(JSON.stringify(payload(footer))));
    expect(output).toBe("{}\n");
  });

  it.each(["tokenjuice wrap --raw -- git status", "cd /repo && tokenjuice wrap --raw -- git status",
    "node /opt/tokenjuice/dist/cli/main.js wrap --full -- git status", "cat exact.txt",
  ])("preserves raw wrappers and exact reads: %s", async (command) => {
    const input = payload();
    input.toolArgs.command = command;
    const { output } = await captureStdout(() => runCopilotCliPostToolUseHook(JSON.stringify(input)));
    expect(output).toBe("{}\n");
  });

  it("keeps malformed records, unrelated events/tools, missing status and unsuccessful result types", async () => {
    const input = payload();
    const values = [null, [], "text", 42, { ...input, toolName: "view" },
      { ...input, hook_event_name: "PreToolUse" }, { ...input, toolArgs: {} }, { ...input, toolResult: undefined },
      ...[undefined, "failure", "rejected", "denied"].map(resultType => ({ ...input, toolResult: { ...input.toolResult, resultType } }))];
    for (const value of values) {
      const { output } = await captureStdout(() => runCopilotCliPostToolUseHook(JSON.stringify(value)));
      expect(output).toBe("{}\n");
    }
    expect((await captureStdout(() => runCopilotCliPostToolUseHook("not-json"))).output).toBe("{}\n");
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
