import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorCommandCodeHook,
  installCommandCodeHook,
  runCommandCodePostToolUseHook,
  uninstallCommandCodeHook,
} from "../../src/index.js";

const tempDirs: string[] = [];
const originalCommandCodeHome = process.env.COMMANDCODE_HOME;
const originalCommandCodeProjectDir = process.env.COMMANDCODE_PROJECT_DIR;

afterEach(async () => {
  if (originalCommandCodeHome === undefined) {
    delete process.env.COMMANDCODE_HOME;
  } else {
    process.env.COMMANDCODE_HOME = originalCommandCodeHome;
  }
  if (originalCommandCodeProjectDir === undefined) {
    delete process.env.COMMANDCODE_PROJECT_DIR;
  } else {
    process.env.COMMANDCODE_PROJECT_DIR = originalCommandCodeProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-command-code-test-"));
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

describe("Command Code hooks", () => {
  it("installs a PostToolUse hook into user settings", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, ".commandcode", "settings.json");
    const launcherPath = join(home, "bin", "tokenjuice");
    await mkdir(join(home, ".commandcode"), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      permissions: { mode: "standard" },
      hooks: {
        PreToolUse: [
          {
            matcher: "read",
            hooks: [{ type: "command", command: "other-hook" }],
          },
        ],
      },
    }));

    const result = await installCommandCodeHook(settingsPath, { binaryPath: launcherPath, local: true });
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      permissions: { mode: string };
      hooks: {
        PreToolUse: unknown[];
        PostToolUse: Array<{ matcher: string; hooks: Array<{ command: string; type?: string; timeout?: number }> }>;
      };
    };

    await expect(access(`${settingsPath}.bak`)).resolves.toBeUndefined();
    expect(result.settingsPath).toBe(settingsPath);
    expect(result.command).toBe(`${launcherPath} command-code-post-tool-use`);
    expect(result.backupPath).toBe(`${settingsPath}.bak`);
    expect(parsed.permissions.mode).toBe("standard");
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse[0]?.matcher).toBe("shell");
    expect(parsed.hooks.PostToolUse[0]?.hooks[0]?.type).toBe("command");
    expect(parsed.hooks.PostToolUse[0]?.hooks[0]?.timeout).toBe(10);
    expect(parsed.hooks.PostToolUse[0]?.hooks[0]?.command).toBe(`${launcherPath} command-code-post-tool-use`);
  });

  it("backs up existing settings without clobbering older backups or tmp sidecars", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, ".commandcode", "settings.json");
    await mkdir(join(home, ".commandcode"), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ hooks: {}, theme: "dark" }), "utf8");
    await writeFile(`${settingsPath}.bak`, "{\"older\":true}\n", "utf8");
    await writeFile(`${settingsPath}.tmp`, "do not touch\n", "utf8");

    const result = await installCommandCodeHook(settingsPath, { local: true });

    expect(result.backupPath).toBe(`${settingsPath}.bak.1`);
    await expect(readFile(`${settingsPath}.bak`, "utf8")).resolves.toBe("{\"older\":true}\n");
    await expect(readFile(`${settingsPath}.bak.1`, "utf8")).resolves.toBe(JSON.stringify({ hooks: {}, theme: "dark" }));
    await expect(readFile(`${settingsPath}.tmp`, "utf8")).resolves.toBe("do not touch\n");
  });

  it("reports installed and uninstalled hook health", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, ".commandcode", "settings.json");
    const launcherPath = join(home, "tokenjuice");
    await mkdir(join(home, ".commandcode"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    await installCommandCodeHook(settingsPath, { binaryPath: launcherPath, local: true });
    const installed = await doctorCommandCodeHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(installed.status).toBe("ok");
    expect(installed.fixCommand).toBe("tokenjuice install command-code --local");
    expect(installed.detectedCommand).toBe(`${launcherPath} command-code-post-tool-use`);
    expect(installed.advisories[0]).toContain("beta");

    const removed = await uninstallCommandCodeHook(settingsPath);
    const disabled = await doctorCommandCodeHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(removed.removed).toBe(1);
    expect(disabled.status).toBe("disabled");
  });

  it("reports tokenjuice hooks with the wrong matcher or type as broken", async () => {
    const home = await createTempDir();
    const settingsPath = join(home, ".commandcode", "settings.json");
    const launcherPath = join(home, "tokenjuice");
    await mkdir(join(home, ".commandcode"), { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await installCommandCodeHook(settingsPath, { binaryPath: launcherPath, local: true });

    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: {
        PostToolUse: Array<{ matcher: string; hooks: Array<{ type: string }> }>;
      };
    };
    parsed.hooks.PostToolUse[0]!.matcher = "write";
    parsed.hooks.PostToolUse[0]!.hooks[0]!.type = "webhook";
    await writeFile(settingsPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    const doctor = await doctorCommandCodeHook(settingsPath, { binaryPath: launcherPath, local: true });

    expect(doctor.status).toBe("broken");
    expect(doctor.detectedCommand).toBe(`${launcherPath} command-code-post-tool-use`);
    expect(doctor.issues).toContain("configured Command Code hook is not scoped to the shell matcher");
    expect(doctor.issues).toContain("configured Command Code hook entry is not a command hook");
  });

  it("uses COMMANDCODE_HOME for the default user settings file", async () => {
    const home = await createTempDir();
    process.env.COMMANDCODE_HOME = join(home, ".commandcode");

    const installed = await installCommandCodeHook(undefined, { local: true });
    const expectedSettingsPath = join(home, ".commandcode", "settings.json");
    const doctor = await doctorCommandCodeHook(undefined, { local: true });

    expect(installed.settingsPath).toBe(expectedSettingsPath);
    expect(doctor.settingsPath).toBe(expectedSettingsPath);
    expect(doctor.status).toBe("ok");
  });

  it("uses COMMANDCODE_PROJECT_DIR for project settings when provided", async () => {
    const project = await createTempDir();
    process.env.COMMANDCODE_PROJECT_DIR = project;

    const installed = await installCommandCodeHook(undefined, { local: true });
    const expectedSettingsPath = join(project, ".commandcode", "settings.json");

    expect(installed.settingsPath).toBe(expectedSettingsPath);
  });

  it("rejects symlinked COMMANDCODE_PROJECT_DIR before reading or writing settings", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const projectLink = join(home, "project");
    process.env.COMMANDCODE_PROJECT_DIR = projectLink;
    await symlink(outside, projectLink);

    await expect(installCommandCodeHook(undefined, { local: true })).rejects.toThrow(/symlinked project directory/u);
    await expect(uninstallCommandCodeHook(undefined)).rejects.toThrow(/symlinked project directory/u);
    await expect(access(join(outside, ".commandcode", "settings.json"))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorCommandCodeHook(undefined, { local: true });
    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("symlinked project directory");
  });

  it("rejects symlinked settings paths before install, doctor, or uninstall", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const settingsDir = join(home, ".commandcode");
    const settingsPath = join(settingsDir, "settings.json");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(join(outside, "settings.json"), JSON.stringify({ hooks: {} }), "utf8");
    await symlink(join(outside, "settings.json"), settingsPath);

    await expect(installCommandCodeHook(settingsPath, { local: true })).rejects.toThrow(/symlinked settings file/u);
    await expect(uninstallCommandCodeHook(settingsPath)).rejects.toThrow(/symlinked settings file/u);
    await expect(access(`${settingsPath}.bak`)).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = await doctorCommandCodeHook(settingsPath, { local: true });
    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("symlinked settings file");
  });

  it("rejects symlinked settings directories and sidecars before writing", async () => {
    const home = await createTempDir();
    const outside = await createTempDir();
    const linkedSettingsDir = join(home, ".commandcode");
    await mkdir(outside, { recursive: true });
    await symlink(outside, linkedSettingsDir);

    await expect(installCommandCodeHook(join(linkedSettingsDir, "settings.json"), { local: true })).rejects.toThrow(/symlinked settings directory/u);

    await rm(linkedSettingsDir);
    await mkdir(linkedSettingsDir, { recursive: true });
    const settingsPath = join(linkedSettingsDir, "settings.json");
    await writeFile(settingsPath, JSON.stringify({ hooks: {} }), "utf8");
    await writeFile(join(outside, "backup.json"), "outside backup\n", "utf8");
    await symlink(join(outside, "backup.json"), `${settingsPath}.bak`);

    await expect(installCommandCodeHook(settingsPath, { local: true })).rejects.toThrow(/symlinked sidecar/u);
    await expect(readFile(join(outside, "backup.json"), "utf8")).resolves.toBe("outside backup\n");

    await rm(`${settingsPath}.bak`);
    await writeFile(join(outside, "tmp.json"), "outside tmp\n", "utf8");
    await symlink(join(outside, "tmp.json"), `${settingsPath}.tmp`);

    await expect(installCommandCodeHook(settingsPath, { local: true })).rejects.toThrow(/symlinked sidecar/u);
    await expect(readFile(join(outside, "tmp.json"), "utf8")).resolves.toBe("outside tmp\n");
  });

  it("injects compacted context for noisy shell output", async () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "shell_command",
      tool_display_name: "SHELL",
      cwd: "/repo",
      tool_input: {
        command: "git status",
      },
      tool_response: [
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
    });

    const { code, output } = await captureStdout(() => runCommandCodePostToolUseHook(payload));
    const response = JSON.parse(output) as {
      hookSpecificOutput?: {
        hookEventName?: string;
        additionalContext?: string;
      };
    };

    expect(code).toBe(0);
    expect(response.hookSpecificOutput?.hookEventName).toBe("PostToolUse");
    expect(response.hookSpecificOutput?.additionalContext).toContain("Changes not staged:");
    expect(response.hookSpecificOutput?.additionalContext).toContain("M: src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts");
    expect(response.hookSpecificOutput?.additionalContext).not.toContain("and have 8 and 642");
    expect(response.hookSpecificOutput?.additionalContext).toContain("tokenjuice wrap --raw -- <command>");
  });

  it("keeps unrelated and raw-bypass payloads silent", async () => {
    const readPayload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "read_file",
      tool_display_name: "READ",
      tool_input: { absolute_path: "README.md" },
      tool_response: "hello",
    });
    const rawPayload = JSON.stringify({
      hookEventName: "PostToolUse",
      toolName: "shell_command",
      toolDisplayName: "SHELL",
      toolInput: { command: "tokenjuice wrap --raw -- pnpm test" },
      toolResponse: "Changes not staged for commit:\n\tmodified: README.md\n",
    });

    await expect(captureStdout(() => runCommandCodePostToolUseHook(readPayload))).resolves.toEqual({ code: 0, output: "{}\n" });
    await expect(captureStdout(() => runCommandCodePostToolUseHook(rawPayload))).resolves.toEqual({ code: 0, output: "{}\n" });
  });
});
