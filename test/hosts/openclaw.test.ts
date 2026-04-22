import { describe, expect, it } from "vitest";

import openclawPlugin from "../../src/openclaw-plugin.js";

describe("OpenClaw plugin", () => {
  it("registers an embedded extension factory that compacts exec tool results", async () => {
    const embeddedExtensionFactories: Array<(pi: unknown) => void | Promise<void>> = [];

    openclawPlugin.register({
      registerEmbeddedExtensionFactory(factory) {
        embeddedExtensionFactories.push(factory);
      },
    });

    expect(embeddedExtensionFactories).toHaveLength(1);

    const handlers = new Map<string, Function>();
    embeddedExtensionFactories[0]?.({
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
            "\tmodified:   src/openclaw-plugin.ts",
            "\tmodified:   src/hosts/openclaw/extension.ts",
            "",
            "no changes added to commit",
          ].join("\n"),
        },
        isError: false,
      },
      { cwd: "/tmp/openclaw" },
    );

    expect(result?.content[0].text).toContain("M: src/openclaw-plugin.ts");
    expect(result?.content[0].text).toContain("tokenjuice compacted bash output");
    expect(result?.details?.tokenjuice?.compacted).toBe(true);
  });

  it("ignores non-exec tool results", async () => {
    const embeddedExtensionFactories: Array<(pi: unknown) => void | Promise<void>> = [];

    openclawPlugin.register({
      registerEmbeddedExtensionFactory(factory) {
        embeddedExtensionFactories.push(factory);
      },
    });

    const handlers = new Map<string, Function>();
    embeddedExtensionFactories[0]?.({
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
