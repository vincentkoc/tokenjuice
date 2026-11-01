import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { doctorClaudeCodeHook, installClaudeCodeHook } from "../../src/hosts/claude-code/index.js";
import { doctorCodeBuddyHook, installCodeBuddyHook } from "../../src/hosts/codebuddy/index.js";
import { doctorCopilotAgentHook, installCopilotAgentHook } from "../../src/hosts/copilot-agent/index.js";
import { doctorCopilotCliHook, installCopilotCliHook } from "../../src/hosts/copilot-cli/index.js";
import { doctorCursorHook, installCursorHook } from "../../src/hosts/cursor/index.js";
import { doctorDevinHook, installDevinHook } from "../../src/hosts/devin/index.js";
import { doctorVscodeCopilotHook, installVscodeCopilotHook } from "../../src/hosts/vscode-copilot/index.js";

const execute = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe.skipIf(process.platform === "win32")("Node hook launcher validation", () => {
  it.each([
    { host: "claude-code", install: installClaudeCodeHook, doctor: doctorClaudeCodeHook },
    { host: "codebuddy", install: installCodeBuddyHook, doctor: doctorCodeBuddyHook },
    { host: "copilot-agent", install: installCopilotAgentHook, doctor: doctorCopilotAgentHook },
    { host: "copilot-cli", install: installCopilotCliHook, doctor: doctorCopilotCliHook },
    { host: "cursor", install: installCursorHook, doctor: doctorCursorHook },
    { host: "devin", install: installDevinHook, doctor: doctorDevinHook },
    { host: "vscode-copilot", install: installVscodeCopilotHook, doctor: doctorVscodeCopilotHook },
  ])("$host rejects JavaScript directories and keeps Node-invoked non-executable files usable", async ({ install, doctor }) => {
    const root = await mkdtemp(join(tmpdir(), "tokenjuice-javascript-hook-"));
    tempDirs.push(root);
    const launcher = join(root, "main.js");
    const directory = join(root, "directory");
    const hooks = join(root, "hooks", "settings.json");
    const options = { local: true, binaryPath: launcher, nodePath: process.execPath, projectDir: root };
    await mkdir(launcher);
    await mkdir(directory);
    const installed = await install(hooks, options);
    expect((await doctor(hooks, options)).status).toBe("broken");
    await rm(launcher, { recursive: true });
    await symlink(directory, launcher, "dir");
    expect((await doctor(hooks, options)).status).toBe("broken");
    await rm(launcher);
    await writeFile(launcher, "process.stdout.write('fixture-hook\\n');\n", { mode: 0o644 });
    expect((await doctor(hooks, options)).status).toBe("ok");
    expect((await execute("/bin/sh", ["-c", installed.command])).stdout).toBe("fixture-hook\n");
  });
});
