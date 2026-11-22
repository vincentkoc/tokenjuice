import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { doctorCopilotCliHook, installCopilotCliHook } from "../../src/hosts/copilot-cli/index.js";
import { doctorCursorHook, installCursorHook } from "../../src/hosts/cursor/index.js";
import { doctorVscodeCopilotHook, installVscodeCopilotHook } from "../../src/hosts/vscode-copilot/index.js";

const execute = promisify(execFile);
const originalPath = process.env.PATH;
const tempDirs: string[] = [];

afterEach(async () => {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  await Promise.all(tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe.skipIf(process.platform === "win32")("POSIX hook launcher discovery", () => {
  it.each([
    { host: "cursor", install: installCursorHook, doctor: doctorCursorHook, subcommand: "cursor-pre-tool-use" },
    { host: "copilot-cli", install: installCopilotCliHook, doctor: doctorCopilotCliHook, subcommand: "copilot-cli-post-tool-use" },
    { host: "vscode-copilot", install: installVscodeCopilotHook, doctor: doctorVscodeCopilotHook, subcommand: "vscode-copilot-pre-tool-use" },
  ])("$host skips directories on PATH and installs a runnable symlink launcher", async ({ install, doctor, subcommand }) => {
    const root = await mkdtemp(join(tmpdir(), "tokenjuice-launcher-test-"));
    tempDirs.push(root);
    const shadow = join(root, "shadow");
    const bin = join(root, "bin");
    const launcher = join(bin, "tokenjuice");
    const target = join(root, "launcher");
    await mkdir(join(shadow, "tokenjuice"), { recursive: true });
    await mkdir(bin);
    await writeFile(target, '#!/bin/sh\nprintf "%s\\n" "$1"\n', { mode: 0o755 });
    await symlink(target, launcher);
    process.env.PATH = `${shadow}${delimiter}${bin}`;

    const hooksPath = join(root, "hooks.json");
    const installed = await install(hooksPath, { binaryPath: join(root, "missing-fallback") });
    expect((await execute("/bin/sh", ["-c", installed.command])).stdout).toBe(`${subcommand}\n`);
    expect((await doctor(hooksPath, { binaryPath: join(root, "missing-fallback") })).status).toBe("ok");

    // A configured launcher can become a directory after installation.
    await rm(launcher);
    await mkdir(launcher);
    const report = await doctor(hooksPath, { local: true, binaryPath: launcher });
    expect(report.status).toBe("broken");
    expect(report.missingPaths).toContain(launcher);
  });
});
