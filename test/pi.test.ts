import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { doctorPiExtension, installPiExtension } from "../src/index.js";

const tempDirs: string[] = [];
const originalPath = process.env.PATH;
const originalPiAgentDir = process.env.PI_CODING_AGENT_DIR;

afterEach(async () => {
  process.env.PATH = originalPath;
  if (originalPiAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = originalPiAgentDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-pi-test-"));
  tempDirs.push(dir);
  return dir;
}

const SOURCE_RUNTIME_ASSET_PATH = new URL("../src/pi-extension/runtime.js", import.meta.url);

async function readOptional(path: string | URL): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function installLocalTestExtension(
  home: string,
  scriptSource: string,
  options: {
    agentSettings?: unknown;
    projectSettings?: unknown;
  } = {},
) {
  const extensionPath = join(home, "tokenjuice.js");
  const localCliPath = join(home, "dist", "cli", "main.js");

  process.env.PATH = "";
  const agentDir = join(home, ".pi-agent");
  process.env.PI_CODING_AGENT_DIR = agentDir;

  await mkdir(join(home, "dist", "cli"), { recursive: true });
  await writeFile(localCliPath, scriptSource, "utf8");

  if (options.agentSettings !== undefined) {
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, "settings.json"), JSON.stringify(options.agentSettings), "utf8");
  }

  if (options.projectSettings !== undefined) {
    await mkdir(join(home, ".pi"), { recursive: true });
    await writeFile(join(home, ".pi", "settings.json"), JSON.stringify(options.projectSettings), "utf8");
  }

  await installPiExtension(extensionPath, {
    local: true,
    binaryPath: localCliPath,
    nodePath: process.execPath,
  });

  const imported = await import(pathToFileURL(extensionPath).href + `?t=${Date.now()}-${Math.random()}`);
  const handlers = new Map<string, Function>();
  const notifications: Array<{ message: string; level: string }> = [];

  const fakePi = {
    on(event: string, handler: Function) {
      handlers.set(event, handler);
    },
    registerCommand(_name: string, command: { handler: Function }) {
      handlers.set("command:tj", command.handler);
    },
    appendEntry() {},
  };

  imported.default(fakePi);

  const fakeCtx = {
    cwd: home,
    hasUI: false,
    sessionManager: {
      getBranch: () => [],
      getEntries: () => [],
      getCwd: () => home,
      getSessionName: () => undefined,
    },
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };

  await handlers.get("session_start")?.({}, fakeCtx);

  return { handlers, fakeCtx, extensionPath, notifications };
}

