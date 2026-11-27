import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTokenjuiceOpenClawEmbeddedExtension } from "../../src/hosts/openclaw/index.js";
import { listArtifactMetadata } from "../../src/core/artifacts.js";

function createToolResultHandler(): Function {
  const handlers = new Map<string, Function>();
  createTokenjuiceOpenClawEmbeddedExtension()({
    on(event: string, handler: Function) {
      handlers.set(event, handler);
    },
  });
  return handlers.get("tool_result")!;
}

describe("OpenClaw adapter", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "tokenjuice-openclaw-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("XDG_CONFIG_HOME", path.join(home, ".config"));
    vi.stubEnv("TOKENJUICE_STATS", "off");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
  });

  it.each(["exec", "bash", "gateway_exec", "node_exec"])(
    "replaces %s aggregated output with the complete delivered text without mutating the event",
    async (toolName) => {
      const rawText = [
        "On branch raw-only-branch-marker",
        "",
        "Changes not staged for commit:",
        "\tmodified:   src/hosts/openclaw/extension.ts",
        "",
        "no changes added to commit",
      ].join("\n");
      const event = {
        toolName,
        input: { command: "git status", workdir: home },
        content: [{ type: "text", text: rawText }],
        details: {
          status: "completed",
          exitCode: 0,
          aggregated: rawText,
          durationMs: 42,
          cwd: home,
          fullOutputPath: "/tmp/openclaw/full-output.log",
          custom: { retained: true },
        },
        isError: false,
      };
      const original = structuredClone(event);

      const result = await createToolResultHandler()(event, { cwd: home });
      const deliveredText = result.content[0].text;
      // Code Mode returns successful tool details, not the text content projection.
      const consumerValue = JSON.parse(JSON.stringify(result)).details;

      expect(deliveredText).toContain("M: src/hosts/openclaw/extension.ts");
      expect(deliveredText).toContain("[tokenjuice compacted bash output]");
      expect(consumerValue.aggregated).toBe(deliveredText);
      expect(consumerValue).toEqual({
        ...original.details,
        aggregated: deliveredText,
        tokenjuice: expect.objectContaining({ compacted: true }),
      });
      expect(JSON.stringify(result)).not.toContain("raw-only-branch-marker");
      expect(event).toEqual(original);
    },
  );

  it.each([undefined, null, 42])("does not invent aggregated text for an existing %j value", async (aggregated) => {
    const details = {
      status: "completed",
      exitCode: 0,
      ...(aggregated === undefined ? {} : { aggregated }),
    };
    const event = {
      toolName: "exec",
      input: { command: "git status", workdir: home },
      content: [{ type: "text", text: "On branch main\nChanges not staged for commit:\n\tmodified:   source.ts\nno changes added to commit" }],
      details,
    };
    const original = structuredClone(event);

    const result = await createToolResultHandler()(event, { cwd: home });

    expect(result.content[0].text).toContain("M: source.ts");
    expect(result.details).toEqual({ ...details, tokenjuice: expect.any(Object) });
    expect(event).toEqual(original);
  });

  it.each([undefined, null, []])("leaves results with absent or invalid details %j untouched", async (details) => {
    const event = {
      toolName: "exec",
      input: { command: "git status", workdir: home },
      content: [{ type: "text", text: "On branch main\n".repeat(100) }],
      details,
    };
    const original = structuredClone(event);

    expect(await createToolResultHandler()(event, { cwd: home })).toBeUndefined();
    expect(event).toEqual(original);
  });
  it("creates an embedded extension that compacts exec tool results", async () => {
    const embeddedExtension = createTokenjuiceOpenClawEmbeddedExtension();

    const handlers = new Map<string, Function>();
    embeddedExtension({
      on(event: string, handler: Function) {
        handlers.set(event, handler);
      },
    });

    const result = await handlers.get("tool_result")?.(
      {
        toolName: "exec",
        input: {
          command: "git status",
          workdir: "/tmp/openclaw",
        },
        details: {
          status: "completed",
          exitCode: 0,
          durationMs: 42,
          cwd: "/tmp/openclaw",
          aggregated: [
            "On branch feat/openclaw-plugin",
            "",
            "Changes not staged for commit:",
            "\tmodified:   src/hosts/openclaw/index.ts",
            "\tmodified:   src/hosts/openclaw/extension.ts",
            "",
            "no changes added to commit",
          ].join("\n"),
        },
        isError: false,
      },
      { cwd: "/tmp/openclaw" },
    );

    expect(result?.content[0].text).toContain("M: src/hosts/openclaw/index.ts");
    expect(result?.content[0].text).toContain("tokenjuice compacted bash output");
    expect(result?.details?.tokenjuice?.compacted).toBe(true);
  });


  it.each(["bash", "gateway_exec", "node_exec"] as const)(
    "compacts OpenClaw %s projection tool results like exec",
    async (toolName) => {
      const embeddedExtension = createTokenjuiceOpenClawEmbeddedExtension();

      const handlers = new Map<string, Function>();
      embeddedExtension({
        on(event: string, handler: Function) {
          handlers.set(event, handler);
        },
      });

      const result = await handlers.get("tool_result")?.(
        {
          toolName,
          input: {
            command: "git status",
            workdir: "/tmp/openclaw",
          },
          details: {
            status: "completed",
            exitCode: 0,
            durationMs: 42,
            cwd: "/tmp/openclaw",
            aggregated: [
              "On branch feat/openclaw-plugin",
              "",
              "Changes not staged for commit:",
              "\tmodified:   src/hosts/openclaw/index.ts",
              "\tmodified:   src/hosts/openclaw/extension.ts",
              "",
              "no changes added to commit",
            ].join("\n"),
          },
          isError: false,
        },
        { cwd: "/tmp/openclaw" },
      );

      expect(result?.content[0].text).toContain("M: src/hosts/openclaw/index.ts");
      expect(result?.content[0].text).toContain("tokenjuice compacted bash output");
      expect(result?.details?.tokenjuice?.compacted).toBe(true);
    },
  );

  it.each([
    ["long file-read results", 'return await read({ path: "large.ts" });',
      JSON.stringify({ kind: "text", content: Array.from({ length: 250 }, (_, i) => `export const value${i} = "source line ${i}";`).join("\n") })],
    ["large JSON", 'return { records: await load("records") };',
      JSON.stringify({ records: Array.from({ length: 250 }, (_, i) => ({ id: i, value: "record-" + i })) })],
    ["nested tool results", 'return await exec({ command: "pnpm test" });',
      JSON.stringify({ status: "completed", value: { output: Array.from({ length: 250 }, (_, i) => "test " + i + ": passed").join("\n") } })],
  ])("preserves Code Mode %s with the normalized command alias", async (_label, code, text) => {
    const handlers = new Map<string, Function>();
    createTokenjuiceOpenClawEmbeddedExtension()({
      on(event: string, handler: Function) {
        handlers.set(event, handler);
      },
    });
    // OpenClaw pairs code/command before hooks and supplies terminal details.
    // Its Tokenjuice middleware removes aggregated, leaving the text content.
    const event = {
      toolName: "exec",
      input: { code, command: code },
      content: [{ type: "text", text }],
      details: { status: "completed", exitCode: 0 },
      isError: false,
    };
    const original = structuredClone(event);

    const result = await handlers.get("tool_result")?.(event, { cwd: "/tmp/openclaw" });

    expect(result).toBeUndefined();
    expect(event).toEqual(original);
  });

  it.each(["completed", "failed"])("preserves Code Mode %s details and mixed content", async (status) => {
    const code = 'return await catalog.search("schema");';
    const text = JSON.stringify({ schema: "property ".repeat(1000) });
    const event = {
      toolName: "exec",
      input: { code, command: code },
      content: [{ type: "text", text }, { type: "image", data: "fixture", mimeType: "image/png" }],
      details: { status, exitCode: status === "failed" ? 1 : 0, aggregated: text, custom: { retained: true } },
      isError: status === "failed",
    };
    const original = structuredClone(event);

    expect(await createToolResultHandler()(event, { cwd: "/tmp/openclaw" })).toBeUndefined();
    expect(event).toEqual(original);
  });

  it.each([
    undefined, null, [], {}, { command: 42 },
    { code: "return 1;" },
    { command: "git status", code: "" },
    { command: "git status", code: null },
    { command: "git status", code: undefined },
  ])("does not compact missing or ambiguous shell input: %j", async (input) => {
    const result = await createToolResultHandler()({
      toolName: "exec",
      input,
      content: [{ type: "text", text: "On branch main\n".repeat(100) }],
      details: { status: "completed", exitCode: 0 },
    }, { cwd: "/tmp/openclaw" });
    expect(result).toBeUndefined();
  });

  it.each(["running", "waiting", undefined])("leaves non-terminal shell status %s untouched", async (status) => {
    const event = {
      toolName: "exec",
      input: { command: "git status" },
      content: [{ type: "text", text: "On branch main\n".repeat(100) }],
      details: { status, exitCode: 0, aggregated: "On branch main\n".repeat(100), sessionId: "still-running" },
    };
    const original = structuredClone(event);
    expect(await createToolResultHandler()(event, { cwd: home })).toBeUndefined();
    expect(event).toEqual(original);
  });

  it("preserves explicit raw bypass in both output projections", async () => {
    const text = "On branch main\nChanges not staged for commit:\n\tmodified:   source.ts\nno changes added to commit";
    const event = {
      toolName: "exec",
      input: { command: "tokenjuice wrap --raw -- git status", workdir: home },
      content: [{ type: "text", text }],
      details: { status: "completed", exitCode: 0, aggregated: text },
    };
    const original = structuredClone(event);

    expect(await createToolResultHandler()(event, { cwd: home })).toBeUndefined();
    expect(event).toEqual(original);
  });

  it.each(["cat source.ts", "sed -n '1,250p' source.ts", "head -n 250 source.ts"])(
    "keeps exact shell inspection output for %s",
    async (command) => {
      const event = {
        toolName: "exec",
        input: { command },
        content: [{ type: "text", text: "source or diff line\n".repeat(250) }],
        details: { status: "completed", exitCode: 0 },
      };
      const original = structuredClone(event);
      expect(await createToolResultHandler()(event, { cwd: "/tmp/openclaw" })).toBeUndefined();
      expect(event).toEqual(original);
    },
  );

  it("retains failing shell diagnostics", async () => {
    const text = ["test passed\n".repeat(250), "Error: first failure", "Error: second failure"].join("\n");
    const result = await createToolResultHandler()({
      toolName: "exec",
      input: { command: "pnpm test" },
      content: [{ type: "text", text }],
      details: { status: "failed", exitCode: 1, aggregated: text, fullOutputPath: "/tmp/failure.log", custom: { retained: true } },
      isError: true,
    }, { cwd: "/tmp/openclaw" });
    const visibleText = result?.content[0].text ?? text;
    expect(visibleText).toContain("Error: first failure");
    expect(visibleText).toContain("Error: second failure");
    expect(result?.details.exitCode).toBe(1);
    expect(result?.details.status).toBe("failed");
    expect(result?.details.aggregated).toBe(visibleText);
    expect(result?.details.fullOutputPath).toBe("/tmp/failure.log");
    expect(result?.details.custom).toEqual({ retained: true });
  });

  it("does not replace a failed build with no observed exit", async () => {
    const aggregated = ["#7 [2/2] RUN npm install", "#7 0.350 npm error code E404", "#7 0.352 npm error 404 missing-dependency@1.0.0", "Command timed out after 15 seconds", "(Command terminated by signal SIGKILL)"].join("\n");
    const event = {
      toolName: "exec",
      input: { command: "docker build ." },
      content: [{ type: "text", text: aggregated }],
      details: { status: "failed", exitCode: null, aggregated },
      isError: true,
    };
    expect(await createToolResultHandler()(event, { cwd: home })).toBeUndefined();
  });

  it.each([
    ["On branch main\n  modified: src/foo.ts\n", false],
    [" M     " + "x".repeat(40) + "\n", false],
    ["On branch a-long-branch-name-for-the-test\n  modified: src/foo.ts\nno changes added to commit\n", true],
  ] as const)("measures final delivered text before keeping or rewriting", async (aggregated, rewrite) => {
    const storeDir = path.join(home, "stats");
    vi.stubEnv("TOKENJUICE_STATS", "on");
    vi.stubEnv("TOKENJUICE_ARTIFACT_DIR", storeDir);
    const result = await createToolResultHandler()({
      toolName: "exec",
      input: { command: "git status" },
      content: [{ type: "text", text: aggregated }],
      details: { status: "completed", exitCode: 0, aggregated },
    }, { cwd: home });
    const deliveredText = result?.content[0].text ?? aggregated;
    expect(Boolean(result)).toBe(rewrite);
    expect(result?.details.tokenjuice.savedChars ?? 0).toBe(aggregated.length - deliveredText.length);
    const stats = await listArtifactMetadata(storeDir);
    expect(stats).toHaveLength(1);
    expect(stats[0]?.metadata).toMatchObject({ rawChars: aggregated.length, reducedChars: deliveredText.length });
  });

  it("ignores non-exec tool results", async () => {
    const embeddedExtension = createTokenjuiceOpenClawEmbeddedExtension();

    const handlers = new Map<string, Function>();
    embeddedExtension({
      on(event: string, handler: Function) {
        handlers.set(event, handler);
      },
    });

    const result = await handlers.get("tool_result")?.(
      {
        toolName: "read",
        input: {
          path: "README.md",
        },
        details: {
          status: "completed",
          aggregated: "README.md contents",
        },
        isError: false,
      },
      { cwd: "/tmp/openclaw" },
    );

    expect(result).toBeUndefined();
  });
});
