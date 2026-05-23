import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorDevinHook,
  doctorInstalledHooks,
  installDevinHook,
  runDevinPreToolUseHook,
  uninstallDevinHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const envKeys = [
  "AIDER_PROJECT_DIR",
  "AMAZON_Q_PROJECT_DIR",
  "AMP_PROJECT_DIR",
  "ANTIGRAVITY_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "AVANTE_PROJECT_DIR",
  "CLINE_HOOKS_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEBUDDY_CONFIG_DIR",
  "CODEX_HOME",
  "CONTINUE_PROJECT_DIR",
  "COPILOT_AGENT_PROJECT_DIR",
  "COPILOT_HOME",
  "CURSOR_HOME",
  "DEVIN_PROJECT_DIR",
  "FACTORY_HOME",
  "GEMINI_HOME",
  "GROK_BUILD_PROJECT_DIR",
  "HOME",
  "JUNIE_PROJECT_DIR",
  "KIMI_HOME",
  "KIMI_SHARE_DIR",
  "KILO_PROJECT_DIR",
  "KIRO_PROJECT_DIR",
  "MISTRAL_VIBE_PROJECT_DIR",
  "OPENCODE_CONFIG_DIR",
  "OPENHANDS_PROJECT_DIR",
  "OPEN_INTERPRETER_PROJECT_DIR",
  "PI_CODING_AGENT_DIR",
  "PLANDEX_PROJECT_DIR",
  "QODER_PROJECT_DIR",
  "QWEN_PROJECT_DIR",
  "ROO_PROJECT_DIR",
  "RULER_PROJECT_DIR",
  "TRAE_PROJECT_DIR",
  "TOKENJUICE_DEVIN_SHELL",
  "WINDSURF_PROJECT_DIR",
  "ZED_PROJECT_DIR",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(async () => {
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
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-devin-test-"));
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

describe("devin hook", () => {
  it("installs a project-local PreToolUse hook in .devin/hooks.v1.json", async () => {
    const projectDir = await createTempDir();

    const result = await installDevinHook(undefined, { projectDir, local: true });
    const parsed = JSON.parse(await readFile(join(projectDir, ".devin", "hooks.v1.json"), "utf8")) as {
      PreToolUse: Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>;
    };

    expect(result.hooksPath).toBe(join(projectDir, ".devin", "hooks.v1.json"));
    expect(result.backupPath).toBeUndefined();
    expect(parsed.PreToolUse).toHaveLength(1);
    expect(parsed.PreToolUse[0]?.matcher).toBe("exec");
    expect(parsed.PreToolUse[0]?.hooks[0]?.type).toBe("command");
    expect(parsed.PreToolUse[0]?.hooks[0]?.command).toContain("devin-pre-tool-use");
    expect(parsed.PreToolUse[0]?.hooks[0]?.command).toContain("--wrap-launcher");
    expect(parsed.PreToolUse[0]?.hooks[0]?.timeout).toBe(10);
  });

  it("preserves unrelated Devin hooks and replaces only its own entry", async () => {
    const projectDir = await createTempDir();
    const hooksPath = join(projectDir, ".devin", "hooks.v1.json");
    await installDevinHook(undefined, { projectDir, local: true });
    await writeFile(
      hooksPath,
      `${JSON.stringify({
        PreToolUse: [
          {
            matcher: "edit",
            hooks: [{ type: "command", command: "./scripts/check-edit.sh", timeout: 5 }],
          },
          {
            matcher: "exec",
            hooks: [{ type: "command", command: "tokenjuice devin-pre-tool-use --old", timeout: 1 }],
          },
        ],
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "./scripts/setup.sh" }],
          },
        ],
      }, null, 2)}\n`,
      "utf8",
    );

    const result = await installDevinHook(undefined, { projectDir, local: true });
    const parsed = JSON.parse(await readFile(hooksPath, "utf8")) as {
      PreToolUse: Array<{ matcher?: string; hooks: Array<{ command: string; timeout?: number }> }>;
      SessionStart: unknown[];
    };

    expect(result.backupPath).toBe(`${hooksPath}.bak`);
    expect(parsed.SessionStart).toHaveLength(1);
    expect(parsed.PreToolUse).toHaveLength(2);
    expect(parsed.PreToolUse[0]?.matcher).toBe("edit");
    expect(parsed.PreToolUse[1]?.matcher).toBe("exec");
    expect(parsed.PreToolUse[1]?.hooks[0]?.command).toContain("devin-pre-tool-use");
    expect(parsed.PreToolUse[1]?.hooks[0]?.command).not.toContain("--old");
    expect(parsed.PreToolUse[1]?.hooks[0]?.timeout).toBe(10);
  });

  it("reports installed and uninstalled hook health", async () => {
    const projectDir = await createTempDir();

    await installDevinHook(undefined, { projectDir, local: true });
    const installed = await doctorDevinHook(undefined, { projectDir, local: true });

    expect(installed.status).toBe("ok");
    expect(installed.advisories[0]).toContain("PreToolUse exec");

    const removed = await uninstallDevinHook(undefined, { projectDir });
    const disabled = await doctorDevinHook(undefined, { projectDir, local: true });

    expect(removed.removed).toBe(1);
    expect(removed.deletedFile).toBe(true);
    expect(disabled.status).toBe("disabled");
  });

  it("uses DEVIN_PROJECT_DIR for the default hooks path", async () => {
    const projectDir = await createTempDir();
    process.env.DEVIN_PROJECT_DIR = projectDir;

    const installed = await installDevinHook(undefined, { local: true });
    const doctor = await doctorDevinHook(undefined, { local: true });

    expect(installed.hooksPath).toBe(join(projectDir, ".devin", "hooks.v1.json"));
    expect(doctor.hooksPath).toBe(join(projectDir, ".devin", "hooks.v1.json"));
    expect(doctor.status).toBe("ok");
  });

  it("rewrites Devin exec commands through tokenjuice wrap", async () => {
    process.env.TOKENJUICE_DEVIN_SHELL = "sh";
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "exec",
      tool_input: {
        command: "pnpm test",
        shell_id: "main",
      },
    });

    const result = await captureStdout(async () => await runDevinPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));
    const parsed = JSON.parse(result.output) as {
      hookSpecificOutput: {
        hookEventName: string;
        updatedInput: {
          command: string;
          shell_id: string;
        };
      };
    };

    expect(result.code).toBe(0);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(parsed.hookSpecificOutput.updatedInput.shell_id).toBe("main");
    expect(parsed.hookSpecificOutput.updatedInput.command).toContain("/usr/local/bin/tokenjuice wrap --source devin --");
    expect(parsed.hookSpecificOutput.updatedInput.command).toContain(" -lc 'pnpm test'");
  });

  it("does not double-wrap commands that already use tokenjuice wrap", async () => {
    process.env.TOKENJUICE_DEVIN_SHELL = "sh";
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "exec",
      tool_input: {
        command: "tokenjuice wrap -- pnpm test",
      },
    });

    const result = await captureStdout(async () => await runDevinPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));

    expect(result.code).toBe(0);
    expect(result.output).toBe("");
  });

  it("leaves state-mutating Devin shell commands in the host session", async () => {
    process.env.TOKENJUICE_DEVIN_SHELL = "sh";
    const commands = [
      "cd packages/cli",
      "export NODE_ENV=test",
      "source .venv/bin/activate",
      "nvm use",
      "set -e",
      "cd packages/cli && export NODE_ENV=test",
    ];

    for (const command of commands) {
      const payload = JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "exec",
        tool_input: { command, shell_id: "main" },
      });

      const result = await captureStdout(async () => await runDevinPreToolUseHook(payload, "/usr/local/bin/tokenjuice"));

      expect(result.code).toBe(0);
      expect(result.output).toBe("");
    }
  });

  it("is included in aggregate hook doctor output", async () => {
    const projectDir = await createTempDir();
    for (const key of envKeys) {
      process.env[key] = projectDir;
    }
    await installDevinHook(undefined, { projectDir, local: true });

    const report = await doctorInstalledHooks({ projectDir, local: true });

    expect(report.integrations.devin.hooksPath).toBe(join(projectDir, ".devin", "hooks.v1.json"));
    expect(report.integrations.devin.status).toBe("ok");
  });
});
