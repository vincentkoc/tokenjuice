import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildWrapLauncherHookCommand,
  buildWrappedCommand,
  commandAlreadyWrapped,
  isExecutableFile,
  isRecord,
  pathExists,
  resolveHostShell,
  resolveInstalledTokenjuicePath,
  resolveShellPath,
} from "../../../src/hosts/shared/pre-tool-wrap.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = originalPath;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-pre-tool-wrap-test-"));
  tempDirs.push(dir);
  return dir;
}

async function writeExecutable(path: string): Promise<void> {
  await writeFile(path, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
}

describe("isRecord", () => {
  it.each([
    [{}, true],
    [{ a: 1 }, true],
    [[], false],
    [null, false],
    [undefined, false],
    ["string", false],
    [42, false],
  ])("returns %s for %j", (value, expected) => {
    expect(isRecord(value)).toBe(expected);
  });
});

describe("isExecutableFile / pathExists", () => {
  it("isExecutableFile returns true for an executable file", async () => {
    const dir = await createTempDir();
    const exec = join(dir, "runme");
    await writeExecutable(exec);
    expect(await isExecutableFile(exec)).toBe(true);
  });

  it("isExecutableFile returns false for a missing path", async () => {
    const dir = await createTempDir();
    expect(await isExecutableFile(join(dir, "no-such-file"))).toBe(false);
  });

  it("pathExists returns true for a plain file even when not executable", async () => {
    const dir = await createTempDir();
    const file = join(dir, "plain.txt");
    await writeFile(file, "hi", "utf8");
    expect(await pathExists(file)).toBe(true);
    expect(await isExecutableFile(file)).toBe(false);
  });
});

describe("resolveInstalledTokenjuicePath", () => {
  it("returns undefined when PATH is empty", async () => {
    process.env.PATH = "";
    expect(await resolveInstalledTokenjuicePath()).toBeUndefined();
  });

  it("walks PATH and returns the first tokenjuice it finds", async () => {
    const home = await createTempDir();
    const first = join(home, "a");
    const second = join(home, "b");
    await mkdir(first, { recursive: true });
    await mkdir(second, { recursive: true });
    await writeExecutable(join(first, "tokenjuice"));
    await writeExecutable(join(second, "tokenjuice"));
    process.env.PATH = `${first}:${second}`;

    expect(await resolveInstalledTokenjuicePath()).toBe(join(first, "tokenjuice"));
  });

  it("tolerates empty PATH segments", async () => {
    const home = await createTempDir();
    const bin = join(home, "bin");
    await mkdir(bin, { recursive: true });
    await writeExecutable(join(bin, "tokenjuice"));
    process.env.PATH = `:${bin}::`;

    expect(await resolveInstalledTokenjuicePath()).toBe(join(bin, "tokenjuice"));
  });

  it("returns undefined when no tokenjuice is on PATH", async () => {
    const home = await createTempDir();
    const bin = join(home, "bin");
    await mkdir(bin, { recursive: true });
    process.env.PATH = bin;

    expect(await resolveInstalledTokenjuicePath()).toBeUndefined();
  });
});

describe("resolveShellPath", () => {
  it("returns undefined for an empty or whitespace-only candidate", async () => {
    expect(await resolveShellPath("")).toBeUndefined();
    expect(await resolveShellPath("   ")).toBeUndefined();
  });

  it("accepts an absolute path only if it is executable", async () => {
    const dir = await createTempDir();
    const exec = join(dir, "my-shell");
    await writeExecutable(exec);

    expect(await resolveShellPath(exec)).toBe(exec);
    expect(await resolveShellPath(join(dir, "missing-shell"))).toBeUndefined();
  });

  it("resolves a bare name against PATH", async () => {
    const home = await createTempDir();
    const bin = join(home, "bin");
    const exec = join(bin, "fish");
    await mkdir(bin, { recursive: true });
    await writeExecutable(exec);
    process.env.PATH = bin;

    expect(await resolveShellPath("fish")).toBe(exec);
    expect(await resolveShellPath("missing-shell")).toBeUndefined();
  });

  it("returns undefined for a bare name when PATH is empty", async () => {
    process.env.PATH = "";
    expect(await resolveShellPath("bash")).toBeUndefined();
  });
});

describe("resolveHostShell", () => {
  it("tries candidates in order and returns the first resolvable one", async () => {
    const home = await createTempDir();
    const bin = join(home, "bin");
    const zsh = join(bin, "zsh");
    const bash = join(bin, "bash");
    await mkdir(bin, { recursive: true });
    await writeExecutable(zsh);
    await writeExecutable(bash);
    process.env.PATH = bin;

    expect(await resolveHostShell([undefined, "missing", "zsh", "bash"])).toBe(zsh);
  });

  it("skips undefined / empty / whitespace candidates without failing", async () => {
    const home = await createTempDir();
    const bin = join(home, "bin");
    const sh = join(bin, "sh");
    await mkdir(bin, { recursive: true });
    await writeExecutable(sh);
    process.env.PATH = bin;

    expect(await resolveHostShell([undefined, "", "   ", "sh"])).toBe(sh);
  });

  it("returns undefined when no candidate resolves", async () => {
    process.env.PATH = "";
    expect(await resolveHostShell(["bash", "sh", undefined])).toBeUndefined();
  });
});

describe("buildWrapLauncherHookCommand", () => {
  it("uses the installed launcher from PATH by default", async () => {
    const home = await createTempDir();
    const bin = join(home, "bin");
    const installed = join(bin, "tokenjuice");
    await mkdir(bin, { recursive: true });
    await writeExecutable(installed);
    process.env.PATH = bin;

    const command = await buildWrapLauncherHookCommand({
      subcommand: "test-host-pre-tool-use",
      hostName: "test-host",
      binaryPath: join(home, "dist/cli/main.js"),
      nodePath: "/usr/bin/node",
    });

    expect(command).toBe(`${installed} test-host-pre-tool-use --wrap-launcher ${installed}`);
  });

  it("dispatches a .js binary through node when local routing is forced", async () => {
    const home = await createTempDir();
    const cli = join(home, "dist/cli/main.js");
    await mkdir(join(home, "dist/cli"), { recursive: true });
    await writeFile(cli, "console.log('tj');\n", "utf8");

    const command = await buildWrapLauncherHookCommand({
      subcommand: "test-host-pre-tool-use",
      hostName: "test-host",
      local: true,
      binaryPath: cli,
      nodePath: "/usr/bin/node",
    });

    expect(command).toBe(`/usr/bin/node ${cli} test-host-pre-tool-use --wrap-launcher ${cli}`);
  });

  it("throws with the host name when no binary path can be resolved", async () => {
    await expect(
      buildWrapLauncherHookCommand({
        subcommand: "x",
        hostName: "some-host",
        binaryPath: "",
      }),
    ).rejects.toThrow(/some-host install/);
  });
});

describe("buildWrappedCommand", () => {
  it("emits `<launcher> wrap -- <shell> -lc '<command>'` for a bare launcher", () => {
    const wrapped = buildWrappedCommand({
      wrapLauncher: "/usr/local/bin/tokenjuice",
      shellPath: "/bin/bash",
      command: "git status --short",
    });
    expect(wrapped).toBe("/usr/local/bin/tokenjuice wrap -- /bin/bash -lc 'git status --short'");
  });

  it("dispatches a .js launcher through node", () => {
    const wrapped = buildWrappedCommand({
      wrapLauncher: "/repo/dist/cli/main.js",
      shellPath: "/bin/bash",
      command: "echo hi",
      nodePath: "/usr/bin/node",
    });
    expect(wrapped).toBe("/usr/bin/node /repo/dist/cli/main.js wrap -- /bin/bash -lc 'echo hi'");
  });

  it("escapes commands containing single quotes through POSIX shellQuote", () => {
    const wrapped = buildWrappedCommand({
      wrapLauncher: "/usr/local/bin/tokenjuice",
      shellPath: "/bin/bash",
      command: "echo it's raining",
    });
    // The exact escape form is an implementation detail of shellQuote; assert
    // that running the wrapped string through a shell would reproduce the
    // original command's argv. (Semantic check done in tests that exercise
    // the full wrap hooks; here we just pin the currently-emitted shape so a
    // change triggers deliberate review.)
    expect(wrapped).toBe(`/usr/local/bin/tokenjuice wrap -- /bin/bash -lc 'echo it'\\''s raining'`);
  });
});

describe("commandAlreadyWrapped", () => {
  it.each([
    ["tokenjuice wrap -- git status", true, "bare tokenjuice"],
    ["/usr/local/bin/tokenjuice wrap -- git status", true, "absolute POSIX path"],
    ["/root/.local/share/pnpm/tokenjuice wrap --raw -- git log", true, "pnpm-linked absolute path"],
    ["node /abs/dist/cli/main.js wrap -- git status", true, "node dispatch"],
    ["/usr/bin/node /abs/dist/cli/main.js wrap --raw -- git status", true, "absolute node dispatch"],
    ["git status", false, "plain command"],
    ["tokenjuice ls", false, "non-wrap subcommand"],
    ["some-other-binary wrap -- git status", false, "unrecognized launcher"],
    ["", false, "empty string"],
    ["tokenjuice", false, "launcher without subcommand"],
  ])("returns %s for %j (%s)", (input, expected) => {
    expect(commandAlreadyWrapped(input)).toBe(expected);
  });
});
