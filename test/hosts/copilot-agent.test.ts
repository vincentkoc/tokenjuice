import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorCopilotAgentHook,
  installCopilotAgentHook,
  runCopilotAgentPostToolUseHook,
  uninstallCopilotAgentHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalMaxInline = process.env.TOKENJUICE_COPILOT_AGENT_MAX_INLINE_CHARS;
const originalStore = process.env.TOKENJUICE_COPILOT_AGENT_STORE;
const originalProjectDir = process.env.COPILOT_AGENT_PROJECT_DIR;
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  process.env.PATH = originalPath;
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalMaxInline === undefined) {
    delete process.env.TOKENJUICE_COPILOT_AGENT_MAX_INLINE_CHARS;
  } else {
    process.env.TOKENJUICE_COPILOT_AGENT_MAX_INLINE_CHARS = originalMaxInline;
  }
  if (originalStore === undefined) {
    delete process.env.TOKENJUICE_COPILOT_AGENT_STORE;
  } else {
    process.env.TOKENJUICE_COPILOT_AGENT_STORE = originalStore;
  }
  if (originalProjectDir === undefined) {
    delete process.env.COPILOT_AGENT_PROJECT_DIR;
  } else {
    process.env.COPILOT_AGENT_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-copilot-agent-test-"));
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

describe("installCopilotAgentHook", () => {
  it("writes a repo-level postToolUse bash entry", async () => {
    const projectDir = await createTempDir();
    const hooksPath = join(projectDir, ".github", "hooks", "tokenjuice-agent.json");
    process.env.PATH = "";

    const result = await installCopilotAgentHook(undefined, {
      projectDir,
      binaryPath: join(projectDir, "bin", "tokenjuice"),
    });
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      version?: number;
      hooks: { postToolUse: Array<{ bash?: string; command?: string; matcher?: string; type?: string; timeoutSec?: number }> };
    };

    expect(result.hooksPath).toBe(hooksPath);
    expect(parsed.version).toBe(1);
    expect(parsed.hooks.postToolUse).toHaveLength(1);
    expect(parsed.hooks.postToolUse[0]).not.toHaveProperty("matcher");
    expect(parsed.hooks.postToolUse[0]?.type).toBe("command");
    expect(parsed.hooks.postToolUse[0]?.bash).toContain("copilot-agent-post-tool-use");
    expect(parsed.hooks.postToolUse[0]?.command).toBe(parsed.hooks.postToolUse[0]?.bash);
    expect(parsed.hooks.postToolUse[0]?.timeoutSec).toBe(10);
  });

  it("is idempotent and preserves unrelated hook entries", async () => {
    const projectDir = await createTempDir();
    const hooksPath = join(projectDir, ".github", "hooks", "tokenjuice-agent.json");
    process.env.PATH = "";
    await mkdir(join(projectDir, ".github", "hooks"), { recursive: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        customKey: true,
        hooks: {
          preToolUse: [{ type: "command", matcher: "bash", bash: "echo pre" }],
          postToolUse: [{ type: "command", matcher: "bash", bash: "echo post" }],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const options = { projectDir, binaryPath: join(projectDir, "bin", "tokenjuice") };
    await installCopilotAgentHook(undefined, options);
    const first = await readFile(hooksPath, "utf8");
    await installCopilotAgentHook(undefined, options);
    const second = await readFile(hooksPath, "utf8");

    expect(second).toBe(first);
    const parsed = JSON.parse(second) as {
      customKey?: boolean;
      hooks: {
        preToolUse: Array<{ bash: string }>;
        postToolUse: Array<{ bash: string }>;
      };
    };
    expect(parsed.customKey).toBe(true);
    expect(parsed.hooks.preToolUse[0]?.bash).toBe("echo pre");
    expect(parsed.hooks.postToolUse).toHaveLength(2);
    expect(parsed.hooks.postToolUse.find((entry) => entry.bash === "echo post")).toBeTruthy();
    expect(parsed.hooks.postToolUse.find((entry) => entry.bash.includes("copilot-agent-post-tool-use"))).toBeTruthy();
  });

  it("enables hooks when reinstalling into a disabled configuration", async () => {
    const projectDir = await createTempDir();
    const hooksPath = join(projectDir, ".github", "hooks", "tokenjuice-agent.json");
    await mkdir(join(projectDir, ".github", "hooks"), { recursive: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({ version: 1, disableAllHooks: true, hooks: {} }, null, 2)}\n`,
      "utf8",
    );

    await installCopilotAgentHook(undefined, { projectDir });
    const config = JSON.parse(await readFile(hooksPath, "utf8")) as { disableAllHooks?: boolean };

    expect(config.disableAllHooks).toBe(false);
  });

  it("removes stale tokenjuice entries from sibling repo hook files", async () => {
    const projectDir = await createTempDir();
    const hooksDir = join(projectDir, ".github", "hooks");
    const strayPath = join(hooksDir, "stray.json");
    process.env.PATH = "";
    await mkdir(hooksDir, { recursive: true });
    await writeFile(
      strayPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          postToolUse: [
            { type: "command", bash: "tokenjuice copilot-agent-post-tool-use" },
            { type: "command", bash: "echo keep" },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    await installCopilotAgentHook(undefined, {
      projectDir,
      binaryPath: join(projectDir, "bin", "tokenjuice"),
    });
    const stray = JSON.parse(await readFile(strayPath, "utf8")) as { hooks: { postToolUse: Array<{ bash: string }> } };

    expect(stray.hooks.postToolUse).toEqual([{ type: "command", bash: "echo keep" }]);
  });

  it("removes stale tokenjuice entries from other canonical hook buckets", async () => {
    const projectDir = await createTempDir();
    const hooksPath = join(projectDir, ".github", "hooks", "tokenjuice-agent.json");
    process.env.PATH = "";
    await mkdir(join(projectDir, ".github", "hooks"), { recursive: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [
            { type: "command", bash: "tokenjuice copilot-agent-post-tool-use" },
            { type: "command", bash: "echo keep" },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    await installCopilotAgentHook(undefined, {
      projectDir,
      binaryPath: join(projectDir, "bin", "tokenjuice"),
    });
    const config = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: {
        preToolUse: Array<{ bash: string }>;
        postToolUse: Array<{ bash: string }>;
      };
    };

    expect(config.hooks.preToolUse).toEqual([{ type: "command", bash: "echo keep" }]);
    expect(config.hooks.postToolUse).toHaveLength(1);
    expect(config.hooks.postToolUse[0]?.bash).toContain("copilot-agent-post-tool-use");
  });

  it("defaults to the repository root when run from a nested directory", async () => {
    const projectDir = await createTempDir();
    const nestedDir = join(projectDir, "packages", "cli");
    process.env.PATH = "";
    await mkdir(join(projectDir, ".git"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const result = await installCopilotAgentHook(undefined, {
      binaryPath: join(projectDir, "bin", "tokenjuice"),
    });

    expect(result.hooksPath).toBe(join(await realpath(projectDir), ".github", "hooks", "tokenjuice-agent.json"));
  });

  it("fails clearly when default install is run outside a git repository", async () => {
    const dir = await createTempDir();
    process.chdir(dir);

    await expect(installCopilotAgentHook()).rejects.toThrow(/inside a git repository/u);
  });
});

describe("uninstallCopilotAgentHook", () => {
  it("removes only the tokenjuice entry and preserves siblings", async () => {
    const projectDir = await createTempDir();
    const hooksPath = join(projectDir, ".github", "hooks", "tokenjuice-agent.json");
    process.env.PATH = "";
    await installCopilotAgentHook(undefined, { projectDir, binaryPath: join(projectDir, "bin", "tokenjuice") });

    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as { hooks: { postToolUse: unknown[] } };
    parsed.hooks.postToolUse.unshift({ type: "command", matcher: "bash", bash: "echo keep" });
    await writeFile(hooksPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    const result = await uninstallCopilotAgentHook(hooksPath);
    const after = JSON.parse(await readFile(hooksPath, "utf8")) as { hooks: { postToolUse: Array<{ bash: string }> } };

    expect(result.removed).toBe(1);
    expect(result.deletedFile).toBe(false);
    expect(after.hooks.postToolUse).toHaveLength(1);
    expect(after.hooks.postToolUse[0]?.bash).toBe("echo keep");
  });

  it("deletes an empty tokenjuice-only file", async () => {
    const projectDir = await createTempDir();
    const hooksPath = join(projectDir, ".github", "hooks", "tokenjuice-agent.json");
    process.env.PATH = "";
    await installCopilotAgentHook(undefined, { projectDir, binaryPath: join(projectDir, "bin", "tokenjuice") });

    const result = await uninstallCopilotAgentHook(hooksPath);

    expect(result.removed).toBe(1);
    expect(result.deletedFile).toBe(true);
    await expect(readFile(hooksPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes tokenjuice entries from sibling repo hook files", async () => {
    const projectDir = await createTempDir();
    const hooksDir = join(projectDir, ".github", "hooks");
    const hooksPath = join(hooksDir, "tokenjuice-agent.json");
    const strayPath = join(hooksDir, "stray.json");
    await mkdir(hooksDir, { recursive: true });
    await writeFile(
      strayPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          postToolUse: [
            { type: "command", bash: "tokenjuice copilot-agent-post-tool-use" },
            { type: "command", bash: "echo keep" },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const result = await uninstallCopilotAgentHook(hooksPath);
    const after = JSON.parse(await readFile(strayPath, "utf8")) as { hooks: { postToolUse: Array<{ bash: string }> } };

    expect(result.removed).toBe(1);
    expect(result.deletedFile).toBe(false);
    expect(after.hooks.postToolUse).toEqual([{ type: "command", bash: "echo keep" }]);
  });
});

describe("doctorCopilotAgentHook", () => {
  it("reports disabled when the repo hook file is absent", async () => {
    const projectDir = await createTempDir();
    const report = await doctorCopilotAgentHook(undefined, { projectDir, binaryPath: join(projectDir, "bin", "tokenjuice") });

    expect(report.status).toBe("disabled");
    expect(report.hooksPath).toBe(join(projectDir, ".github", "hooks", "tokenjuice-agent.json"));
  });

  it("reports ok for a matching installed hook", async () => {
    const projectDir = await createTempDir();
    const binaryPath = join(projectDir, "bin", "tokenjuice");
    process.env.PATH = "";
    await mkdir(join(projectDir, "bin"), { recursive: true });
    await writeFile(binaryPath, "#!/bin/sh\n", { encoding: "utf8", mode: 0o755 });
    await installCopilotAgentHook(undefined, { projectDir, binaryPath });

    const report = await doctorCopilotAgentHook(undefined, { projectDir, binaryPath });

    expect(report.status).toBe("ok");
    expect(report.detectedCommand).toContain("copilot-agent-post-tool-use");
    expect(report.issues).toEqual([]);
  });

  it("honors projectDir through aggregate hook doctor", async () => {
    const projectDir = await createTempDir();
    const home = await createTempDir();
    process.env.HOME = home;
    process.env.PATH = "";
    await installCopilotAgentHook(undefined, { projectDir });

    const report = await doctorInstalledHooks({ projectDir });

    expect(report.integrations["copilot-agent"].status).toBe("ok");
    expect(report.integrations["copilot-agent"].hooksPath).toBe(join(projectDir, ".github", "hooks", "tokenjuice-agent.json"));
  });

  it("reports broken when the configured repo hook file disables all hooks", async () => {
    const projectDir = await createTempDir();
    const binaryPath = join(projectDir, "bin", "tokenjuice");
    process.env.PATH = "";
    await mkdir(join(projectDir, "bin"), { recursive: true });
    await writeFile(binaryPath, "#!/bin/sh\n", { encoding: "utf8", mode: 0o755 });
    await installCopilotAgentHook(undefined, { projectDir, binaryPath });

    const hooksPath = join(projectDir, ".github", "hooks", "tokenjuice-agent.json");
    const config = JSON.parse(await readFile(hooksPath, "utf8")) as Record<string, unknown>;
    config.disableAllHooks = true;
    await writeFile(hooksPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const report = await doctorCopilotAgentHook(undefined, { projectDir, binaryPath });

    expect(report.status).toBe("broken");
    expect(report.issues).toContain("copilot-agent hook file sets disableAllHooks: true; configured hooks will not run");
  });

  it("reports misplaced canonical tokenjuice hooks", async () => {
    const projectDir = await createTempDir();
    const binaryPath = join(projectDir, "bin", "tokenjuice");
    const hooksPath = join(projectDir, ".github", "hooks", "tokenjuice-agent.json");
    process.env.PATH = "";
    await mkdir(join(projectDir, ".github", "hooks"), { recursive: true });
    await mkdir(join(projectDir, "bin"), { recursive: true });
    await writeFile(binaryPath, "#!/bin/sh\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [
            { type: "command", bash: "tokenjuice copilot-agent-post-tool-use" },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCopilotAgentHook(undefined, { projectDir, binaryPath });

    expect(report.status).toBe("warn");
    expect(report.detectedCommand).toContain("copilot-agent-post-tool-use");
    expect(report.issues.some((issue) => issue.includes("outside postToolUse in preToolUse"))).toBe(true);
  });

  it("reports stray tokenjuice entries in sibling repo hook files", async () => {
    const projectDir = await createTempDir();
    const binaryPath = join(projectDir, "bin", "tokenjuice");
    const hooksDir = join(projectDir, ".github", "hooks");
    const strayPath = join(hooksDir, "stray.json");
    process.env.PATH = "";
    await mkdir(join(projectDir, "bin"), { recursive: true });
    await writeFile(binaryPath, "#!/bin/sh\n", { encoding: "utf8", mode: 0o755 });
    await installCopilotAgentHook(undefined, { projectDir, binaryPath });
    await writeFile(
      strayPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          postToolUse: [
            { type: "command", bash: "tokenjuice copilot-agent-post-tool-use" },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCopilotAgentHook(undefined, { projectDir, binaryPath });

    expect(report.status).toBe("warn");
    expect(report.issues.some((issue) => issue.includes(strayPath))).toBe(true);
  });

  it("reports active sibling hooks when the canonical repo hook file is absent", async () => {
    const projectDir = await createTempDir();
    const home = await createTempDir();
    const binaryPath = join(projectDir, "bin", "tokenjuice");
    const hooksDir = join(projectDir, ".github", "hooks");
    const strayPath = join(hooksDir, "stray.json");
    process.env.HOME = home;
    process.env.PATH = "";
    await mkdir(join(projectDir, "bin"), { recursive: true });
    await mkdir(hooksDir, { recursive: true });
    await writeFile(binaryPath, "#!/bin/sh\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(
      strayPath,
      `${JSON.stringify({
        version: 1,
        hooks: {
          postToolUse: [
            { type: "command", bash: "tokenjuice copilot-agent-post-tool-use" },
          ],
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = await doctorCopilotAgentHook(undefined, { projectDir, binaryPath });
    const aggregateReport = await doctorInstalledHooks({ projectDir, binaryPath });

    expect(report.status).toBe("warn");
    expect(report.detectedCommand).toContain("copilot-agent-post-tool-use");
    expect(report.issues.some((issue) => issue.includes(strayPath))).toBe(true);
    expect(aggregateReport.status).toBe("warn");
    expect(aggregateReport.integrations["copilot-agent"].status).toBe("warn");
  });
});

describe("runCopilotAgentPostToolUseHook", () => {
  it("rewrites compactable camelCase bash output into modifiedResult", async () => {
    const longOutput = Array.from({ length: 120 }, (_, i) => `src/file-${i}.ts`).join("\n");
    const payload = JSON.stringify({
      sessionId: "abc",
      timestamp: 1700000000000,
      cwd: "/tmp/repo",
      toolName: "bash",
      toolArgs: { command: "git ls-files" },
      toolResult: {
        resultType: "success",
        textResultForLlm: longOutput,
      },
    });

    const { code, output } = await captureStdout(() => runCopilotAgentPostToolUseHook(payload));

    expect(code).toBe(0);
    const response = JSON.parse(output) as { modifiedResult?: { resultType?: string; textResultForLlm?: string } };
    expect(response.modifiedResult?.resultType).toBe("success");
    const compacted = response.modifiedResult?.textResultForLlm ?? "";
    expect(compacted.length).toBeGreaterThan(0);
    expect(compacted.length).toBeLessThan(longOutput.length);
  });

  it("accepts VS Code-compatible snake_case payloads and JSON-string tool args", async () => {
    const longOutput = Array.from({ length: 120 }, (_, i) => `src/file-${i}.ts`).join("\n");
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "bash",
      tool_input: JSON.stringify({ command: "git ls-files" }),
      tool_result: {
        result_type: "success",
        text_result_for_llm: longOutput,
      },
    });

    const { code, output } = await captureStdout(() => runCopilotAgentPostToolUseHook(payload));

    expect(code).toBe(0);
    const response = JSON.parse(output) as {
      modifiedResult?: {
        textResultForLlm?: string;
        text_result_for_llm?: string;
      };
    };
    expect(response.modifiedResult?.textResultForLlm).toBeTruthy();
    expect(response.modifiedResult?.text_result_for_llm).toBe(response.modifiedResult?.textResultForLlm);
    expect(response.modifiedResult?.text_result_for_llm?.length).toBeLessThan(longOutput.length);
  });

  it("emits {} for failed, malformed, raw-bypass, and non-bash payloads", async () => {
    const noisy = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const cases = [
      "not-json",
      JSON.stringify({
        toolName: "view",
        toolArgs: { command: "git ls-files" },
        toolResult: { resultType: "success", textResultForLlm: noisy },
      }),
      JSON.stringify({
        toolName: "bash",
        toolArgs: { command: "exit 1" },
        toolResult: { resultType: "failure", textResultForLlm: noisy },
      }),
      JSON.stringify({
        toolName: "bash",
        toolArgs: { command: "tokenjuice wrap --raw -- cat large.log" },
        toolResult: { resultType: "success", textResultForLlm: noisy },
      }),
    ];

    for (const payload of cases) {
      const { code, output } = await captureStdout(() => runCopilotAgentPostToolUseHook(payload));
      expect(code).toBe(0);
      expect(output.trim()).toBe("{}");
    }
  });

  it("honors explicit full bypasses after leading cd prefixes", async () => {
    const noisy = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const payload = JSON.stringify({
      toolName: "bash",
      toolArgs: { command: "cd /repo && tokenjuice wrap --full -- cat large.log" },
      toolResult: { resultType: "success", textResultForLlm: noisy },
    });

    const { code, output } = await captureStdout(() => runCopilotAgentPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("honors absolute tokenjuice raw bypass commands", async () => {
    const noisy = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const payload = JSON.stringify({
      toolName: "bash",
      toolArgs: { command: "/usr/local/bin/tokenjuice wrap --raw -- cat large.log" },
      toolResult: { resultType: "success", textResultForLlm: noisy },
    });

    const { code, output } = await captureStdout(() => runCopilotAgentPostToolUseHook(payload));

    expect(code).toBe(0);
    expect(output.trim()).toBe("{}");
  });

  it("honors env-prefixed tokenjuice raw and full bypass commands", async () => {
    const noisy = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const cases = [
      "FOO=1 tokenjuice wrap --raw -- cat large.log",
      "env FOO=1 tokenjuice wrap --full -- cat large.log",
    ];

    for (const command of cases) {
      const payload = JSON.stringify({
        toolName: "bash",
        toolArgs: { command },
        toolResult: { resultType: "success", textResultForLlm: noisy },
      });
      const { code, output } = await captureStdout(() => runCopilotAgentPostToolUseHook(payload));

      expect(code).toBe(0);
      expect(output.trim()).toBe("{}");
    }
  });

  it("does not treat inner command flags as a raw bypass without the wrap separator", async () => {
    const noisy = Array.from({ length: 200 }, (_, i) => `diff line ${i}`).join("\n");
    const payload = JSON.stringify({
      toolName: "bash",
      toolArgs: { command: "tokenjuice wrap git diff --raw" },
      toolResult: { resultType: "success", textResultForLlm: noisy },
    });

    const { code, output } = await captureStdout(() => runCopilotAgentPostToolUseHook(payload));
    const response = JSON.parse(output) as { modifiedResult?: { textResultForLlm?: string } };

    expect(code).toBe(0);
    expect(response.modifiedResult?.textResultForLlm).toContain("diff line");
  });
});