describe("installPiExtension", () => {
  it("reports a disabled pi integration when no extension is installed", async () => {
    const home = await createTempDir();
    const agentDir = join(home, ".pi-agent");

    process.env.PI_CODING_AGENT_DIR = agentDir;
    const report = await doctorPiExtension();

    expect(report.status).toBe("disabled");
    expect(report.extensionPath).toBe(join(agentDir, "extensions", "tokenjuice.js"));
    expect(report.issues).toEqual([]);
  });

  it("installs a single-file pi extension using a stable launcher from PATH", async () => {
    const home = await createTempDir();
    const agentDir = join(home, ".pi-agent");
    const binDir = join(home, "bin");
    const launcherPath = join(binDir, "tokenjuice");

    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.PATH = binDir;
    await mkdir(binDir, { recursive: true });
    await writeFile(launcherPath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    const result = await installPiExtension();
    const extensionSource = await readFile(result.extensionPath, "utf8");

    expect(result.extensionPath).toBe(join(agentDir, "extensions", "tokenjuice.js"));
    expect(result.backupPath).toBeUndefined();
    expect(extensionSource).toContain("createTokenjuicePiExtension");
    expect(extensionSource).toContain(`"extensionCommand": "tj"`);
    expect(extensionSource).not.toContain("reduceJsonCommand");
    expect(extensionSource).not.toContain("tokenjuice-runtime.js");
    expect(await readOptional(join(agentDir, "extensions", "tokenjuice-runtime.js"))).toBeUndefined();
  });

  it("removes the legacy sibling runtime file during install", async () => {
    const home = await createTempDir();
    const agentDir = join(home, ".pi-agent");
    const extensionDir = join(agentDir, "extensions");
    const extensionPath = join(extensionDir, "tokenjuice.js");
    const legacyRuntimePath = join(extensionDir, "tokenjuice-runtime.js");

    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.PATH = "";
    await mkdir(extensionDir, { recursive: true });
    await writeFile(legacyRuntimePath, "export default function () {}\n", "utf8");

    await installPiExtension(extensionPath, {
      local: true,
      binaryPath: "/tmp/tokenjuice/dist/cli/main.js",
      nodePath: "/tmp/tokenjuice/node",
    });

    expect(await readOptional(legacyRuntimePath)).toBeUndefined();
  });

  it("prefers the source runtime bundle for local pi installs", async () => {
    const home = await createTempDir();
    const extensionPath = join(home, "tokenjuice.js");
    const originalRuntimeAsset = await readOptional(SOURCE_RUNTIME_ASSET_PATH);

    await writeFile(
      SOURCE_RUNTIME_ASSET_PATH,
      `export function createTokenjuicePiExtension() { return function tokenjuicePiExtension() {} }\nexport const STALE_RUNTIME_MARKER = "stale-runtime-asset";\n`,
      "utf8",
    );

    try {
      await installPiExtension(extensionPath);
      const bundledAssetInstall = await readFile(extensionPath, "utf8");
      expect(bundledAssetInstall).toContain("STALE_RUNTIME_MARKER");

      await installPiExtension(extensionPath, { local: true });
      const localInstall = await readFile(extensionPath, "utf8");
      expect(localInstall).not.toContain("STALE_RUNTIME_MARKER");
      expect(localInstall).toContain("createTokenjuicePiExtension");
    } finally {
      if (originalRuntimeAsset === undefined) {
        await rm(SOURCE_RUNTIME_ASSET_PATH, { force: true });
      } else {
        await writeFile(SOURCE_RUNTIME_ASSET_PATH, originalRuntimeAsset, "utf8");
      }
    }
  });

  it("installs a parseable local pi extension without footer wiring", async () => {
    const home = await createTempDir();
    const extensionPath = join(home, "tokenjuice.js");
    const localNodePath = join(home, "node");
    const localCliPath = join(home, "dist", "cli", "main.js");

    process.env.PATH = "";
    process.env.PI_CODING_AGENT_DIR = join(home, ".pi-agent");
    await mkdir(join(home, "dist", "cli"), { recursive: true });
    await writeFile(localNodePath, "#!/usr/bin/env bash\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    await writeFile(localCliPath, "console.log('tokenjuice');\n", "utf8");

    const result = await installPiExtension(extensionPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: localNodePath,
    });
    const extensionSource = await readFile(extensionPath, "utf8");

    expect(extensionSource).toContain("createTokenjuicePiExtension");
    expect(extensionSource).toContain(`"extensionCommand": "tj"`);
    expect(extensionSource).not.toContain("reduceJsonCommand");
    expect(extensionSource).not.toContain("setFooter(");
    expect(await readOptional(join(home, "tokenjuice-runtime.js"))).toBeUndefined();

    const imported = await import(pathToFileURL(extensionPath).href);
    expect(typeof imported.default).toBe("function");
  });

  it("keeps /tj status panel lines within the requested width", async () => {
    const home = await createTempDir();
    const { handlers } = await installLocalTestExtension(
      home,
      "process.stdout.write('{}');\n",
    );

    let renderedLines: string[] = [];
    const fakeCtx = {
      cwd: home,
      hasUI: true,
      sessionManager: {
        getBranch: () => [],
        getEntries: () => [],
        getCwd: () => home,
        getSessionName: () => undefined,
      },
      ui: {
        async custom(factory: Function) {
          const component = factory(
            { requestRender() {} },
            {
              fg(_name: string, text: string) {
                return text;
              },
            },
            {},
            () => {},
          );
          renderedLines = component.render(20);
          return undefined;
        },
        notify() {},
      },
    };

    await handlers.get("command:tj")?.("status", fakeCtx);

    expect(renderedLines.length).toBeGreaterThan(0);
    expect(renderedLines.every((entry) => entry.length <= 20)).toBe(true);
  });

  it("opens a TUI status panel for /tj status when UI is available", async () => {
    const home = await createTempDir();
    const { handlers } = await installLocalTestExtension(
      home,
      "process.stdout.write('{}');\n",
    );

    let customCalled = false;
    let renderedLines: string[] = [];
    const fakeCtx = {
      cwd: home,
      hasUI: true,
      sessionManager: {
        getBranch: () => [
          {
            type: "message",
            message: {
              role: "toolResult",
              details: {
                tokenjuice: {
                  compacted: true,
                  rawChars: 120,
                  reducedChars: 48,
                  savedChars: 72,
                  reducer: "git/status",
                },
              },
            },
          },
        ],
        getEntries: () => [],
        getCwd: () => home,
        getSessionName: () => undefined,
      },
      ui: {
        async custom(factory: Function) {
          customCalled = true;
          const component = factory(
            { requestRender() {} },
            {
              fg(_name: string, text: string) {
                return text;
              },
            },
            {},
            () => {},
          );
          renderedLines = component.render(80);
          return undefined;
        },
        notify() {},
      },
    };

    await handlers.get("command:tj")?.("status", fakeCtx);

    expect(customCalled).toBe(true);
    expect(renderedLines.join("\n")).toContain("tokenjuice");
    expect(renderedLines.join("\n")).toContain("saved chars");
    expect(renderedLines.join("\n")).toContain("git/status");
  });

  it("reports manual, auto, and effective state in /tj status without UI", async () => {
    const home = await createTempDir();
    const { handlers, fakeCtx, notifications } = await installLocalTestExtension(
      home,
      "process.stdout.write('{}');\n",
      {
        agentSettings: { compaction: { enabled: false } },
      },
    );

    await handlers.get("command:tj")?.("status", fakeCtx);

    expect(notifications.at(-1)?.message).toBe(
      "tokenjuice manual on; pi auto-compaction off; effective off; bypass-next idle",
    );
  });

  it("warns when /tj on is enabled while pi auto-compaction is disabled", async () => {
    const home = await createTempDir();
    const { handlers, fakeCtx, notifications } = await installLocalTestExtension(
      home,
      "process.stdout.write('{}');\n",
      {
        agentSettings: { compaction: { enabled: false } },
      },
    );

    await handlers.get("command:tj")?.("on", fakeCtx);

    expect(notifications.at(-1)).toEqual({
      message: "tokenjuice compaction enabled, but pi auto-compaction is disabled by settings",
      level: "warning",
    });
  });

  it("backs up an existing pi extension before overwriting it", async () => {
    const home = await createTempDir();
    const extensionPath = join(home, "tokenjuice.js");

    process.env.PATH = "";
    await writeFile(extensionPath, "// old extension\n", "utf8");

    const result = await installPiExtension(extensionPath, {
      local: true,
      binaryPath: "/tmp/tokenjuice/dist/cli/main.js",
      nodePath: "/tmp/tokenjuice/node",
    });

    expect(result.backupPath).toBe(`${extensionPath}.bak`);
    expect(await readFile(`${extensionPath}.bak`, "utf8")).toBe("// old extension\n");
  });

  it("reports an installed pi extension as healthy", async () => {
    const home = await createTempDir();
    const agentDir = join(home, ".pi-agent");

    process.env.PI_CODING_AGENT_DIR = agentDir;
    await installPiExtension(undefined, { local: true });

    const report = await doctorPiExtension();

    expect(report.status).toBe("ok");
    expect(report.extensionPath).toBe(join(agentDir, "extensions", "tokenjuice.js"));
    expect(report.issues).toEqual([]);
  });

  it("compacts bash output without invoking the configured reduce-json subprocess", async () => {
    const home = await createTempDir();
    const markerPath = join(home, "reduce-json-called.txt");
    const { handlers, fakeCtx } = await installLocalTestExtension(
      home,
      `
        import { appendFileSync } from "node:fs";

        appendFileSync(${JSON.stringify(markerPath)}, "called\\n");
        process.stderr.write("should not run\\n");
        process.exit(99);
      `,
    );

    const result = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "git status" },
        content: [{
          type: "text",
          text: [
            "On branch feat/pi-extension",
            "",
            "Changes not staged for commit:",
            "\tmodified:   src/pi-extension/runtime.ts",
            "\tmodified:   src/core/pi.ts",
            "",
            "no changes added to commit",
          ].join("\n"),
        }],
        details: {},
      },
      fakeCtx,
    );

    expect(result?.content[0].text).toContain("M: src/pi-extension/runtime.ts");
    expect(result?.content[0].text).toContain("tokenjuice compacted bash output");
    expect(await readOptional(markerPath)).toBeUndefined();
  });

  it("skips bash compaction when pi settings disable auto compaction", async () => {
    const home = await createTempDir();
    const markerPath = join(home, "reduce-json-called.txt");
    const { handlers, fakeCtx } = await installLocalTestExtension(
      home,
      `
        import { appendFileSync } from "node:fs";

        appendFileSync(${JSON.stringify(markerPath)}, "called\\n");
        process.stdout.write(JSON.stringify({
          inlineText: "compacted output",
          stats: { rawChars: 200, reducedChars: 20, ratio: 0.1 },
          classification: { family: "test", confidence: 1, matchedReducer: "test/rule" }
        }));
      `,
      {
        agentSettings: { compaction: { enabled: false } },
      },
    );

    const result = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "printf 'hello world'" },
        content: [{ type: "text", text: "verbose output that would otherwise be compacted" }],
        details: {},
      },
      fakeCtx,
    );

    expect(result).toBeUndefined();
    expect(await readOptional(markerPath)).toBeUndefined();
  });

  it("ignores crafted full-output markers embedded in bash output", async () => {
    const home = await createTempDir();
    const fakePath = join(home, "sensitive.txt");
    const { handlers, fakeCtx } = await installLocalTestExtension(
      home,
      `
        process.stdout.write(JSON.stringify({
          inlineText: "compacted output",
          stats: { rawChars: 200, reducedChars: 20, ratio: 0.1 },
          classification: { family: "test", confidence: 1, matchedReducer: "test/rule" }
        }));
      `,
    );

    await expect(
      handlers.get("tool_result")?.(
        {
          toolName: "bash",
          input: { command: "printf 'hello world'" },
          content: [{ type: "text", text: `visible transcript\n\n[Full output: ${fakePath}]` }],
          details: {},
        },
        fakeCtx,
      ),
    ).resolves.toBeUndefined();
  });

  it("consumes /tj raw-next on the immediately following empty-output bash result", async () => {
    const home = await createTempDir();
    const { handlers, fakeCtx } = await installLocalTestExtension(
      home,
      "process.stdout.write('{}');\n",
    );

    await handlers.get("command:tj")?.("raw-next", fakeCtx);

    const emptyResult = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "true" },
        content: [{ type: "text", text: "" }],
        details: {},
      },
      fakeCtx,
    );

    expect(emptyResult).toBeUndefined();

    const nextResult = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "git status" },
        content: [{
          type: "text",
          text: [
            "On branch feat/pi-extension",
            "",
            "Changes not staged for commit:",
            "\tmodified:   src/pi-extension/runtime.ts",
            "\tmodified:   src/core/pi.ts",
            "",
            "no changes added to commit",
          ].join("\n"),
        }],
        details: {},
      },
      fakeCtx,
    );

    expect(nextResult?.content[0].text).toContain("tokenjuice compacted bash output");
    expect(nextResult?.content[0].text).not.toContain("tokenjuice bypassed compaction");
  });

  it("consumes /tj raw-next even when compaction is disabled for the next command", async () => {
    const home = await createTempDir();
    const { handlers, fakeCtx } = await installLocalTestExtension(
      home,
      "process.stdout.write('{}');\n",
      {
        agentSettings: { compaction: { enabled: false } },
      },
    );

    await handlers.get("command:tj")?.("raw-next", fakeCtx);

    const disabledResult = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "printf 'hello'" },
        content: [{ type: "text", text: "hello" }],
        details: {},
      },
      fakeCtx,
    );

    expect(disabledResult).toBeUndefined();

    await writeFile(join(home, ".pi-agent", "settings.json"), JSON.stringify({ compaction: { enabled: true } }), "utf8");

    const nextResult = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "git status" },
        content: [{
          type: "text",
          text: [
            "On branch feat/pi-extension",
            "",
            "Changes not staged for commit:",
            "\tmodified:   src/pi-extension/runtime.ts",
            "\tmodified:   src/core/pi.ts",
            "",
            "no changes added to commit",
          ].join("\n"),
        }],
        details: {},
      },
      fakeCtx,
    );

    expect(nextResult?.content[0].text).toContain("tokenjuice compacted bash output");
    expect(nextResult?.content[0].text).not.toContain("tokenjuice bypassed compaction");
  });

  it("returns the trusted full output file for /tj raw-next", async () => {
    const home = await createTempDir();
    const fullOutputPath = join(home, "full-output.txt");
    await writeFile(fullOutputPath, "full raw output\nline 2\n", "utf8");
    const { handlers, fakeCtx } = await installLocalTestExtension(
      home,
      `
        process.stdout.write(JSON.stringify({
          inlineText: "compacted output",
          stats: { rawChars: 200, reducedChars: 20, ratio: 0.1 },
          classification: { family: "test", confidence: 1, matchedReducer: "test/rule" }
        }));
      `,
    );

    await handlers.get("command:tj")?.("raw-next", fakeCtx);

    const result = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "printf 'hello world'" },
        content: [{ type: "text", text: "truncated visible output" }],
        details: { fullOutputPath },
      },
      fakeCtx,
    );

    expect(result.content[0].text).toContain("full raw output\nline 2\n");
    expect(result.content[0].text).not.toContain("truncated visible output");
  });

  it("keeps project settings active after changing into a subdirectory", async () => {
    const home = await createTempDir();
    const subdir = join(home, "packages", "app");
    await mkdir(subdir, { recursive: true });
    const markerPath = join(home, "reduce-json-called.txt");
    const { handlers, fakeCtx, notifications } = await installLocalTestExtension(
      home,
      `
        import { appendFileSync } from "node:fs";

        appendFileSync(${JSON.stringify(markerPath)}, "called\\n");
        process.stdout.write(JSON.stringify({
          inlineText: "compacted output",
          stats: { rawChars: 200, reducedChars: 20, ratio: 0.1 },
          classification: { family: "test", confidence: 1, matchedReducer: "test/rule" }
        }));
      `,
      {
        projectSettings: { compaction: { enabled: false } },
      },
    );

    fakeCtx.cwd = subdir;
    fakeCtx.sessionManager.getHeader = () => ({ cwd: home });
    fakeCtx.sessionManager.getCwd = () => subdir;

    await handlers.get("command:tj")?.("status", fakeCtx);
    expect(notifications.at(-1)?.message).toContain("pi auto-compaction off");

    const result = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "printf 'hello world'" },
        content: [{ type: "text", text: "verbose output that would otherwise be compacted" }],
        details: {},
      },
      fakeCtx,
    );

    expect(result).toBeUndefined();
    expect(await readOptional(markerPath)).toBeUndefined();
  });

  it("skips rewrite when fullOutputPath is too large", async () => {
    const home = await createTempDir();
    const markerPath = join(home, "reduce-json-called.txt");
    const largeOutputPath = join(home, "large-output.txt");
    await writeFile(largeOutputPath, "x".repeat(9 * 1024 * 1024), "utf8");
    const { handlers, fakeCtx } = await installLocalTestExtension(
      home,
      `
        import { appendFileSync } from "node:fs";

        appendFileSync(${JSON.stringify(markerPath)}, "called\\n");
        process.stdout.write(JSON.stringify({
          inlineText: "compacted output",
          stats: { rawChars: 200, reducedChars: 20, ratio: 0.1 },
          classification: { family: "test", confidence: 1, matchedReducer: "test/rule" }
        }));
      `,
    );

    const result = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "printf 'hello world'" },
        content: [{ type: "text", text: "visible transcript only" }],
        details: { fullOutputPath: largeOutputPath },
      },
      fakeCtx,
    );

    expect(result).toBeUndefined();
    expect(await readOptional(markerPath)).toBeUndefined();
  });

  it("restores manual /tj state from session-wide entries across branch changes", async () => {
    const home = await createTempDir();
    const extensionPath = join(home, "tokenjuice.js");
    const localCliPath = join(home, "dist", "cli", "main.js");

    process.env.PATH = "";
    process.env.PI_CODING_AGENT_DIR = join(home, ".pi-agent");
    await mkdir(join(home, "dist", "cli"), { recursive: true });
    await writeFile(localCliPath, "console.log('tokenjuice');\n", "utf8");

    await installPiExtension(extensionPath, {
      local: true,
      binaryPath: localCliPath,
      nodePath: process.execPath,
    });

    const imported = await import(pathToFileURL(extensionPath).href + `?t=${Date.now()}-branch-state`);
    const handlers = new Map<string, Function>();
    const fakePi = {
      on(event: string, handler: Function) {
        handlers.set(event, handler);
      },
      registerCommand(_name: string, command: { handler: Function }) {
        handlers.set("command:tj", command.handler);
      },
      appendEntry() {},
    };

    imported.default(fakePi);

    const sessionEntries = [{ type: "custom", customType: "tokenjuice-pi-config", data: { enabled: false } }];
    const branchEntries: any[] = [];
    const notifications: Array<{ message: string; level: string }> = [];
    const fakeCtx = {
      cwd: home,
      hasUI: false,
      sessionManager: {
        getBranch: () => branchEntries,
        getEntries: () => sessionEntries,
        getCwd: () => home,
        getSessionName: () => undefined,
      },
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
      },
    };

    await handlers.get("session_start")?.({}, fakeCtx);
    await handlers.get("command:tj")?.("status", fakeCtx);

    expect(notifications.at(-1)?.message).toContain("manual off");
    expect(notifications.at(-1)?.message).toContain("effective off");
  });

  it("fails loudly when fullOutputPath cannot be read", async () => {
    const home = await createTempDir();
    const markerPath = join(home, "reduce-json-called.txt");
    const missingOutputPath = join(home, "missing-output.txt");
    const { handlers, fakeCtx } = await installLocalTestExtension(
      home,
      `
        import { appendFileSync } from "node:fs";

        appendFileSync(${JSON.stringify(markerPath)}, "called\\n");
        process.stdout.write(JSON.stringify({
          inlineText: "compacted output",
          stats: { rawChars: 200, reducedChars: 20, ratio: 0.1 },
          classification: { family: "test", confidence: 1, matchedReducer: "test/rule" }
        }));
      `,
    );

    await expect(
      handlers.get("tool_result")?.(
        {
          toolName: "bash",
          input: { command: "printf 'hello world'" },
          content: [{ type: "text", text: "visible transcript only" }],
          details: { fullOutputPath: missingOutputPath },
        },
        fakeCtx,
      ),
    ).rejects.toThrow(`tokenjuice failed to stat bash full output file ${missingOutputPath}`);
    expect(await readOptional(markerPath)).toBeUndefined();
  });

  it("skips file-content inspection commands before reading fullOutputPath", async () => {
    const home = await createTempDir();
    const missingOutputPath = join(home, "missing-output.txt");
    const { handlers, fakeCtx } = await installLocalTestExtension(home, "process.exit(7);");

    const result = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "cat src/core/reduce.ts" },
        content: [{ type: "text", text: "export function reduceExecution() {}\n" }],
        details: { fullOutputPath: missingOutputPath },
      },
      fakeCtx,
    );

    expect(result).toBeUndefined();
  });

  it("rewrites safe repository inventory commands in-process", async () => {
    const home = await createTempDir();
    const { handlers, fakeCtx } = await installLocalTestExtension(home, "process.exit(7);");

    const result = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "rg --files src/rules" },
        content: [{
          type: "text",
          text: Array.from({ length: 30 }, (_, index) => `src/rules/example-${index + 1}.json`).join("\n"),
        }],
        details: {},
      },
      fakeCtx,
    );

    expect(result?.content[0].text).toContain("30 paths");
    expect(result?.content[0].text).toContain("src/rules/example-1.json");
  });

  it("skips unsafe repository inventory pipelines before reading fullOutputPath", async () => {
    const home = await createTempDir();
    const missingOutputPath = join(home, "missing-output.txt");
    const { handlers, fakeCtx } = await installLocalTestExtension(home, "process.exit(7);");

    const result = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "rg --files | sort README.md" },
        content: [{
          type: "text",
          text: Array.from({ length: 30 }, (_, index) => `src/file-${index + 1}.ts`).join("\n"),
        }],
        details: { fullOutputPath: missingOutputPath },
      },
      fakeCtx,
    );

    expect(result).toBeUndefined();
  });

  it("continues to compact in-process even when the configured reduce-json target is broken", async () => {
    const home = await createTempDir();
    const markerPath = join(home, "reduce-json-called.txt");
    const { handlers, fakeCtx } = await installLocalTestExtension(
      home,
      `
        import { appendFileSync } from "node:fs";

        appendFileSync(${JSON.stringify(markerPath)}, "called\\n");
        process.stderr.write("broken on purpose\\n");
        process.exit(7);
      `,
    );

    const result = await handlers.get("tool_result")?.(
      {
        toolName: "bash",
        input: { command: "git status" },
        content: [{
          type: "text",
          text: [
            "On branch feat/pi-extension",
            "",
            "Changes not staged for commit:",
            "\tmodified:   src/pi-extension/runtime.ts",
            "\tmodified:   src/core/pi.ts",
            "",
            "no changes added to commit",
          ].join("\n"),
        }],
        details: {},
      },
      fakeCtx,
    );

    expect(result?.content[0].text).toContain("M: src/pi-extension/runtime.ts");
    expect(await readOptional(markerPath)).toBeUndefined();
  });
});
