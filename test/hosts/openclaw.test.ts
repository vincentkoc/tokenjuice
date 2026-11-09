import { describe, expect, it } from "vitest";

import { createTokenjuiceOpenClawEmbeddedExtension } from "../../src/hosts/openclaw/index.js";

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
    const result = await createToolResultHandler()({
      toolName: "exec",
      input: { command: "git status" },
      content: [{ type: "text", text: "On branch main\n".repeat(100) }],
      details: { status, exitCode: 0 },
    }, { cwd: "/tmp/openclaw" });
    expect(result).toBeUndefined();
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
      details: { status: "failed", exitCode: 1 },
      isError: true,
    }, { cwd: "/tmp/openclaw" });
    const visibleText = result?.content[0].text ?? text;
    expect(visibleText).toContain("Error: first failure");
    expect(visibleText).toContain("Error: second failure");
    expect(result?.details.exitCode).toBe(1);
    expect(result?.details.status).toBe("failed");
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
